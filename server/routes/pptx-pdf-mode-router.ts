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

export type PptxPdfOutputMode = 'narrative_summary' | 'faithful_accessible';

type PptxPdfModeRouterConfig = {
  routeBase: string;
  queueName: string;
  uploadDirName: string;
  resultsDirName: string;
  outputMode: PptxPdfOutputMode;
  defaultIncludeSpeakerNotes: boolean;
  enableDotsBeta?: boolean;
};

type ConvertRouteConfig = {
  pipelineMode: 'smart_legacy' | 'dots_first';
  routeLabel: 'convert' | 'convert-dots';
  dotsFailOpen: boolean;
};

const PDFUA_SERVICE_URL = process.env.PDFUA_SERVICE_URL || 'http://pdfua-service:8000';
const PDFUA_SERVICE_URL_V2 = process.env.PDFUA_SERVICE_URL_V2 || 'http://pdfua-service-v2:8000';
const PDFUA_NOTIFICATION_TTL_MS = Number(process.env.PDFUA_NOTIFICATION_TTL_MS || 24 * 60 * 60 * 1000);
const PDFUA_NOTIFICATION_POLL_INTERVAL_MS = Number(process.env.PDFUA_NOTIFICATION_POLL_INTERVAL_MS || 15000);

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const getPdfuaServiceCandidates = (processVersion?: string): string[] => {
  const primary = processVersion === '2' ? PDFUA_SERVICE_URL_V2 : PDFUA_SERVICE_URL;
  const secondary = processVersion === '2' ? PDFUA_SERVICE_URL : PDFUA_SERVICE_URL_V2;
  return Array.from(new Set([primary, secondary].filter(Boolean)));
};

const isHealthyEnough = (status: unknown) => {
  const normalized = String(status || '').trim().toLowerCase();
  return !normalized || normalized === 'ok' || normalized === 'healthy' || normalized === 'degraded';
};

const ensurePptxServiceReady = async (serviceUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      headers: buildInternalServiceHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return 'PDF/UA-Service-Healthcheck nicht erreichbar.';
    }

    const health = await response.json().catch(() => null);
    if (!isHealthyEnough((health as { status?: unknown })?.status)) {
      return 'PDF/UA-Service ist nicht bereit.';
    }
    return null;
  } catch {
    return 'PDF/UA-Service ist vorübergehend nicht erreichbar.';
  }
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
      return 'dots_first Beta ist nicht bereit: Dots ist deaktiviert.';
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

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
};

const buildStatusMeta = (
  resultData: any,
  inputData: any,
  outputModeDefault: PptxPdfOutputMode,
) => {
  const outputMode = String(resultData?.output_mode || inputData?.outputMode || outputModeDefault) as PptxPdfOutputMode;
  const requestedPipelineMode = String(
    resultData?.requested_pipeline_mode ||
    inputData?.requestedPipelineMode ||
    inputData?.pipelineMode ||
    'smart_legacy',
  );
  const effectivePipelineMode = String(
    resultData?.effective_pipeline_mode ||
    resultData?.pipeline_mode ||
    inputData?.pipelineMode ||
    requestedPipelineMode,
  );
  const fallbackReasons = normalizeStringArray(
    resultData?.fallback_reasons ?? resultData?.quality_flags?.fallback_reasons,
  );
  const fallbackUsed = Boolean(
    resultData?.fallback_used ||
    resultData?.quality_flags?.fallback_used ||
    fallbackReasons.length > 0 ||
    requestedPipelineMode !== effectivePipelineMode,
  );

  return {
    outputMode,
    pipelineMode: effectivePipelineMode,
    requestedPipelineMode,
    effectivePipelineMode,
    fallbackUsed,
    fallbackReasons,
    fusion: resultData?.fusion,
    qualityFlags: resultData?.quality_flags,
    technicalCompliance: String(resultData?.technical_compliance || resultData?.technicalCompliance || 'pending'),
    riskFlags: normalizeStringArray(resultData?.risk_flags ?? resultData?.riskFlags),
    degraded: Boolean(resultData?.degraded),
    degradedReasons: normalizeStringArray(resultData?.degraded_reasons ?? resultData?.degradedReasons),
    qaReportAvailable: Boolean(resultData?.qa_report_available ?? resultData?.qaReportAvailable),
  };
};

