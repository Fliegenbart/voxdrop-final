import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import FormData from 'form-data';
import { detectFileType } from '../utils/file-type';
import { createJob, updateJob, getJobForUserOrWorkspace } from '../queue';
import { resolveStorageTarget } from '../utils/storage-target';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getOrCreateDefaultWorkspaceForUser, getWorkspaceById, ensureCreditWallet, reserveCredits } from '../db/queries';
import { CREDIT_COSTS, type PlanId } from '../billing/config';
import { getPptxSlideCount } from '../utils/pptx';
import { finalizeCreditsForJob } from '../billing/job-credits';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';

const router = Router();

// PPTX Service URL
const PPTX_SERVICE_URL = process.env.PPTX_SERVICE_URL || 'http://pptx-service:8003';
const HTML_RESULTS_DIR = path.join(process.cwd(), 'uploads', 'pptx-html-results');

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const buildDownloadName = (originalName: string | undefined, suffix: string, fallback: string) => {
  if (!originalName) return fallback;
  const base = path.basename(originalName, path.extname(originalName));
  return `${base}${suffix}`;
};

const storeHtmlResult = async (jobId: string, downloadUrl: string): Promise<string> => {
  ensureDir(HTML_RESULTS_DIR);
  const outputPath = path.join(HTML_RESULTS_DIR, `${jobId}.html`);
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const downloadResponse = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(120000),
  });

  if (!downloadResponse.ok || !downloadResponse.body) {
    throw new Error(`Failed to download HTML: ${downloadResponse.status}`);
  }

  const writable = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(downloadResponse.body as any), writable);
  return outputPath;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'pptx-html-accessible');
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
    const response = await fetch(`${PPTX_SERVICE_URL}/health`, {
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

// Convert PPTX to accessible HTML
router.post('/convert', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const detected = await detectFileType(req.file.path);
    const detectedMime = detected?.mime;
    const isPptx = ext === '.pptx' && (detectedMime === 'application/zip' || detectedMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    if (!isPptx) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Ungültiger Dateityp. Nur PPTX erlaubt.' });
    }

    console.log(`[PPTX Accessible HTML] Starting conversion: ${req.file.originalname}`);

    const user = (req as any).user;
    const userId = user?.id || null;
    const storageTarget = user
      ? resolveStorageTarget(user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        })
      : { scope: 'user' as const };

    if (!user) {
      fs.unlink(req.file.path, () => {});
      return res.status(401).json({ error: 'Authentication required' });
    }

    const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
      ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(user)
      : getOrCreateDefaultWorkspaceForUser(user);
    const planId = workspace.plan_id as PlanId;

    const slideCount = await getPptxSlideCount(req.file.path);
    const estimatedCredits = slideCount * CREDIT_COSTS.PDFUA_SMART_SLIDE.credits;
    const wallet = ensureCreditWallet(workspace.id, planId);
    if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
      fs.unlink(req.file.path, () => {});
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }

    // Create FormData with form-data package (works reliably with axios)
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    // Send to pptx-service using axios
    const response = await axios.post(`${PPTX_SERVICE_URL}/convert-to-html`, formData, {
      headers: formData.getHeaders(),
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
          await fetch(`${PPTX_SERVICE_URL}/jobs/${data.job_id}/cancel`, { method: 'POST', signal: AbortSignal.timeout(5000) });
        } catch {}
        fs.unlink(req.file.path, () => {});
        const message = (error as Error)?.message || String(error);
        const status = message === 'insufficient_credits' ? 402 : 400;
        return res.status(status).json({ error: message === 'insufficient_credits' ? 'Nicht genug Credits' : message });
      }
    }

    createJob({
      id: data.job_id,
      queue: 'pptx-html',
      userId,
      storageScope: storageTarget.scope,
      workspaceId: workspace.id,
      projectId: storageTarget.projectId || null,
      jobType: 'PDFUA_SMART_SLIDE',
      estimatedCredits,
      inputData: {
        originalName: req.file.originalname,
        outputFormat: 'html',
        slideCount,
      },
      expiresInHours: 48,
    });

    // Clean up uploaded file
    fs.unlink(req.file.path, () => {});

    console.log(`[PPTX Accessible HTML] Job created: ${data.job_id}`);

    res.json({
      jobId: data.job_id,
      status: 'processing',
      message: 'HTML conversion started',
    });

  } catch (error: any) {
    console.error('[PPTX Accessible HTML] Upload error:', error.response?.data || error.message);
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message;
    if (errorMessage === 'workspace_forbidden' || errorMessage === 'project_forbidden') {
      return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
    }
    res.status(error.response?.status || 500).json({ error: errorMessage });
  }
});

