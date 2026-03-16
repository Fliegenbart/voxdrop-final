import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import FormData from 'form-data';
import { createJob, updateJob, getJobForUserOrWorkspace, getPriorityForSubscription } from '../queue';
import { resolveStorageTarget } from '../utils/storage-target';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { sendConversionCompleteEmail } from '../email/service';
import { getOrCreateDefaultWorkspaceForUser, getWorkspaceById, ensureCreditWallet, reserveCredits } from '../db/queries';
import { CREDIT_COSTS, type PlanId } from '../billing/config';
import { getPptxSlideCount } from '../utils/pptx';
import { finalizeCreditsForJob } from '../billing/job-credits';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';
import { buildInternalServiceHeaders } from '../security/internal-service';
import { validateUploadByMagic } from '../security/upload-guards';

const router = Router();

// PDFUA Service URL (summary PDF/UA)
const PDFUA_SERVICE_URL = process.env.PDFUA_SERVICE_URL || 'http://pdfua-service:8000';
const PDFUA_SERVICE_URL_V2 = process.env.PDFUA_SERVICE_URL_V2 || 'http://pdfua-service-v2:8000';
const SUMMARY_RESULTS_DIR = path.join(process.cwd(), 'uploads', 'pptx-summary-pdf-results');
const PDFUA_NOTIFICATION_TTL_MS = Number(process.env.PDFUA_NOTIFICATION_TTL_MS || 24 * 60 * 60 * 1000);
const PDFUA_NOTIFICATION_POLL_INTERVAL_MS = Number(process.env.PDFUA_NOTIFICATION_POLL_INTERVAL_MS || 15000);

const pdfuaNotifications = new Map<string, { email: string; filename: string; notified: boolean; createdAt: number; serviceUrl: string }>();
let pdfuaNotificationPollerRunning = false;

setInterval(async () => {
  if (pdfuaNotificationPollerRunning || pdfuaNotifications.size === 0) {
    return;
  }

  pdfuaNotificationPollerRunning = true;
  const now = Date.now();

  try {
    for (const [jobId, notification] of pdfuaNotifications.entries()) {
      if (notification.notified) continue;
      if (now - notification.createdAt > PDFUA_NOTIFICATION_TTL_MS) {
        pdfuaNotifications.delete(jobId);
        continue;
      }

      try {
        const response = await fetch(`${notification.serviceUrl}/jobs/${jobId}`, {
          headers: buildInternalServiceHeaders(),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          continue;
        }

        const status = await response.json();
        if (status.status !== 'completed' && status.status !== 'failed') {
          continue;
        }

        notification.notified = true;
        pdfuaNotifications.set(jobId, notification);

        const pdfuaCompliant = status.result?.pdfua_compliant || false;

        sendConversionCompleteEmail(
          notification.email,
          notification.filename,
          jobId,
          status.status === 'completed',
          pdfuaCompliant
        ).then(result => {
          if (result.success) {
            console.log(`[PPTX Summary PDF] Email notification sent for job ${jobId}`);
          } else {
            console.error(`[PPTX Summary PDF] Failed to send email for job ${jobId}:`, result.error);
          }
          setTimeout(() => pdfuaNotifications.delete(jobId), 60000);
        });
      } catch (error) {
        console.error('[PPTX Summary PDF] Notification poller error:', error);
      }
    }
  } finally {
    pdfuaNotificationPollerRunning = false;
  }
}, PDFUA_NOTIFICATION_POLL_INTERVAL_MS);

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const getPdfuaServiceCandidates = (processVersion?: string): string[] => {
  const primary = processVersion === '2' ? PDFUA_SERVICE_URL_V2 : PDFUA_SERVICE_URL;
  const secondary = processVersion === '2' ? PDFUA_SERVICE_URL : PDFUA_SERVICE_URL_V2;
  return Array.from(new Set([primary, secondary].filter(Boolean)));
};

const ensurePptxServiceReady = async (serviceUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      headers: buildInternalServiceHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return 'PDFUA-Service-Healthcheck nicht erreichbar.';
    }

    const health = await response.json().catch(() => null);
    const status = typeof (health as { status?: unknown })?.status === 'string'
      ? (health as { status?: string }).status
      : null;
    if (status && status.toLowerCase() !== 'healthy' && status.toLowerCase() !== 'ok') {
      return 'PDFUA-Service ist nicht bereit (Status nicht healthy).';
    }
    return null;
  } catch {
    return 'PDFUA-Service ist vorübergehend nicht erreichbar.';
  }
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const ensureDotsBetaReady = async (serviceUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      headers: buildInternalServiceHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return 'dots_first Beta ist nicht bereit: PDFUA-Service-Healthcheck nicht erreichbar.';
    }

    const health = await response.json().catch(() => null);
    const dots = (health as any)?.dots ?? (health as any)?.service?.dots ?? null;
    const dotsEnabled = parseBoolean(dots?.enabled);
    const dotsAvailable = parseBoolean(dots?.available);
    if (!dotsEnabled) {
      return 'dots_first Beta ist nicht bereit: Dots ist deaktiviert (VD_DOTS_ENABLED=false).';
    }
    if (!dotsAvailable) {
      return 'dots_first Beta ist nicht bereit: Dots-Modell ist nicht erreichbar.';
    }
    return null;
  } catch {
    return 'dots_first Beta ist nicht bereit: PDFUA-Service ist vorübergehend nicht erreichbar.';
  }
};

