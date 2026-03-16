import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { pptxSummaryQueue, getQueueStats, getPriorityForSubscription } from '../queue/queues';
import { createJob, getJob } from '../queue/job-store';
import { detectFileType } from '../utils/file-type';
import { resolveStorageTarget } from '../utils/storage-target';
import { requireAuth } from '../auth/middleware';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';
import { getOrCreateDefaultWorkspaceForUser, getWorkspaceById, ensureCreditWallet, reserveCredits, releaseCredits } from '../db/queries';
import { CREDIT_COSTS, type PlanId } from '../billing/config';
import { getPptxSlideCount } from '../utils/pptx';

const router = Router();

// PPTX Summary service URL
const PPTX_SERVICE_URL = process.env.PPTX_SERVICE_URL || 'http://pptx-service:8003';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'pptx-input');
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

// Health check for PPTX service
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

// Queue stats
router.get('/queue-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats('pptx-summary');
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Convert PPTX to accessibility summary
router.post('/convert', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
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

    const user = (req as any).user;
    const userId = user.id as number;
    const subscription = user.subscription || 'free';

    // Create job
    const jobId = uuidv4();
    const priority = getPriorityForSubscription(subscription);

    const storageTarget = resolveStorageTarget(user, {
      scope: req.body.storageScope,
      workspaceId: req.body.workspaceId,
      projectId: req.body.projectId,
    });

    const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
      ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(user)
      : getOrCreateDefaultWorkspaceForUser(user);
    const planId = workspace.plan_id as PlanId;

    const slideCount = await getPptxSlideCount(req.file.path);
    if (planId === 'free' && slideCount > 10) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({
        error: 'Upgrade erforderlich',
        message: 'Free-Limit: max. 10 Slides für die PPT-Analyse.',
        requiredMinPlan: 'pro',
      });
    }

    ensureCreditWallet(workspace.id, planId);
    const estimatedCredits = Math.max(0, slideCount) * CREDIT_COSTS.PPT_SLIDE_ANALYZE.credits;
    try {
      if (estimatedCredits > 0) {
        reserveCredits(workspace.id, estimatedCredits, jobId, {
          costKey: 'PPT_SLIDE_ANALYZE',
          slideCount,
        });
      }
    } catch (error: any) {
      fs.unlink(req.file.path, () => {});
      const message = (error as Error)?.message || String(error);
      const status = message === 'insufficient_credits' ? 402 : 400;
      return res.status(status).json({ error: message === 'insufficient_credits' ? 'Nicht genug Credits' : message });
    }

    // Store job metadata in database
    createJob({
      id: jobId,
      queue: 'pptx-summary',
      userId,
      storageScope: storageTarget.scope,
      workspaceId: workspace.id,
      projectId: storageTarget.projectId || null,
      jobType: 'PPT_SLIDE_ANALYZE',
      estimatedCredits,
      priority,
      inputData: {
        originalName: req.file.originalname,
        inputFilePath: req.file.path,
        slideCount,
      },
    });

    // Add to queue
    try {
      await pptxSummaryQueue.add(
        'convert',
        {
          jobId,
          userId,
          inputFilePath: req.file.path,
          originalName: req.file.originalname,
          notifyEmail: req.body.notifyEmail,
          storageScope: storageTarget.scope,
          workspaceId: workspace.id,
          projectId: storageTarget.projectId || null,
        },
        {
          jobId,
          priority,
        }
      );
    } catch (error) {
      if (estimatedCredits > 0) {
        try { releaseCredits(workspace.id, estimatedCredits, jobId, { status: 'enqueue_failed' }); } catch {}
      }
      fs.unlink(req.file.path, () => {});
      throw error;
    }

    console.log(`[PPTX Routes] Job ${jobId} queued for: ${req.file.originalname}`);

    res.json({
      jobId,
      status: 'queued',
      message: 'PPTX summary generation started',
    });

  } catch (error: any) {
    console.error('[PPTX Routes] Upload error:', error);
    const message = (error as Error).message;
    if (message === 'workspace_forbidden' || message === 'project_forbidden') {
      return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get job status
router.get('/status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId,
      status: job.status,
      stage: job.progress_stage,
      percent: job.progress_percent,
      error: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      resultData: job.result_data ? JSON.parse(job.result_data) : null,
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download result
router.get('/download/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        error: `Job not completed. Current status: ${job.status}`,
      });
    }

    if (!job.result_file_path || !fs.existsSync(job.result_file_path)) {
      return res.status(404).json({ error: 'Result file not found' });
    }

    // Return JSON result
    const result = JSON.parse(fs.readFileSync(job.result_file_path, 'utf-8'));
    res.json(result);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