// Get job status
router.get('/status/:jobId', async (req: Request, res: Response) => {
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
    let documentName: string | undefined;
    try {
      const inputData = jobRecord.input_data ? JSON.parse(jobRecord.input_data) : null;
      documentName = inputData?.originalName;
    } catch {}

    const response = await fetch(`${PPTX_SERVICE_URL}/jobs/${jobId}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Job not found' });
      }
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const job = await response.json();

    // Map pptx-service status to our format
    const statusMap: Record<string, string> = {
      pending: 'queued',
      processing: 'processing',
      completed: 'completed',
      failed: 'failed',
    };

    // Extract progress info from nested structure
    const progress = job.progress || {};

    res.json({
      jobId: job.job_id,
      status: statusMap[job.status] || job.status,
      stage: progress.phase || job.status,
      percent: progress.percent || 0,
      documentName,
      error: job.error,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    });

    const mappedStatus = statusMap[job.status] || job.status;
    const storeStatus = mappedStatus === 'processing' ? 'active' : mappedStatus === 'queued' ? 'pending' : mappedStatus;
    updateJob(jobId, {
      status: storeStatus as any,
      progressStage: progress.phase || job.status,
      progressPercent: progress.percent || 0,
      completedAt: mappedStatus === 'completed' ? new Date() : undefined,
      errorMessage: mappedStatus === 'failed' ? job.error || 'failed' : undefined,
    });

    if (mappedStatus === 'completed') {
      finalizeCreditsForJob(jobId, 'completed');
    } else if (mappedStatus === 'failed') {
      finalizeCreditsForJob(jobId, 'failed');
    }

    if (mappedStatus === 'completed' && (!jobRecord.result_file_path || !fs.existsSync(jobRecord.result_file_path))) {
      const downloadUrl = `${PPTX_SERVICE_URL}/jobs/${jobId}/download-html`;
      void storeHtmlResult(jobId, downloadUrl)
        .then((outputPath) => {
          updateJob(jobId, {
            resultFilePath: outputPath,
            resultData: {
              storedAt: new Date().toISOString(),
            },
          });
        })
        .catch((err) => {
          console.error('[PPTX Accessible HTML] Failed to store result:', err);
        });
    }

  } catch (error: any) {
    console.error('[PPTX Accessible HTML] Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download HTML result
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
      const filename = buildDownloadName(originalName, '_accessible.html', 'accessible.html');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(fs.readFileSync(jobRecord.result_file_path));
    }

    // First check job status
    const statusResponse = await fetch(`${PPTX_SERVICE_URL}/jobs/${jobId}`);

    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        return res.status(404).json({ error: 'Job not found' });
      }
      return res.status(statusResponse.status).json({ error: 'Failed to get job status' });
    }

    const job = await statusResponse.json();

    if (job.status !== 'completed') {
      return res.status(400).json({
        error: `Job not completed. Current status: ${job.status}`,
      });
    }

    const downloadUrl = `${PPTX_SERVICE_URL}/jobs/${jobId}/download-html`;
    const outputPath = await storeHtmlResult(jobId, downloadUrl);
    const filename = buildDownloadName(job.filename, '_accessible.html', 'accessible.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fs.readFileSync(outputPath));

  } catch (error: any) {
    console.error('[PPTX Accessible HTML] Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