const buildDownloadName = (originalName: string | undefined, suffix: string, fallback: string) => {
  if (!originalName) return fallback;
  const base = path.basename(originalName, path.extname(originalName));
  return `${base}${suffix}`;
};

const mapJobRecordToStatus = (jobRecord: any, documentName?: string) => {
  const statusMap: Record<string, string> = {
    pending: 'queued',
    active: 'processing',
    completed: 'completed',
    failed: 'failed',
  };
  const mappedStatus = statusMap[jobRecord.status] || 'processing';
  let docling = false;
  let pipelineMode = 'legacy';
  let requestedPipelineMode: string | undefined;
  let effectivePipelineMode: string | undefined;
  let fallbackUsed = false;
  let fallbackReasons: string[] = [];
  let fusion: any = undefined;
  let qualityFlags: any = undefined;
  try {
    const raw = jobRecord.result_data;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    docling = Boolean(parsed?.docling);
    if (typeof parsed?.pipeline_mode === 'string') {
      pipelineMode = parsed.pipeline_mode;
    }
    if (typeof parsed?.requested_pipeline_mode === 'string') {
      requestedPipelineMode = parsed.requested_pipeline_mode;
    }
    if (typeof parsed?.effective_pipeline_mode === 'string') {
      effectivePipelineMode = parsed.effective_pipeline_mode;
    }
    fallbackUsed = Boolean(parsed?.fallback_used ?? parsed?.quality_flags?.fallback_used);
    const reasonsRaw = parsed?.fallback_reasons ?? parsed?.quality_flags?.fallback_reasons;
    if (Array.isArray(reasonsRaw)) {
      fallbackReasons = reasonsRaw
        .map((item: unknown) => String(item || '').trim())
        .filter(Boolean);
    }
    fusion = parsed?.fusion;
    qualityFlags = parsed?.quality_flags;
  } catch {}
  try {
    const inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
    if (!requestedPipelineMode && typeof inputData?.requestedPipelineMode === 'string') {
      requestedPipelineMode = inputData.requestedPipelineMode;
    }
    if (!requestedPipelineMode && typeof inputData?.pipelineMode === 'string') {
      requestedPipelineMode = inputData.pipelineMode;
    }
    if ((!pipelineMode || pipelineMode === 'legacy') && typeof inputData?.pipelineMode === 'string') {
      pipelineMode = inputData.pipelineMode;
    }
  } catch {}
  if (!effectivePipelineMode) {
    effectivePipelineMode = pipelineMode;
  }
  if (!requestedPipelineMode) {
    requestedPipelineMode = pipelineMode;
  }
  if (effectivePipelineMode !== requestedPipelineMode && !fallbackUsed) {
    fallbackUsed = true;
  }
  if (fallbackReasons.length > 0) {
    fallbackUsed = true;
  }
  return {
    jobId: jobRecord.id,
    status: mappedStatus,
    stage: jobRecord.progress_stage || mappedStatus,
    percent: jobRecord.progress_percent ?? 0,
    documentName,
    docling,
    pipelineMode: effectivePipelineMode,
    requestedPipelineMode,
    effectivePipelineMode,
    fallbackUsed,
    fallbackReasons,
    fusion,
    qualityFlags,
    queue: undefined as any,
    error: mappedStatus === 'failed' ? jobRecord.error_message || 'failed' : null,
    createdAt: jobRecord.created_at,
    completedAt: jobRecord.completed_at,
  };
};