const mapJobRecordToStatus = (
  jobRecord: any,
  documentName: string | undefined,
  outputModeDefault: PptxPdfOutputMode,
) => {
  const statusMap: Record<string, string> = {
    pending: 'queued',
    active: 'processing',
    completed: 'completed',
    failed: 'failed',
  };
  const mappedStatus = statusMap[jobRecord.status] || 'processing';
  let inputData: any = null;
  let resultData: any = null;
  try {
    inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
  } catch {}
  try {
    resultData = typeof jobRecord.result_data === 'string' ? JSON.parse(jobRecord.result_data) : jobRecord.result_data;
  } catch {}

  const meta = buildStatusMeta(resultData, inputData, outputModeDefault);

  return {
    jobId: jobRecord.id,
    status: mappedStatus,
    stage: jobRecord.progress_stage || mappedStatus,
    percent: jobRecord.progress_percent ?? 0,
    documentName,
    queue: undefined as any,
    error: mappedStatus === 'failed' ? jobRecord.error_message || 'failed' : null,
    createdAt: jobRecord.created_at,
    completedAt: jobRecord.completed_at,
    ...meta,
  };
};

const storePdfResult = async (
  outputDir: string,
  jobId: string,
  downloadUrl: string,
  requestHeaders: Record<string, string>,
): Promise<string> => {
  ensureDir(outputDir);
  const outputPath = path.join(outputDir, `${jobId}.pdf`);
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
  outputDir: string,
  jobId: string,
  serviceUrls: string[],
  requestHeaders: Record<string, string>,
): Promise<string> => {
  let lastError: Error | null = null;
  for (const baseUrl of serviceUrls) {
    const downloadUrl = `${baseUrl}/jobs/${jobId}/download`;
    try {
      return await storePdfResult(outputDir, jobId, downloadUrl, requestHeaders);
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

export function createPptxPdfModeRouter(config: PptxPdfModeRouterConfig) {
  const router = Router();
  const summaryResultsDir = path.join(process.cwd(), 'uploads', config.resultsDirName);
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

          const pdfuaCompliant = String(status.result?.technical_compliance || 'pending') === 'pass';

          sendConversionCompleteEmail(
            notification.email,
            notification.filename,
            jobId,
            status.status === 'completed',
            pdfuaCompliant,
          ).finally(() => {
            setTimeout(() => pdfuaNotifications.delete(jobId), 60000);
          });
        } catch (error) {
          console.error(`[${config.routeBase}] Notification poller error:`, error);
        }
      }
    } finally {
      pdfuaNotificationPollerRunning = false;
    }
  }, PDFUA_NOTIFICATION_POLL_INTERVAL_MS);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads', config.uploadDirName);
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = safeExtensionFromOriginalName(file.originalname) || '.pptx';
      cb(null, `${uuidv4()}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
      if (
        file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        file.originalname.toLowerCase().endsWith('.pptx')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Only PPTX files are allowed'));
      }
    },
  });

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const response = await fetch(`${PDFUA_SERVICE_URL_V2}/health`, {
        headers: buildInternalServiceHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        return res.status(503).json({
          status: 'unhealthy',
          outputMode: config.outputMode,
          error: 'PDF/UA service unavailable',
        });
      }
      const normalizedStatus = String((payload as any)?.status || '').trim().toLowerCase();
      if (!isHealthyEnough(normalizedStatus)) {
        return res.status(503).json({
          status: 'unhealthy',
          outputMode: config.outputMode,
          service: payload,
          error: 'PDF/UA service unavailable',
        });
      }
      return res.json({
        status: normalizedStatus === 'ok' ? 'healthy' : normalizedStatus || 'healthy',
        outputMode: config.outputMode,
        service: payload,
      });
    } catch (error: any) {
      return res.status(503).json({
        status: 'unhealthy',
        outputMode: config.outputMode,
        error: error.message,
      });
    }
  });

  const handleConvertPdf = async (req: Request, res: Response, routeConfig: ConvertRouteConfig) => {
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

      if (validation.inputType !== 'pptx') {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: validation.error || 'Ungültiger Dateityp. Nur PPTX erlaubt.' });
      }

      const user = (req as any).user;
      if (!user) {
        fs.unlink(req.file.path, () => {});
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = user.id || null;
      const priority = user?.subscription ? getPriorityForSubscription(user.subscription) : 2;
      const quality = 'high';
      const processVersion = '2';
      const serviceUrl = PDFUA_SERVICE_URL_V2;
      const summaryMode = config.outputMode === 'narrative_summary';
      const includeSpeakerNotes = config.defaultIncludeSpeakerNotes;
      const notesPolicy = includeSpeakerNotes ? 'context_only' : 'ignore';
      const storageTarget = resolveStorageTarget(user, {
        scope: req.body.storageScope,
        workspaceId: req.body.workspaceId,
        projectId: req.body.projectId,
      });

      const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(user)
        : getOrCreateDefaultWorkspaceForUser(user);
      const planId = workspace.plan_id as PlanId;

      if (routeConfig.pipelineMode === 'dots_first') {
        const dotsReadyError = await ensureDotsBetaReady(serviceUrl);
        if (dotsReadyError) {
          fs.unlink(req.file.path, () => {});
          cleanupSanitizedInput();
          return res.status(503).json({ error: dotsReadyError });
        }
      }

      const slideCount = await getPptxSlideCount(req.file.path);
      let effectiveInputPath = req.file.path;

      try {
        const { sanitizePptxToFile } = await import('../utils/pptx-sanitizer.js');
        const { sanitizedPath } = await sanitizePptxToFile(effectiveInputPath, { includeSpeakerNotes });
        sanitizedInputPath = sanitizedPath;
        effectiveInputPath = sanitizedPath;
      } catch (sanitizeErr: any) {
        console.warn(`[${config.routeBase}] Sanitizer failed, continuing with original file: ${sanitizeErr?.message}`);
      }

      const estimatedCredits = slideCount * CREDIT_COSTS.PDFUA_SMART_SLIDE.credits;
      const wallet = ensureCreditWallet(workspace.id, planId);
      if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
        fs.unlink(req.file.path, () => {});
        cleanupSanitizedInput();
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(effectiveInputPath), {
        filename: req.file.originalname,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      formData.append('quality', quality);
      formData.append('priority', String(priority));
      formData.append('processVersion', processVersion);
      formData.append('summaryMode', summaryMode ? 'true' : 'false');
      formData.append('includeSpeakerNotes', includeSpeakerNotes ? 'true' : 'false');
      formData.append('pipelineMode', routeConfig.pipelineMode);
      formData.append('dotsFailOpen', routeConfig.dotsFailOpen ? 'true' : 'false');
      formData.append('outputMode', config.outputMode);

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

      const data = response.data as { job_id: string };

      if (estimatedCredits > 0) {
        try {
          reserveCredits(workspace.id, estimatedCredits, data.job_id, {
            costKey: 'PDFUA_SMART_SLIDE',
            slideCount,
          });
        } catch (error: any) {
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
        queue: config.queueName,
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
          pipelineMode: routeConfig.pipelineMode,
          requestedPipelineMode: routeConfig.pipelineMode,
          dotsFailOpen: routeConfig.dotsFailOpen,
          useDocling: false,
          summaryMode,
          includeSpeakerNotes,
          notesPolicy,
          outputMode: config.outputMode,
          notifyEmail: typeof req.body.notifyEmail === 'string' ? req.body.notifyEmail : null,
          slideCount,
          pageCount: 0,
        },
        expiresInHours: 48,
      });

      const notifyEmail = typeof req.body.notifyEmail === 'string' ? req.body.notifyEmail : undefined;
      if (notifyEmail) {
        pdfuaNotifications.set(data.job_id, {
          email: notifyEmail,
          filename: req.file.originalname,
          notified: false,
          createdAt: Date.now(),
          serviceUrl,
        });
      }

      fs.unlink(req.file.path, () => {});
      cleanupSanitizedInput();

      return res.json({
        jobId: data.job_id,
        status: 'processing',
        outputMode: config.outputMode,
        message: 'PDF/UA conversion started',
      });
    } catch (error: any) {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      cleanupSanitizedInput();
      const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message;
      if (errorMessage === 'workspace_forbidden' || errorMessage === 'project_forbidden') {
        return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
      }
      return res.status(error.response?.status || 500).json({ error: errorMessage });
    }
  };

  router.post('/convert', upload.single('file'), async (req: Request, res: Response) => {
    await handleConvertPdf(req, res, {
      pipelineMode: 'smart_legacy',
      routeLabel: 'convert',
      dotsFailOpen: true,
    });
  });

  if (config.enableDotsBeta) {
    router.post('/convert-dots', upload.single('file'), async (req: Request, res: Response) => {
      await handleConvertPdf(req, res, {
        pipelineMode: 'dots_first',
        routeLabel: 'convert-dots',
        dotsFailOpen: false,
      });
    });
  }

  router.get('/status/:jobId', async (req: Request, res: Response) => {
    try {
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

      let inputData: any = null;
      let documentName: string | undefined;
      try {
        inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
        documentName = inputData?.originalName;
      } catch {}

      const processVersion = inputData?.processVersion;
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
          console.error(`[${config.routeBase}] Status fetch error:`, error);
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
        }
        return res.json(mapJobRecordToStatus(jobRecord, documentName, config.outputMode));
      }

      if (!serviceResponse.ok) {
        if (serviceResponse.status >= 500) {
          return res.json(mapJobRecordToStatus(jobRecord, documentName, config.outputMode));
        }
        const errorText = await serviceResponse.text();
        return res.status(serviceResponse.status).json({ error: errorText });
      }

      const job = await serviceResponse.json();
      const resultData = job.result || {};
      const meta = buildStatusMeta(resultData, inputData, config.outputMode);
      const statusMap: Record<string, string> = {
        pending: 'queued',
        processing: 'processing',
        completed: 'completed',
        failed: 'failed',
      };
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
      const completedResultData = mappedStatus === 'completed' || mappedStatus === 'failed'
        ? { ...(resultData || {}) }
        : undefined;

      res.json({
        jobId: job.job_id,
        status: mappedStatus,
        stage: progress.phase || job.status,
        percent,
        documentName,
        queue,
        error: job.error,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        ...meta,
      });

      const storeStatus = mappedStatus === 'processing' ? 'active' : mappedStatus === 'queued' ? 'pending' : mappedStatus;
      updateJob(jobId, {
        status: storeStatus as any,
        progressStage: progress.phase || job.status,
        progressPercent: percent,
        resultData: completedResultData,
        completedAt: mappedStatus === 'completed' || mappedStatus === 'failed' ? new Date() : undefined,
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
        void storePdfResultWithFallback(summaryResultsDir, jobId, downloadCandidates, buildInternalServiceHeaders())
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
            console.error(`[${config.routeBase}] Failed to store result:`, err);
          });
      }
    } catch (error: any) {
      console.error(`[${config.routeBase}] Status error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

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

      return res.json({ success: true, message: 'Job cancelled' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

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
        return res.status(400).json({ error: `Job not completed. Current status: ${job.status}` });
      }

      const downloadCandidates = serviceUrlUsed
        ? [serviceUrlUsed, ...serviceCandidates.filter((url) => url !== serviceUrlUsed)]
        : serviceCandidates;
      const outputPath = await storePdfResultWithFallback(summaryResultsDir, jobId, downloadCandidates, buildInternalServiceHeaders());
      const filename = buildDownloadName(job.filename, '_pdfua.pdf', 'pdfua.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(fs.readFileSync(outputPath));
    } catch (error: any) {
      console.error(`[${config.routeBase}] Download error:`, error);
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}