const storePdfResult = async (jobId: string, downloadUrl: string, requestHeaders: Record<string, string>): Promise<string> => {
  ensureDir(SUMMARY_RESULTS_DIR);
  const outputPath = path.join(SUMMARY_RESULTS_DIR, `${jobId}.pdf`);
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const downloadResponse = await fetch(downloadUrl, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(120000),
  });

  if (!downloadResponse.ok || !downloadResponse.body) {
    throw new Error(`Failed to download PDF: ${downloadResponse.status}`);
  }

  const writable = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(downloadResponse.body as any), writable);
  return outputPath;
};

const storePdfResultWithFallback = async (
  jobId: string,
  serviceUrls: string[],
  requestHeaders: Record<string, string>,
): Promise<string> => {
  let lastError: Error | null = null;
  for (const baseUrl of serviceUrls) {
    const downloadUrl = `${baseUrl}/jobs/${jobId}/download`;
    try {
      return await storePdfResult(jobId, downloadUrl, requestHeaders);
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = String(lastError.message || '');
      if (!message.includes('404')) {
        throw lastError;
      }
    }
  }
  throw lastError || new Error('Failed to download PDF');
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'pptx-summary-pdf');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = safeExtensionFromOriginalName(file.originalname) || '.pptx';
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        file.originalname.toLowerCase().endsWith('.pptx')) {
      cb(null, true);
    } else {
      cb(new Error('Only PPTX files are allowed'));
    }
  },
});

// Health check
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${PDFUA_SERVICE_URL}/health`, {
      headers: buildInternalServiceHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const health = await response.json();
      res.json({
        status: 'healthy',
        service: health,
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        error: 'PPTX service unavailable',
      });
    }
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

type ConvertSummaryRouteConfig = {
  pipelineMode: 'smart_legacy' | 'dots_first';
  routeLabel: 'convert' | 'convert-dots';
  dotsFailOpen: boolean;
};

const handleConvertSummaryPdf = async (
  req: Request,
  res: Response,
  config: ConvertSummaryRouteConfig,
) => {
  let sanitizedInputPath: string | null = null;
  const cleanupSanitizedInput = () => {
    if (!sanitizedInputPath) return;
    try { fs.unlinkSync(sanitizedInputPath); } catch {}
    sanitizedInputPath = null;
  };

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const validation = await validateUploadByMagic(req.file.path, req.file.originalname, [
      {
        type: 'pptx',
        exts: ['.pptx'],
        mimeTypes: [
          'application/zip',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
      },
    ]);

    const inputType = validation.inputType;
    if (inputType !== 'pptx') {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: validation.error || 'Ungültiger Dateityp. Nur PPTX erlaubt.' });
    }

    console.log(`[PDFUA] Starting conversion (${inputType}, mode=${config.pipelineMode}): ${req.file.originalname}`);

    const user = (req as any).user;
    const userId = user?.id || null;
    const priority = user?.subscription ? getPriorityForSubscription(user.subscription) : 2;
    const quality = 'high';
    const processVersion = '2';
    const serviceUrl = processVersion === '2' ? PDFUA_SERVICE_URL_V2 : PDFUA_SERVICE_URL;
    const summaryMode = true;
    const pipelineMode = config.pipelineMode;
    const dotsFailOpen = Boolean(config.dotsFailOpen);
    const useDoclingEffective = false;
    const includeSpeakerNotes = false;
    const notifyEmail = typeof req.body.notifyEmail === 'string' ? req.body.notifyEmail : undefined;
    const storageTarget = user
      ? resolveStorageTarget(user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        })
      : { scope: 'user' as const };

    if (!user) {
      fs.unlink(req.file.path, () => {});
      cleanupSanitizedInput();
      return res.status(401).json({ error: 'Authentication required' });
    }

    const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
      ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(user)
      : getOrCreateDefaultWorkspaceForUser(user);
    const planId = workspace.plan_id as PlanId;

    if (pipelineMode === 'dots_first') {
      const dotsReadyError = await ensureDotsBetaReady(serviceUrl);
      if (dotsReadyError) {
        fs.unlink(req.file.path, () => {});
        cleanupSanitizedInput();
        return res.status(503).json({ error: dotsReadyError });
      }
    }

    const slideCount = await getPptxSlideCount(req.file.path);
    let effectiveInputPath = req.file.path;

    // Fixed smart_legacy path: sanitize PPTX before upload.
    if (pipelineMode === 'smart_legacy') {
      try {
        const { sanitizePptxToFile } = await import('../utils/pptx-sanitizer.js');
        console.log(`[PPTX-Sanitizer] Starting sanitization of ${effectiveInputPath}`);
        const { sanitizedPath, stats } = await sanitizePptxToFile(effectiveInputPath, { includeSpeakerNotes });
        sanitizedInputPath = sanitizedPath;
        effectiveInputPath = sanitizedPath;
        console.log(`[PPTX-Sanitizer] Using sanitized file: ${sanitizedPath} (commentFiles=${stats.removedCommentFiles})`);
      } catch (sanitizeErr: any) {
        console.warn(`[PPTX-Sanitizer] Non-fatal error, continuing with original file: ${sanitizeErr?.message}`);
      }
    }

    const estimatedCredits = slideCount * CREDIT_COSTS.PDFUA_SMART_SLIDE.credits;
    const wallet = ensureCreditWallet(workspace.id, planId);
    if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
      fs.unlink(req.file.path, () => {});
      cleanupSanitizedInput();
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }

    // Create FormData with form-data package (works reliably with axios)
    const formData = new FormData();
    formData.append('file', fs.createReadStream(effectiveInputPath), {
      filename: req.file.originalname,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    formData.append('quality', quality);
    formData.append('priority', String(priority));
    formData.append('includeSpeakerNotes', 'false');

    // Send to PDFUA service using axios.
    formData.append('processVersion', processVersion);
    formData.append('useDocling', 'false');
    formData.append('pipelineMode', pipelineMode);
    formData.append('dotsFailOpen', dotsFailOpen ? 'true' : 'false');
    const serviceReadyError = await ensurePptxServiceReady(serviceUrl);
    if (serviceReadyError) {
      fs.unlink(req.file.path, () => {});
      cleanupSanitizedInput();
      return res.status(503).json({ error: serviceReadyError });
    }

    const response = await axios.post(`${serviceUrl}/convert-summary`, formData, {
      headers: buildInternalServiceHeaders(formData.getHeaders() as Record<string, string>),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000,
    });

    const data = response.data as { job_id: string; status: string; message: string };

    if (estimatedCredits > 0) {
      try {
        reserveCredits(workspace.id, estimatedCredits, data.job_id, {
          costKey: 'PDFUA_SMART_SLIDE',
          slideCount,
        });
      } catch (error: any) {
        // Best-effort cancel if we can't reserve due to a race.
        try {
          await fetch(`${serviceUrl}/jobs/${data.job_id}/cancel`, {
            method: 'POST',
            headers: buildInternalServiceHeaders(),
            signal: AbortSignal.timeout(5000),
          });
        } catch {}
        fs.unlink(req.file.path, () => {});
        cleanupSanitizedInput();
        const message = (error as Error)?.message || String(error);
        const status = message === 'insufficient_credits' ? 402 : 400;
        return res.status(status).json({ error: message === 'insufficient_credits' ? 'Nicht genug Credits' : message });
      }
    }

    createJob({
      id: data.job_id,
      queue: 'pptx-summary-pdf',
      userId,
      storageScope: storageTarget.scope,
      workspaceId: workspace.id,
      projectId: storageTarget.projectId || null,
      jobType: 'PDFUA_SMART_SLIDE',
      estimatedCredits,
      inputData: {
        originalName: req.file.originalname,
        outputFormat: 'pdfua',
        inputType: 'pptx',
        quality,
        processVersion,
        pipelineMode,
        requestedPipelineMode: pipelineMode,
        dotsFailOpen,
        useDocling: useDoclingEffective,
        summaryMode,
        includeSpeakerNotes,
        notifyEmail: notifyEmail || null,
        slideCount,
        pageCount: 0,
      },
      expiresInHours: 48,
    });

    if (notifyEmail) {
      pdfuaNotifications.set(data.job_id, {
        email: notifyEmail,
        filename: req.file.originalname,
        notified: false,
        createdAt: Date.now(),
        serviceUrl,
      });
    }

    // Clean up uploaded file
    fs.unlink(req.file.path, () => {});
    cleanupSanitizedInput();

    console.log(`[PPTX Summary PDF][${config.routeLabel}] Job created: ${data.job_id}`);

    res.json({
      jobId: data.job_id,
      status: 'processing',
      message: 'PDF/UA conversion started',
    });

  } catch (error: any) {
    console.error(`[PPTX Summary PDF][${config.routeLabel}] Upload error:`, error.response?.data || error.message);
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    cleanupSanitizedInput();
    const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message;
    if (errorMessage === 'workspace_forbidden' || errorMessage === 'project_forbidden') {
      return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
    }
    res.status(error.response?.status || 500).json({ error: errorMessage });
  }
};

// Convert PPTX to summary PDF (stable production path)
router.post('/convert', upload.single('file'), async (req: Request, res: Response) => {
  await handleConvertSummaryPdf(req, res, {
    pipelineMode: 'smart_legacy',
    routeLabel: 'convert',
    dotsFailOpen: true,
  });
});

// Convert PPTX to summary PDF (beta dots-first path)
router.post('/convert-dots', upload.single('file'), async (req: Request, res: Response) => {
  await handleConvertSummaryPdf(req, res, {
    pipelineMode: 'dots_first',
    routeLabel: 'convert-dots',
    dotsFailOpen: false,
  });
});

// Get job status
router.get('/status/:jobId', async (req: Request, res: Response) => {
  try {
    // Prevent Express/browser caching from turning status polling into 304 responses.
    // Clients expect JSON on every poll; a 304 can break `response.json()` and stall the UI.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('ETag', crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex'));

    const { jobId } = req.params;
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const jobRecord = getJobForUserOrWorkspace(jobId, userId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }
    let documentName: string | undefined;
    let processVersion: string | undefined;
    let pipelineModeInput: string | undefined;
    let requestedPipelineModeInput: string | undefined;
    try {
      const inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
      documentName = inputData?.originalName;
      processVersion = inputData?.processVersion;
      pipelineModeInput = inputData?.pipelineMode;
      requestedPipelineModeInput = inputData?.requestedPipelineMode || inputData?.pipelineMode;
    } catch {}
    const serviceCandidates = getPdfuaServiceCandidates(processVersion);

    let serviceResponse: globalThis.Response | null = null;
    let serviceUrlUsed: string | null = null;
    let saw404 = false;
    let sawFetchError = false;
    for (const serviceUrl of serviceCandidates) {
      try {
        const candidateResponse = await fetch(`${serviceUrl}/jobs/${jobId}`, {
          headers: buildInternalServiceHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (candidateResponse.status === 404) {
          saw404 = true;
          continue;
        }
        serviceResponse = candidateResponse;
        serviceUrlUsed = serviceUrl;
        break;
      } catch (error) {
        sawFetchError = true;
        console.error('[PPTX Summary PDF] Status fetch error:', error);
      }
    }

    if (!serviceResponse) {
      if (saw404 && !sawFetchError) {
        const alreadyTerminal = ['completed', 'failed'].includes(String(jobRecord.status || '').toLowerCase());
        if (!alreadyTerminal) {
          updateJob(jobId, {
            status: 'failed',
            progressStage: 'lost',
            progressPercent: jobRecord.progress_percent ?? 0,
            completedAt: new Date(),
            errorMessage: 'upstream_job_not_found',
          });
          finalizeCreditsForJob(jobId, 'failed');
        }
        return res.json({
          jobId,
          status: 'failed',
          stage: 'lost',
          percent: jobRecord.progress_percent ?? 0,
          documentName,
          docling: false,
          pipelineMode: pipelineModeInput || 'legacy',
          requestedPipelineMode: requestedPipelineModeInput || pipelineModeInput || 'legacy',
          effectivePipelineMode: pipelineModeInput || 'legacy',
          fallbackUsed: false,
          fallbackReasons: [],
          fusion: undefined as any,
          qualityFlags: undefined as any,
          queue: undefined as any,
          error: 'Job wurde auf dem PDF/UA-Service nicht gefunden (z. B. nach Service-Neustart). Bitte Konvertierung neu starten.',
          createdAt: jobRecord.created_at,
          completedAt: new Date(),
        });
      }
      return res.json(mapJobRecordToStatus(jobRecord, documentName));
    }

    if (!serviceResponse.ok) {
      if (serviceResponse.status === 404) {
        const alreadyTerminal = ['completed', 'failed'].includes(String(jobRecord.status || '').toLowerCase());
        if (!alreadyTerminal) {
          updateJob(jobId, {
            status: 'failed',
            progressStage: 'lost',
            progressPercent: jobRecord.progress_percent ?? 0,
            completedAt: new Date(),
            errorMessage: 'upstream_job_not_found',
          });
          finalizeCreditsForJob(jobId, 'failed');
        }

        return res.json({
          jobId,
          status: 'failed',
          stage: 'lost',
          percent: jobRecord.progress_percent ?? 0,
          documentName,
          docling: false,
          pipelineMode: pipelineModeInput || 'legacy',
          requestedPipelineMode: requestedPipelineModeInput || pipelineModeInput || 'legacy',
          effectivePipelineMode: pipelineModeInput || 'legacy',
          fallbackUsed: false,
          fallbackReasons: [],
          fusion: undefined as any,
          qualityFlags: undefined as any,
          queue: undefined as any,
          error: 'Job wurde auf dem PDF/UA-Service nicht gefunden (z. B. nach Service-Neustart). Bitte Konvertierung neu starten.',
          createdAt: jobRecord.created_at,
          completedAt: new Date(),
        });
      }
      if (serviceResponse.status >= 500) {
        return res.json(mapJobRecordToStatus(jobRecord, documentName));
      }
      const errorText = await serviceResponse.text();
      return res.status(serviceResponse.status).json({ error: errorText });
    }

    const job = await serviceResponse.json();
    const docling = Boolean(job?.result?.docling);
    const requestedPipelineMode = String(
      job?.result?.requested_pipeline_mode
      || requestedPipelineModeInput
      || pipelineModeInput
      || (docling ? 'docling' : 'legacy')
    );
    const effectivePipelineMode = String(
      job?.result?.effective_pipeline_mode
      || job?.result?.pipeline_mode
      || pipelineModeInput
      || (docling ? 'docling' : 'legacy')
    );
    const pipelineMode = effectivePipelineMode;
    const fallbackReasonsRaw = job?.result?.fallback_reasons ?? job?.result?.quality_flags?.fallback_reasons;
    const fallbackReasons = Array.isArray(fallbackReasonsRaw)
      ? fallbackReasonsRaw.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const fallbackUsed = Boolean(
      job?.result?.fallback_used
      || job?.result?.quality_flags?.fallback_used
      || fallbackReasons.length > 0
      || requestedPipelineMode !== effectivePipelineMode
    );
    const fusion = job?.result?.fusion;
    const qualityFlags = job?.result?.quality_flags;

    // Map pptx-service status to our format
    const statusMap: Record<string, string> = {
      pending: 'queued',
      processing: 'processing',
      completed: 'completed',
      failed: 'failed',
    };

    // Extract progress info from nested structure
    const progress = job.progress || {};
    const percent = progress.percent ?? progress.percentage ?? 0;
    const queueInfo = job.queue;
    const queue = queueInfo
      ? {
          position: queueInfo.position,
          totalInQueue: queueInfo.total,
          estimatedWaitMinutes: queueInfo.estimated_wait_seconds
            ? Math.ceil(queueInfo.estimated_wait_seconds / 60)
            : 0,
        }
      : undefined;

    let mappedStatus = statusMap[job.status] || job.status;
    if (progress.phase === 'gpu_queue') {
      mappedStatus = 'queued';
    }
    const completedResultData = mappedStatus === 'completed' ? { ...(job.result || {}), docling } : undefined;

    res.json({
      jobId: job.job_id,
      status: mappedStatus,
      stage: progress.phase || job.status,
      percent,
      documentName,
      docling,
      pipelineMode,
      requestedPipelineMode,
      effectivePipelineMode,
      fallbackUsed,
      fallbackReasons,
      fusion,
      qualityFlags,
      queue,
      error: job.error,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    });

    const storeStatus = mappedStatus === 'processing' ? 'active' : mappedStatus === 'queued' ? 'pending' : mappedStatus;
    updateJob(jobId, {
      status: storeStatus as any,
      progressStage: progress.phase || job.status,
      progressPercent: percent,
      resultData: completedResultData,
      completedAt: mappedStatus === 'completed' ? new Date() : undefined,
      errorMessage: mappedStatus === 'failed' ? job.error || 'failed' : undefined,
    });

    if (mappedStatus === 'completed') {
      finalizeCreditsForJob(jobId, 'completed');
    } else if (mappedStatus === 'failed') {
      finalizeCreditsForJob(jobId, 'failed');
    }

    if (mappedStatus === 'completed' && (!jobRecord.result_file_path || !fs.existsSync(jobRecord.result_file_path))) {
      const downloadCandidates = serviceUrlUsed
        ? [serviceUrlUsed, ...serviceCandidates.filter((url) => url !== serviceUrlUsed)]
        : serviceCandidates;
      void storePdfResultWithFallback(jobId, downloadCandidates, buildInternalServiceHeaders())
        .then((outputPath) => {
          updateJob(jobId, {
            resultFilePath: outputPath,
            resultData: {
              ...(completedResultData || {}),
              storedAt: new Date().toISOString(),
            },
          });
        })
        .catch((err) => {
          console.error('[PPTX Summary PDF] Failed to store result:', err);
        });
    }

  } catch (error: any) {
    console.error('[PPTX Summary PDF] Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
router.post('/cancel/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const jobRecord = getJobForUserOrWorkspace(jobId, userId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let processVersion: string | undefined;
    try {
      const inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
      processVersion = inputData?.processVersion;
    } catch {}
    const serviceUrl = processVersion === '2' ? PDFUA_SERVICE_URL_V2 : PDFUA_SERVICE_URL;

    const response = await fetch(`${serviceUrl}/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: buildInternalServiceHeaders(),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText || 'Cancel failed' });
    }

    updateJob(jobId, {
      status: 'failed',
      progressStage: 'cancelled',
      progressPercent: 0,
      errorMessage: 'cancelled',
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'cancelled');

    res.json({ success: true, message: 'Job cancelled' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download PDF result
router.get('/download/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const jobRecord = getJobForUserOrWorkspace(jobId, userId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (jobRecord.result_file_path && fs.existsSync(jobRecord.result_file_path)) {
      let originalName: string | undefined;
      try {
        const inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
        originalName = inputData?.originalName;
      } catch {}
      const filename = buildDownloadName(originalName, '_pdfua.pdf', 'pdfua.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(fs.readFileSync(jobRecord.result_file_path));
    }

    // First check job status
    let processVersion: string | undefined;
    try {
      const inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
      processVersion = inputData?.processVersion;
    } catch {}
    const serviceCandidates = getPdfuaServiceCandidates(processVersion);
    let statusResponse: globalThis.Response | null = null;
    let serviceUrlUsed: string | null = null;
    for (const serviceUrl of serviceCandidates) {
      const candidate = await fetch(`${serviceUrl}/jobs/${jobId}`, {
        headers: buildInternalServiceHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (candidate.status === 404) {
        continue;
      }
      statusResponse = candidate;
      serviceUrlUsed = serviceUrl;
      break;
    }

    if (!statusResponse) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!statusResponse.ok) {
      return res.status(statusResponse.status).json({ error: 'Failed to get job status' });
    }

    const job = await statusResponse.json();

    if (job.status !== 'completed') {
      return res.status(400).json({
        error: `Job not completed. Current status: ${job.status}`,
      });
    }

    const downloadCandidates = serviceUrlUsed
      ? [serviceUrlUsed, ...serviceCandidates.filter((url) => url !== serviceUrlUsed)]
      : serviceCandidates;
    const outputPath = await storePdfResultWithFallback(jobId, downloadCandidates, buildInternalServiceHeaders());
    const filename = buildDownloadName(job.filename, '_pdfua.pdf', 'pdfua.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fs.readFileSync(outputPath));

  } catch (error: any) {
    console.error('[PPTX Summary PDF] Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
