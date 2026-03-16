import { Express, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { detectFileType } from '../utils/file-type';
import { getTmpDir, tmpPath } from '../utils/tmp';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';
import { computeFileSha256, persistJobInputFile, persistJobTextFile, persistJobUploadedFile } from '../utils/job-inputs';
import { gpuRateLimit, checkUsageLimit } from '../auth/middleware';
import type { User } from '../types/auth';
import { getOrCreateDefaultWorkspaceForUser, getWorkspaceById, getWorkspaceMember, ensureCreditWallet, reserveCredits, releaseCredits } from '../db/queries';
import { resolveStorageTarget } from '../utils/storage-target';
import { getSessionFile } from '../services/session-storage';
import { CREDIT_COSTS, type PlanId } from '../billing/config';
import { finalizeCreditsForJob } from '../billing/job-credits';
import { getMediaDurationSeconds } from '../utils/media';
import {
  videoConversionQueue,
  chapterSplittingQueue,
  transcriptionQueue,
  subtitleEmbedQueue,
  pdfuaQueue,
  ollamaQueue,
  pptxSummaryQueue,
  podcastQueue,
  getPriorityForSubscription,
  createJob,
  getJobForUserOrWorkspace,
  getJobsForUser,
  getJobsForWorkspace,
  deleteJob,
  sseManager,
  isRedisAvailable,
} from '../queue';

// Multer configuration for file uploads
const upload = multer({
  dest: getTmpDir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

const SESSION_SUBTITLE_FIELD_LIMIT_BYTES = 20 * 1024 * 1024;
const sessionSubtitleUpload = multer({
  dest: getTmpDir(),
  limits: {
    // Session subtitle embedding only accepts optional font and optional SRT upload.
    fileSize: 100 * 1024 * 1024,
    // Keep backward compatibility with clients still sending inline srtContent text fields.
    fieldSize: SESSION_SUBTITLE_FIELD_LIMIT_BYTES,
    files: 2,
    fields: 32,
  },
});

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/mpeg',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo'
]);

const ALLOWED_FONT_TYPES = new Set([
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/x-font-ttf',
  'application/x-font-otf'
]);

const SOFT_SUBTITLE_SIZE_THRESHOLD_MB = Number(process.env.VOXDROP_SOFT_SUBTITLE_SIZE_MB || 120);
const SOFT_SUBTITLE_SIZE_THRESHOLD_BYTES = Math.max(1, SOFT_SUBTITLE_SIZE_THRESHOLD_MB) * 1024 * 1024;
const SOFT_SUBTITLE_WEBM_SIZE_THRESHOLD_MB = Number(process.env.VOXDROP_SOFT_SUBTITLE_WEBM_SIZE_MB || 40);
const SOFT_SUBTITLE_WEBM_SIZE_THRESHOLD_BYTES = Math.max(1, SOFT_SUBTITLE_WEBM_SIZE_THRESHOLD_MB) * 1024 * 1024;
const RETRY_ATTEMPTS = 3;

type SubtitleTypeContext = {
  mimeType?: string | null;
  originalName?: string | null;
};

function isLikelyWebmVideo(context: SubtitleTypeContext): boolean {
  const mimeType = String(context.mimeType || '').toLowerCase();
  if (mimeType.includes('webm')) return true;
  const originalName = String(context.originalName || '').toLowerCase();
  return originalName.endsWith('.webm');
}

function selectSubtitleType(
  rawType: unknown,
  fileSizeBytes: number,
  context: SubtitleTypeContext = {}
): 'hardcoded' | 'soft' {
  const normalized = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
  if (normalized === 'soft') return 'soft';
  if (normalized === 'hardcoded') return 'hardcoded';

  // Auto mode: webm recordings often have VFR/1k-timestamp quirks and are expensive to re-encode.
  // Prefer soft subtitles for medium-sized webm inputs.
  if (isLikelyWebmVideo(context) && fileSizeBytes >= SOFT_SUBTITLE_WEBM_SIZE_THRESHOLD_BYTES) {
    return 'soft';
  }

  // Generic fallback: large files prefer soft subtitles to avoid expensive full re-encode.
  return fileSizeBytes >= SOFT_SUBTITLE_SIZE_THRESHOLD_BYTES ? 'soft' : 'hardcoded';
}

// Whisper mode (local vs cloud) for consent enforcement.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOW_OPENAI_WHISPER = process.env.ALLOW_OPENAI_WHISPER === 'true';
const HARD_DISABLE_EXTERNAL_NETWORK = process.env.HARD_DISABLE_EXTERNAL_NETWORK === 'true';
const USE_OPENAI_WHISPER = !HARD_DISABLE_EXTERNAL_NETWORK && !!OPENAI_API_KEY && ALLOW_OPENAI_WHISPER;

const isTruthy = (value: unknown): boolean => {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

type EnhanceAudioLevel = 'off' | 'standard' | 'strong';

const normalizeEnhanceAudio = (value: unknown): EnhanceAudioLevel => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'strong') return 'strong';
  if (normalized === 'off' || normalized === 'false' || normalized === '0' || normalized === 'no') return 'off';
  if (normalized === 'standard' || normalized === 'true' || normalized === '1' || normalized === 'yes') return 'standard';
  return 'off';
};

const normalizeVocabularyPrompt = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 1800);
};

function createTempInputFile(sourcePath: string, destPath: string) {
  try {
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
  } catch {}

  try {
    fs.linkSync(sourcePath, destPath);
  } catch (err: any) {
    // Hardlinks can fail across filesystems or if not supported; fall back to copy.
    fs.copyFileSync(sourcePath, destPath);
  }
}

// Extend Express Request to include user info
interface AuthRequest extends Request {
  userId?: number;
  user?: User;
}

// Auth middleware type
type AuthMiddleware = (req: Request, res: Response, next: () => void) => void;

export function registerJobRoutes(
  app: Express,
  requireAuth: AuthMiddleware
) {
  // Check if async jobs are available (Redis running)
  app.get('/api/jobs/status', async (_req, res) => {
    const available = await isRedisAvailable();
    res.json({
      asyncJobsAvailable: available,
      message: available
        ? 'Async job processing is available'
        : 'Async jobs unavailable - using synchronous processing',
    });
  });

  // Create a new video conversion job
  app.post(
    '/api/jobs/convert',
    requireAuth,
    upload.single('video'),
    async (req: AuthRequest, res: Response) => {
      const videoFile = req.file;

      if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' });
      }

      if (!req.userId || !req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const detected = await detectFileType(videoFile.path);
      const detectedMime = detected?.mime;
      const effectiveMime = detectedMime || videoFile.mimetype;
      if (!effectiveMime || !ALLOWED_VIDEO_TYPES.has(effectiveMime)) {
        try { fs.unlinkSync(videoFile.path); } catch {}
        return res.status(400).json({ error: 'Invalid video file type' });
      }

      // Check if Redis is available
      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        // Cleanup uploaded file
        try { fs.unlinkSync(videoFile.path); } catch {}
        return res.status(503).json({
          error: 'Job queue temporarily unavailable',
          fallback: true,
        });
      }

      let uploadedPath = videoFile.path;
      try {
        const jobId = uuidv4();
        const outputFormat = (req.body.format || 'mp4').toLowerCase();
        // Hard whitelist: outputFormat is used in a tmp filename (path traversal risk).
        if (outputFormat !== 'mp4') {
          throw new Error('invalid_format');
        }
        const notifyEmail = typeof req.body?.notifyEmail === 'string' && req.body.notifyEmail.includes('@')
          ? req.body.notifyEmail
          : undefined;
        const priority = getPriorityForSubscription(req.user.subscription);
        const storageTarget = resolveStorageTarget(req.user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });

        // Rename file with extension for FFmpeg
        const inputExt = safeExtensionFromOriginalName(videoFile.originalname) || '.webm';
        const inputPath = videoFile.path + inputExt;
        fs.renameSync(videoFile.path, inputPath);
        uploadedPath = inputPath;

        // Create job in database
        createJob({
          id: jobId,
          queue: 'video-conversion',
          userId: req.userId,
          storageScope: storageTarget.scope,
          workspaceId: storageTarget.workspaceId || null,
          projectId: storageTarget.projectId || null,
          priority,
          inputData: {
            originalName: videoFile.originalname,
            outputFormat,
            notifyEmail: notifyEmail || null,
          },
          expiresInHours: 24,
        });

        // Add job to BullMQ queue
        await videoConversionQueue.add(
          'convert',
          {
            jobId,
            userId: req.userId,
            inputFilePath: inputPath,
            outputFormat,
            originalName: videoFile.originalname,
            notifyEmail,
            storageScope: storageTarget.scope,
            workspaceId: storageTarget.workspaceId || null,
            projectId: storageTarget.projectId || null,
          },
          { jobId, priority }
        );

        // Return immediately with job ID
        res.status(202).json({
          jobId,
          status: 'pending',
          message: 'Video conversion job created',
          estimatedTime: '2-5 minutes',
        });
      } catch (error: any) {
        console.error('[Jobs] Failed to create conversion job:', error);
        const message = (error as Error).message;
        if (message === 'invalid_format') {
          try { fs.unlinkSync(uploadedPath); } catch {}
          return res.status(400).json({ error: 'Invalid format' });
        }
        if (message === 'workspace_forbidden' || message === 'project_forbidden') {
          // Cleanup uploaded file
          try { fs.unlinkSync(uploadedPath); } catch {}
          return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
        }
        // Cleanup uploaded file
        try { fs.unlinkSync(uploadedPath); } catch {}
        res.status(500).json({ error: 'Failed to create job' });
      }
    }
  );

  // ===========================================
  // TRANSCRIPTION JOBS (Async Whisper)
  // ===========================================

  // Allowed audio/video MIME types for transcription
  const ALLOWED_TRANSCRIPTION_TYPES = new Set([
    'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/mpga', 'audio/wav',
    'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/aac', 'audio/x-aac', 'audio/ogg', 'audio/vorbis', 'audio/flac',
    'audio/x-flac', 'video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime',
  ]);

  // Create a new transcription job (async)
  // RATE LIMITED: GPU-intensive operation
  app.post(
    '/api/jobs/transcribe',
    requireAuth,
    gpuRateLimit('transcribe'),
    upload.single('audio'),
    async (req: AuthRequest, res: Response) => {
      const audioFile = req.file;

      if (!audioFile) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      if (!req.userId || !req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const cloudConsent = isTruthy(req.body?.cloudConsent);
      if (USE_OPENAI_WHISPER && !cloudConsent) {
        try { fs.unlinkSync(audioFile.path); } catch {}
        return res.status(400).json({
          error: 'cloud_consent_required',
          message: 'Cloud-Verarbeitung ist aktiviert. Bitte stimmen Sie der Verarbeitung Ihrer Audiodaten durch OpenAI (USA) zu.',
        });
      }

      const detected = await detectFileType(audioFile.path);
      const detectedMime = detected?.mime;
      const effectiveMime = detectedMime || audioFile.mimetype;
      if (!effectiveMime || !ALLOWED_TRANSCRIPTION_TYPES.has(effectiveMime)) {
        try { fs.unlinkSync(audioFile.path); } catch {}
        return res.status(400).json({ error: 'Invalid audio/video file type' });
      }

      // Check if Redis is available
      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        try { fs.unlinkSync(audioFile.path); } catch {}
        return res.status(503).json({
          error: 'Job queue temporarily unavailable',
          fallback: true,
          message: 'Please use the synchronous /api/transcribe endpoint',
        });
      }

      const jobId = uuidv4();
      let inputPath: string | null = null;
      let inputChecksum: string | null = null;
      let creditsWorkspaceId: string | null = null;
      let estimatedCredits = 0;
      let creditsReserved = false;

      try {
        const priority = getPriorityForSubscription(req.user.subscription);
        const storageTarget = resolveStorageTarget(req.user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });

        // Rename file with extension for proper handling
        const inputExt = safeExtensionFromOriginalName(audioFile.originalname) || '.mp3';
        const renamedTmpPath = audioFile.path + inputExt;
        fs.renameSync(audioFile.path, renamedTmpPath);
        // Persist input so queued jobs survive retries/container restarts.
        inputPath = persistJobInputFile({
          kind: 'transcription',
          jobId,
          sourcePath: renamedTmpPath,
          originalName: audioFile.originalname,
          defaultExt: inputExt,
        });
        inputChecksum = computeFileSha256(inputPath);

        // Reserve credits (estimate via ffprobe duration).
        const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
          ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(req.user)
          : getOrCreateDefaultWorkspaceForUser(req.user);
        ensureCreditWallet(workspace.id, workspace.plan_id as PlanId);
        creditsWorkspaceId = workspace.id;
        const durationSeconds = await getMediaDurationSeconds(inputPath);
        const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
        estimatedCredits = minutes * CREDIT_COSTS.ASR_MINUTE.credits;
        try {
          reserveCredits(workspace.id, estimatedCredits, jobId, {
            costKey: 'ASR_MINUTE',
            minutes,
            durationSeconds,
          });
          creditsReserved = true;
        } catch (error: any) {
          try { fs.unlinkSync(inputPath); } catch {}
          const message = (error as Error)?.message || String(error);
          const status = message === 'insufficient_credits' ? 402 : 400;
          return res.status(status).json({ error: message === 'insufficient_credits' ? 'Nicht genug Credits' : message });
        }

        // Get notification email if provided
        const notifyEmail = req.body?.notifyEmail;
        const rawMode = typeof req.body?.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';
        const mode = rawMode === 'fast' ? 'fast' : rawMode === 'balanced' ? 'balanced' : 'quality';
        const enhanceAudio = normalizeEnhanceAudio(req.body?.enhanceAudio);
        const vocabularyPrompt = normalizeVocabularyPrompt(req.body?.vocabularyPrompt);

        // Create job in database
        createJob({
          id: jobId,
          queue: 'transcription',
          userId: req.userId,
          storageScope: storageTarget.scope,
          workspaceId: workspace.id,
          projectId: storageTarget.projectId || null,
          jobType: 'ASR_MINUTE',
          estimatedCredits,
          priority,
          inputData: {
            originalName: audioFile.originalname,
            mimeType: audioFile.mimetype,
            fileSize: audioFile.size,
            durationSeconds,
            notifyEmail: notifyEmail || null,
            mode,
            cloudConsent,
            enhanceAudio,
            vocabularyPrompt: vocabularyPrompt || null,
          },
          inputPath,
          inputChecksum,
          expiresInHours: 24,
        });

        // Add job to BullMQ queue
        await transcriptionQueue.add(
          'transcribe',
          {
            jobId,
            userId: req.userId,
            inputFilePath: inputPath,
            inputChecksum,
            originalName: audioFile.originalname,
            mimeType: audioFile.mimetype,
            notifyEmail,
            mode,
            cloudConsent,
            enhanceAudio,
            vocabularyPrompt,
            storageScope: storageTarget.scope,
            workspaceId: workspace.id,
            projectId: storageTarget.projectId || null,
          },
          {
            jobId,
            priority,
            // Whisper can be temporarily unavailable (e.g., GPU OOM / model warmup).
            attempts: RETRY_ATTEMPTS,
            backoff: { type: 'tiered' },
          }
        );

        console.log(`[Jobs] Transcription job created: ${jobId} - ${audioFile.originalname}`);

        // Return immediately with job ID
        res.status(202).json({
          jobId,
          status: 'pending',
          message: 'Transkription wird verarbeitet',
          estimatedTime: '1-5 Minuten',
        });
      } catch (error: any) {
        console.error('[Jobs] Failed to create transcription job:', error);
        if (creditsReserved && creditsWorkspaceId && estimatedCredits > 0) {
          try { releaseCredits(creditsWorkspaceId, estimatedCredits, jobId, { status: 'enqueue_failed' }); } catch {}
        }
        const message = (error as Error).message;
        if (message === 'workspace_forbidden' || message === 'project_forbidden') {
          try { fs.unlinkSync(audioFile.path); } catch {}
          return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
        }
        try { fs.unlinkSync(audioFile.path); } catch {}
        if (inputPath && inputPath !== audioFile.path) {
          try { fs.unlinkSync(inputPath); } catch {}
        }
        res.status(500).json({ error: 'Failed to create job' });
      }
    }
  );

  // Create a new transcription job from a session file (async)
  // This avoids downloading the file back to the browser and re-uploading it.
  app.post(
    '/api/jobs/transcribe-session',
    requireAuth,
    gpuRateLimit('transcribe'),
    upload.none(),
    async (req: AuthRequest, res: Response) => {
      if (!req.userId || !req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const cloudConsent = isTruthy(req.body?.cloudConsent);
      if (USE_OPENAI_WHISPER && !cloudConsent) {
        return res.status(400).json({
          error: 'cloud_consent_required',
          message: 'Cloud-Verarbeitung ist aktiviert. Bitte stimmen Sie der Verarbeitung Ihrer Audiodaten durch OpenAI (USA) zu.',
        });
      }

      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
      const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';

      if (!sessionId || !fileId) {
        return res.status(400).json({ error: 'sessionId and fileId are required' });
      }

      const sessionFile = getSessionFile(sessionId, fileId, req.userId);
      if (!sessionFile) {
        return res.status(404).json({ error: 'Session file not found' });
      }

      if (!sessionFile.mimeType || !ALLOWED_TRANSCRIPTION_TYPES.has(sessionFile.mimeType)) {
        return res.status(400).json({ error: 'Invalid audio/video file type' });
      }

      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        return res.status(503).json({
          error: 'Job queue temporarily unavailable',
          fallback: true,
          message: 'Please use the synchronous /api/transcribe endpoint',
        });
      }

      const jobId = uuidv4();
      let inputPath: string | null = null;
      let inputChecksum: string | null = null;
      let creditsWorkspaceId: string | null = null;
      let estimatedCredits = 0;
      let creditsReserved = false;

      try {
        const priority = getPriorityForSubscription(req.user.subscription);
        const storageTarget = resolveStorageTarget(req.user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });

        const inputExt = safeExtensionFromOriginalName(sessionFile.originalName) || '.mp3';
        const tmpInputPath = tmpPath(`session_transcribe_${jobId}${inputExt}`);
        createTempInputFile(sessionFile.path, tmpInputPath);
        inputPath = persistJobInputFile({
          kind: 'transcription',
          jobId,
          sourcePath: tmpInputPath,
          originalName: sessionFile.originalName,
          defaultExt: inputExt,
        });
        inputChecksum = computeFileSha256(inputPath);

        const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
          ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(req.user)
          : getOrCreateDefaultWorkspaceForUser(req.user);
        ensureCreditWallet(workspace.id, workspace.plan_id as PlanId);
        creditsWorkspaceId = workspace.id;
        const durationSeconds = await getMediaDurationSeconds(inputPath);
        const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
        estimatedCredits = minutes * CREDIT_COSTS.ASR_MINUTE.credits;
        try {
          reserveCredits(workspace.id, estimatedCredits, jobId, {
            costKey: 'ASR_MINUTE',
            minutes,
            durationSeconds,
          });
          creditsReserved = true;
        } catch (error: any) {
          if (inputPath) {
            try { fs.unlinkSync(inputPath); } catch {}
          }
          const message = (error as Error)?.message || String(error);
          const status = message === 'insufficient_credits' ? 402 : 400;
          return res.status(status).json({ error: message === 'insufficient_credits' ? 'Nicht genug Credits' : message });
        }

        const notifyEmail = typeof req.body?.notifyEmail === 'string' && req.body.notifyEmail.includes('@')
          ? req.body.notifyEmail
          : undefined;
        const rawMode = typeof req.body?.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';
        const mode = rawMode === 'fast' ? 'fast' : rawMode === 'balanced' ? 'balanced' : 'quality';
        const enhanceAudio = normalizeEnhanceAudio(req.body?.enhanceAudio);
        const vocabularyPrompt = normalizeVocabularyPrompt(req.body?.vocabularyPrompt);

        createJob({
          id: jobId,
          queue: 'transcription',
          userId: req.userId,
          storageScope: storageTarget.scope,
          workspaceId: workspace.id,
          projectId: storageTarget.projectId || null,
          jobType: 'ASR_MINUTE',
          estimatedCredits,
          priority,
          inputData: {
            originalName: sessionFile.originalName,
            mimeType: sessionFile.mimeType,
            fileSize: sessionFile.size,
            durationSeconds,
            notifyEmail: notifyEmail || null,
            sessionId,
            fileId,
            mode,
            cloudConsent,
            enhanceAudio,
            vocabularyPrompt: vocabularyPrompt || null,
          },
          inputPath,
          inputChecksum,
          expiresInHours: 24,
        });

        await transcriptionQueue.add(
          'transcribe',
          {
            jobId,
            userId: req.userId,
            inputFilePath: inputPath,
            inputChecksum,
            originalName: sessionFile.originalName,
            mimeType: sessionFile.mimeType,
            notifyEmail,
            mode,
            cloudConsent,
            enhanceAudio,
            vocabularyPrompt,
            storageScope: storageTarget.scope,
            workspaceId: workspace.id,
            projectId: storageTarget.projectId || null,
          },
          {
            jobId,
            priority,
            attempts: RETRY_ATTEMPTS,
            backoff: { type: 'tiered' },
          }
        );

        console.log(`[Jobs] Session transcription job created: ${jobId} - ${sessionFile.originalName}`);

        res.status(202).json({
          jobId,
          status: 'pending',
          message: 'Transkription wird verarbeitet',
          estimatedTime: '1-5 Minuten',
        });
      } catch (error: any) {
        console.error('[Jobs] Failed to create session transcription job:', error);
        if (creditsReserved && creditsWorkspaceId && estimatedCredits > 0) {
          try { releaseCredits(creditsWorkspaceId, estimatedCredits, jobId, { status: 'enqueue_failed' }); } catch {}
        }
        if (inputPath) {
          try { fs.unlinkSync(inputPath); } catch {}
        }
        res.status(500).json({ error: 'Failed to create job' });
      }
    }
  );

  // ===========================================
  // SUBTITLE EMBEDDING JOBS (Async FFmpeg)
  // ===========================================

  app.post(
    '/api/jobs/embed-subtitles',
    requireAuth,
    checkUsageLimit('videos'),
    upload.fields([
      { name: 'video', maxCount: 1 },
      { name: 'srt', maxCount: 1 },
      { name: 'font', maxCount: 1 },
    ]),
    async (req: AuthRequest, res: Response) => {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const videoFile = files?.video?.[0];
      const srtFile = files?.srt?.[0];
      const fontFile = files?.font?.[0];

      if (!videoFile || !srtFile) {
        if (videoFile) {
          try { fs.unlinkSync(videoFile.path); } catch {}
        }
        if (srtFile) {
          try { fs.unlinkSync(srtFile.path); } catch {}
        }
        if (fontFile) {
          try { fs.unlinkSync(fontFile.path); } catch {}
        }
        return res.status(400).json({ error: 'Video and SRT files are required' });
      }

      if (!req.userId || !req.user) {
        try { fs.unlinkSync(videoFile.path); } catch {}
        try { fs.unlinkSync(srtFile.path); } catch {}
        if (fontFile) {
          try { fs.unlinkSync(fontFile.path); } catch {}
        }
        return res.status(401).json({ error: 'Authentication required' });
      }

      const detectedVideo = await detectFileType(videoFile.path);
      const detectedVideoMime = detectedVideo?.mime;
      const effectiveVideoMime = detectedVideoMime || videoFile.mimetype;
      if (!effectiveVideoMime || !ALLOWED_VIDEO_TYPES.has(effectiveVideoMime)) {
        try { fs.unlinkSync(videoFile.path); } catch {}
        try { fs.unlinkSync(srtFile.path); } catch {}
        if (fontFile) {
          try { fs.unlinkSync(fontFile.path); } catch {}
        }
        return res.status(400).json({ error: 'Invalid video file type' });
      }

      if (fontFile) {
        const detectedFont = await detectFileType(fontFile.path);
        const detectedFontMime = detectedFont?.mime;
        const effectiveFontMime = detectedFontMime || fontFile.mimetype;
        if (!effectiveFontMime || !ALLOWED_FONT_TYPES.has(effectiveFontMime)) {
          try { fs.unlinkSync(videoFile.path); } catch {}
          try { fs.unlinkSync(srtFile.path); } catch {}
          try { fs.unlinkSync(fontFile.path); } catch {}
          return res.status(400).json({ error: 'Invalid font file type' });
        }
      }

      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        try { fs.unlinkSync(videoFile.path); } catch {}
        try { fs.unlinkSync(srtFile.path); } catch {}
        if (fontFile) {
          try { fs.unlinkSync(fontFile.path); } catch {}
        }
        return res.status(503).json({
          error: 'Job queue temporarily unavailable',
          fallback: true,
        });
      }

      let videoPath: string | null = null;
      let srtPath: string | null = null;
      let fontPath: string | null = null;

      try {
        const jobId = uuidv4();
        const priority = getPriorityForSubscription(req.user.subscription);
        const storageTarget = resolveStorageTarget(req.user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });
        const subtitleType = selectSubtitleType(req.body.type, Number(videoFile.size || 0), {
          mimeType: effectiveVideoMime,
          originalName: videoFile.originalname,
        });

        const fontSize = parseInt(req.body.fontSize, 10) || 24;
        const normalizeHex = (value: string | undefined, fallback: string) => {
          if (!value) return fallback;
          const cleaned = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
          return /^#[0-9A-Fa-f]{6}$/.test(cleaned) ? cleaned.toUpperCase() : fallback;
        };
        const fontColor = normalizeHex(req.body.fontColor, '#FFFFFF');
        const backgroundColor = normalizeHex(req.body.backgroundColor, '#000000');
        const backgroundOpacity = Number.isFinite(parseInt(req.body.backgroundOpacity, 10))
          ? parseInt(req.body.backgroundOpacity, 10)
          : 80;

        const notifyEmail = typeof req.body?.notifyEmail === 'string' && req.body.notifyEmail.includes('@')
          ? req.body.notifyEmail
          : undefined;

        const inputExt = safeExtensionFromOriginalName(videoFile.originalname) || '.mp4';
        const uploadedVideoPath = videoFile.path + inputExt;
        fs.renameSync(videoFile.path, uploadedVideoPath);
        videoPath = persistJobInputFile({
          kind: 'subtitle-embed',
          jobId,
          sourcePath: uploadedVideoPath,
          originalName: videoFile.originalname,
          defaultExt: inputExt,
          filenameBase: 'video',
        });
        const videoChecksum = computeFileSha256(videoPath);

        const uploadedSrtPath = srtFile.path + '.srt';
        fs.renameSync(srtFile.path, uploadedSrtPath);
        srtPath = persistJobUploadedFile({
          kind: 'subtitle-embed',
          jobId,
          sourcePath: uploadedSrtPath,
          originalName: srtFile.originalname || 'subtitles.srt',
          defaultExt: '.srt',
          filenameBase: 'subtitles',
        });
        const srtChecksum = computeFileSha256(srtPath);

        let fontChecksum: string | null = null;
        if (fontFile) {
          const fontExt = safeExtensionFromOriginalName(fontFile.originalname) || '.ttf';
          const uploadedFontPath = fontFile.path + fontExt;
          fs.renameSync(fontFile.path, uploadedFontPath);
          fontPath = persistJobUploadedFile({
            kind: 'subtitle-embed',
            jobId,
            sourcePath: uploadedFontPath,
            originalName: fontFile.originalname,
            defaultExt: fontExt,
            filenameBase: 'font',
          });
          fontChecksum = computeFileSha256(fontPath);
        }

        createJob({
          id: jobId,
          queue: 'subtitle-embed',
          userId: req.userId,
          storageScope: storageTarget.scope,
          workspaceId: storageTarget.workspaceId || null,
          projectId: storageTarget.projectId || null,
          priority,
          inputData: {
            originalName: videoFile.originalname,
            outputFormat: 'mp4',
            subtitleType,
            notifyEmail: notifyEmail || null,
            inputPath: videoPath,
            inputChecksum: videoChecksum,
            srtPath,
            srtChecksum,
            fontPath,
            fontChecksum,
          },
          inputPath: videoPath,
          inputChecksum: videoChecksum,
          expiresInHours: 24,
        });

        await subtitleEmbedQueue.add(
          'embed',
          {
            jobId,
            userId: req.userId,
            videoPath,
            videoChecksum,
            srtPath,
            srtChecksum,
            fontPath,
            fontChecksum,
            subtitleType,
            fontSize,
            fontColor,
            backgroundColor,
            backgroundOpacity,
            originalName: videoFile.originalname,
            notifyEmail,
            storageScope: storageTarget.scope,
            workspaceId: storageTarget.workspaceId || null,
            projectId: storageTarget.projectId || null,
          },
          {
            jobId,
            priority,
            attempts: RETRY_ATTEMPTS,
            backoff: { type: 'tiered' },
          }
        );

        res.status(202).json({
          jobId,
          status: 'pending',
          message: 'Untertitel werden eingebettet',
          estimatedTime: '2-6 Minuten',
        });
      } catch (error: any) {
        console.error('[Jobs] Failed to create subtitle embedding job:', error);
        const message = (error as Error).message;
        if (message === 'workspace_forbidden' || message === 'project_forbidden') {
          try { fs.unlinkSync(videoFile.path); } catch {}
          try { fs.unlinkSync(srtFile.path); } catch {}
          if (videoPath) {
            try { fs.unlinkSync(videoPath); } catch {}
          }
          if (srtPath) {
            try { fs.unlinkSync(srtPath); } catch {}
          }
          if (fontPath) {
            try { fs.unlinkSync(fontPath); } catch {}
          }
          if (fontFile) {
            try { fs.unlinkSync(fontFile.path); } catch {}
          }
          return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
        }
        try { fs.unlinkSync(videoFile.path); } catch {}
        try { fs.unlinkSync(srtFile.path); } catch {}
        if (videoPath) {
          try { fs.unlinkSync(videoPath); } catch {}
        }
        if (srtPath) {
          try { fs.unlinkSync(srtPath); } catch {}
        }
        if (fontPath) {
          try { fs.unlinkSync(fontPath); } catch {}
        }
        if (fontFile) {
          try { fs.unlinkSync(fontFile.path); } catch {}
        }
        res.status(500).json({ error: 'Failed to create job' });
      }
    }
  );

  // Embed subtitles from a session video (async)
  // Avoids re-uploading large files and works well behind flaky proxies.
  app.post(
    '/api/jobs/embed-subtitles-session',
    requireAuth,
    checkUsageLimit('videos'),
    sessionSubtitleUpload.fields([
      { name: 'font', maxCount: 1 },
      { name: 'srt', maxCount: 1 },
    ]),
    async (req: AuthRequest, res: Response) => {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const fontFile = files?.font?.[0];
      const uploadedSrtFile = files?.srt?.[0];
      const cleanupUploadTemp = (file?: Express.Multer.File | null) => {
        if (!file) return;
        try { fs.unlinkSync(file.path); } catch {}
      };

      if (!req.userId || !req.user) {
        cleanupUploadTemp(fontFile);
        cleanupUploadTemp(uploadedSrtFile);
        return res.status(401).json({ error: 'Authentication required' });
      }

      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
      const videoFileId = typeof req.body?.videoFileId === 'string' ? req.body.videoFileId : '';
      let srtContent = typeof req.body?.srtContent === 'string' ? req.body.srtContent : '';

      if ((!srtContent || !srtContent.trim()) && uploadedSrtFile) {
        try {
          srtContent = fs.readFileSync(uploadedSrtFile.path, 'utf-8');
        } catch {
          cleanupUploadTemp(fontFile);
          cleanupUploadTemp(uploadedSrtFile);
          return res.status(400).json({ error: 'Invalid SRT file' });
        }
      }
      cleanupUploadTemp(uploadedSrtFile);

      if (!sessionId || !videoFileId || !srtContent.trim()) {
        cleanupUploadTemp(fontFile);
        return res.status(400).json({ error: 'sessionId, videoFileId and srtContent/srt are required' });
      }

      const sessionFile = getSessionFile(sessionId, videoFileId, req.userId);
      if (!sessionFile) {
        cleanupUploadTemp(fontFile);
        return res.status(404).json({ error: 'Session file not found' });
      }

      if (!sessionFile.mimeType || !ALLOWED_VIDEO_TYPES.has(sessionFile.mimeType)) {
        cleanupUploadTemp(fontFile);
        return res.status(400).json({ error: 'Invalid video file type' });
      }

      if (fontFile) {
        const detectedFont = await detectFileType(fontFile.path);
        const detectedFontMime = detectedFont?.mime;
        const effectiveFontMime = detectedFontMime || fontFile.mimetype;
        if (!effectiveFontMime || !ALLOWED_FONT_TYPES.has(effectiveFontMime)) {
          cleanupUploadTemp(fontFile);
          return res.status(400).json({ error: 'Invalid font file type' });
        }
      }

      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        cleanupUploadTemp(fontFile);
        return res.status(503).json({
          error: 'Job queue temporarily unavailable',
          fallback: true,
        });
      }

      let videoPath: string | null = null;
      let srtPath: string | null = null;
      let fontPath: string | null = null;
      let videoChecksum: string | null = null;
      let srtChecksum: string | null = null;
      let fontChecksum: string | null = null;

      try {
        const jobId = uuidv4();
        const priority = getPriorityForSubscription(req.user.subscription);
        const storageTarget = resolveStorageTarget(req.user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });

        const sessionFileSize = Number(sessionFile.size || 0) || (() => {
          try { return fs.statSync(sessionFile.path).size; } catch { return 0; }
        })();
        const subtitleType = selectSubtitleType(req.body.type, sessionFileSize, {
          mimeType: sessionFile.mimeType,
          originalName: sessionFile.originalName,
        });

        const fontSize = parseInt(req.body.fontSize, 10) || 24;
        const normalizeHex = (value: string | undefined, fallback: string) => {
          if (!value) return fallback;
          const cleaned = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
          return /^#[0-9A-Fa-f]{6}$/.test(cleaned) ? cleaned.toUpperCase() : fallback;
        };
        const fontColor = normalizeHex(req.body.fontColor, '#FFFFFF');
        const backgroundColor = normalizeHex(req.body.backgroundColor, '#000000');
        const backgroundOpacity = Number.isFinite(parseInt(req.body.backgroundOpacity, 10))
          ? parseInt(req.body.backgroundOpacity, 10)
          : 80;

        const notifyEmail = typeof req.body?.notifyEmail === 'string' && req.body.notifyEmail.includes('@')
          ? req.body.notifyEmail
          : undefined;

        const inputExt = safeExtensionFromOriginalName(sessionFile.originalName) || '.mp4';
        const tempVideoPath = tmpPath(`session_embed_${jobId}${inputExt}`);
        createTempInputFile(sessionFile.path, tempVideoPath);
        videoPath = persistJobInputFile({
          kind: 'subtitle-embed',
          jobId,
          sourcePath: tempVideoPath,
          originalName: sessionFile.originalName,
          defaultExt: inputExt,
          filenameBase: 'video',
        });
        videoChecksum = computeFileSha256(videoPath);

        srtPath = persistJobTextFile({
          kind: 'subtitle-embed',
          jobId,
          content: srtContent.endsWith('\n') ? srtContent : `${srtContent}\n`,
          filename: 'subtitles.srt',
        });
        srtChecksum = computeFileSha256(srtPath);

        if (fontFile) {
          const fontExt = safeExtensionFromOriginalName(fontFile.originalname) || '.ttf';
          const uploadedFontPath = fontFile.path + fontExt;
          fs.renameSync(fontFile.path, uploadedFontPath);
          fontPath = persistJobUploadedFile({
            kind: 'subtitle-embed',
            jobId,
            sourcePath: uploadedFontPath,
            originalName: fontFile.originalname,
            defaultExt: fontExt,
            filenameBase: 'font',
          });
          fontChecksum = computeFileSha256(fontPath);
        }

        createJob({
          id: jobId,
          queue: 'subtitle-embed',
          userId: req.userId,
          storageScope: storageTarget.scope,
          workspaceId: storageTarget.workspaceId || null,
          projectId: storageTarget.projectId || null,
          priority,
          inputData: {
            originalName: sessionFile.originalName,
            outputFormat: 'mp4',
            subtitleType,
            notifyEmail: notifyEmail || null,
            sessionId,
            videoFileId,
            inputPath: videoPath,
            inputChecksum: videoChecksum,
            srtPath,
            srtChecksum,
            fontPath,
            fontChecksum,
          },
          inputPath: videoPath,
          inputChecksum: videoChecksum,
          expiresInHours: 24,
        });

        await subtitleEmbedQueue.add(
          'embed',
          {
            jobId,
            userId: req.userId,
            videoPath,
            videoChecksum,
            srtPath,
            srtChecksum,
            fontPath,
            fontChecksum,
            subtitleType,
            fontSize,
            fontColor,
            backgroundColor,
            backgroundOpacity,
            originalName: sessionFile.originalName,
            notifyEmail,
            storageScope: storageTarget.scope,
            workspaceId: storageTarget.workspaceId || null,
            projectId: storageTarget.projectId || null,
          },
          {
            jobId,
            priority,
            attempts: RETRY_ATTEMPTS,
            backoff: { type: 'tiered' },
          }
        );

        res.status(202).json({
          jobId,
          status: 'pending',
          message: 'Untertitel werden eingebettet',
          estimatedTime: '2-6 Minuten',
        });
      } catch (error: any) {
        console.error('[Jobs] Failed to create session subtitle embedding job:', error);
        if (videoPath) {
          try { fs.unlinkSync(videoPath); } catch {}
        }
        if (srtPath) {
          try { fs.unlinkSync(srtPath); } catch {}
        }
        if (fontPath) {
          try { fs.unlinkSync(fontPath); } catch {}
        }
        cleanupUploadTemp(fontFile);
        res.status(500).json({ error: 'Failed to create job' });
      }
    }
  );

  // Get transcription result (text, SRT, etc.)
  app.get('/api/jobs/:jobId/transcription', requireAuth, (req: AuthRequest, res: Response) => {
    const { jobId } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.queue !== 'transcription') {
      return res.status(400).json({ error: 'Not a transcription job' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        error: 'Job not completed',
        status: job.status,
        progress: {
          stage: job.progress_stage,
          percent: job.progress_percent,
        },
      });
    }

    // Return result data directly
    try {
      const resultData = job.result_data ? JSON.parse(job.result_data) : null;
      if (!resultData) {
        return res.status(500).json({ error: 'Result data not available' });
      }

      res.json({
        text: resultData.text,
        srt: resultData.srt,
        duration: resultData.duration,
        language: resultData.language,
        words: Array.isArray(resultData.words) ? resultData.words : [],
        mode: resultData.mode || 'local',
      });
    } catch (err) {
      console.error('[Jobs] Failed to parse transcription result:', err);
      res.status(500).json({ error: 'Failed to retrieve result' });
    }
  });

  // SSE endpoint for real-time job updates
  // IMPORTANT: This must come BEFORE /api/jobs/:jobId to avoid "events" being treated as a jobId
  app.get('/api/jobs/events', requireAuth, (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Parse job IDs from query
    const jobIdsParam = req.query.jobIds as string;
    const jobIds = jobIdsParam ? jobIdsParam.split(',').filter(Boolean) : [];

    // Generate client ID
    const clientId = uuidv4();

    // Add client to SSE manager
    sseManager.addClient(clientId, req.userId, res, jobIds);

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on close
    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  // Get job status
  app.get('/api/jobs/:jobId', requireAuth, (req: AuthRequest, res: Response) => {
    // Polled frequently. Avoid conditional 304 responses (breaks fetch().json()).
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("ETag", String(Date.now()));

    const { jobId } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      id: job.id,
      status: job.status,
      phase: job.phase || job.progress_stage,
      jobType: job.job_type,
      estimatedCredits: job.estimated_credits,
      consumedCredits: job.consumed_credits,
      progress: {
        stage: job.phase || job.progress_stage,
        percent: job.progress_percent,
      },
      error: job.error_message,
      errorCode: job.error_code,
      retryCount: job.retry_count || job.attempts || 0,
      gpuWaitMs: job.gpu_wait_ms || 0,
      lastHeartbeatAt: job.last_heartbeat_at,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      queueMetadata: {
        attempt: job.queue_attempt || job.attempts || 0,
        queuedAt: job.queued_at || job.created_at,
        startedAt: job.started_at,
        finishedAt: job.finished_at || job.completed_at,
        inputPath: job.input_path,
        inputChecksum: job.input_checksum,
      },
      hasResult: !!job.result_file_path,
    });
  });

  // Download job result
  app.get('/api/jobs/:jobId/result', requireAuth, (req: AuthRequest, res: Response) => {
    const { jobId } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed' || !job.result_file_path) {
      return res.status(400).json({
        error: 'Job not completed or result not available',
        status: job.status,
      });
    }

    // Check if file exists
    if (!fs.existsSync(job.result_file_path)) {
      // Mark job as expired
      deleteJob(jobId);
      return res.status(410).json({ error: 'Result file has expired' });
    }

    // Parse input data for filename
    let filename = `converted_${jobId}.mp4`;
    try {
      const inputData = JSON.parse(job.input_data || '{}');
      const originalName = inputData.originalName || 'video';
      const baseName = path.basename(originalName, path.extname(originalName));
      if (job.queue === 'subtitle-embed') {
        filename = `${baseName}_untertitel.${inputData.outputFormat || 'mp4'}`;
      } else {
        filename = `${baseName}_converted.${inputData.outputFormat || 'mp4'}`;
      }
    } catch {}

    // Send file
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const readStream = fs.createReadStream(job.result_file_path);
    readStream.pipe(res);

    readStream.on('end', () => {
      // Optionally cleanup after download
      // fs.unlinkSync(job.result_file_path);
      // deleteJob(jobId);
    });

    readStream.on('error', (err) => {
      console.error('[Jobs] Error streaming result:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream result' });
      }
    });
  });

  // Get all jobs for current user
  app.get('/api/jobs', requireAuth, (req: AuthRequest, res: Response) => {
    // Polled for recovery; avoid 304 responses (breaks fetch().json()).
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("ETag", String(Date.now()));

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const scope = req.query.scope === 'workspace' ? 'workspace' : 'user';
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
    if (scope === 'workspace') {
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId fehlt' });
      }
      const membership = getWorkspaceMember(workspaceId, req.userId);
      if (!membership) {
        return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
      }
    }

    const jobs = scope === 'workspace' && workspaceId
      ? getJobsForWorkspace(workspaceId, limit)
      : getJobsForUser(req.userId, limit);

    res.json({
      jobs: jobs.map((job) => {
        let dedupKey: string | null = null;
        if (job.input_data) {
          try {
            const parsed = JSON.parse(job.input_data) as { dedupKey?: unknown };
            if (typeof parsed?.dedupKey === "string" && parsed.dedupKey.length > 0) {
              dedupKey = parsed.dedupKey;
            }
          } catch {
            // Ignore malformed input_data for response serialization.
          }
        }

        return {
          id: job.id,
          queue: job.queue,
          status: job.status,
          phase: job.phase || job.progress_stage,
          jobType: job.job_type,
          estimatedCredits: job.estimated_credits,
          consumedCredits: job.consumed_credits,
          progress: {
            stage: job.phase || job.progress_stage,
            percent: job.progress_percent,
          },
          error: job.error_message,
          errorCode: job.error_code,
          retryCount: job.retry_count || job.attempts || 0,
          gpuWaitMs: job.gpu_wait_ms || 0,
          lastHeartbeatAt: job.last_heartbeat_at,
          createdAt: job.created_at,
          completedAt: job.completed_at,
          queueMetadata: {
            attempt: job.queue_attempt || job.attempts || 0,
            queuedAt: job.queued_at || job.created_at,
            startedAt: job.started_at,
            finishedAt: job.finished_at || job.completed_at,
            inputPath: job.input_path,
            inputChecksum: job.input_checksum,
          },
          hasResult: !!job.result_file_path,
          dedupKey,
        };
      }),
    });
  });

  // Cancel a job (if still pending)
  app.delete('/api/jobs/:jobId', requireAuth, async (req: AuthRequest, res: Response) => {
    const { jobId } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only allow cancelling pending jobs
    if (job.status !== 'pending') {
      return res.status(400).json({
        error: 'Can only cancel pending jobs',
        status: job.status,
      });
    }

    // Remove from BullMQ queue
    try {
      const queue =
        job.queue === 'video-conversion'
          ? videoConversionQueue
          : job.queue === 'transcription'
            ? transcriptionQueue
            : job.queue === 'chapter-splitting'
              ? chapterSplittingQueue
              : job.queue === 'subtitle-embed'
                ? subtitleEmbedQueue
                : job.queue === 'pdfua-conversion'
                  ? pdfuaQueue
                  : job.queue === 'ollama-tasks'
                    ? ollamaQueue
                    : job.queue === 'pptx-summary'
                      ? pptxSummaryQueue
                      : job.queue === 'podcast'
                        ? podcastQueue
                        : null;

      const bullJob = queue ? await queue.getJob(jobId) : null;
      if (bullJob) {
        await bullJob.remove();
      }
    } catch (err) {
      console.error('[Jobs] Failed to remove from queue:', err);
    }

    // Release reserved credits (best-effort) before deleting the DB record.
    finalizeCreditsForJob(jobId, 'cancelled');

    // Delete from database
    deleteJob(jobId);

    res.json({ success: true, message: 'Job cancelled' });
  });

  // ===========================================
  // CHAPTER SPLITTING JOBS
  // ===========================================

  // Create a chapter splitting job
  app.post(
    '/api/jobs/split-chapters',
    requireAuth,
    upload.single('video'),
    async (req: AuthRequest, res: Response) => {
      const videoFile = req.file;
      const { chapters, srtContent, maxSizeMb } = req.body;

      if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' });
      }

      if (!chapters || !srtContent) {
        if (videoFile) {
          try { fs.unlinkSync(videoFile.path); } catch {}
        }
        return res.status(400).json({ error: 'Chapters and SRT content are required' });
      }

      if (!req.userId || !req.user) {
        if (videoFile) {
          try { fs.unlinkSync(videoFile.path); } catch {}
        }
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if Redis is available
      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        try { fs.unlinkSync(videoFile.path); } catch {}
        return res.status(503).json({
          error: 'Job queue temporarily unavailable',
          fallback: false,
        });
      }

      try {
        const parsedChapters = typeof chapters === 'string' ? JSON.parse(chapters) : chapters;

        if (!Array.isArray(parsedChapters) || parsedChapters.length === 0) {
          try { fs.unlinkSync(videoFile.path); } catch {}
          return res.status(400).json({ error: 'At least one chapter is required' });
        }

        const jobId = uuidv4();
        const priority = getPriorityForSubscription(req.user.subscription);
        const storageTarget = resolveStorageTarget(req.user, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });

        // Rename file with extension
        const inputExt = safeExtensionFromOriginalName(videoFile.originalname) || '.webm';
        const inputPath = videoFile.path + inputExt;
        fs.renameSync(videoFile.path, inputPath);

        // Create backup directory and path
        const backupDir = path.join('/app/data/backups', String(req.userId));
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const backupPath = path.join(backupDir, `${Date.now()}_${videoFile.originalname}`);

        // Create job in database
        createJob({
          id: jobId,
          queue: 'chapter-splitting',
          userId: req.userId,
          storageScope: storageTarget.scope,
          workspaceId: storageTarget.workspaceId || null,
          projectId: storageTarget.projectId || null,
          priority,
          inputData: {
            originalName: videoFile.originalname,
            chapterCount: parsedChapters.length,
            chapters: parsedChapters.map((c: any) => c.title),
          },
          expiresInHours: 48, // Longer retention for large jobs
        });

        // Add job to BullMQ queue
        const requestedMaxSizeMb = Number(maxSizeMb);
        const chapterMaxSizeMb = Number.isFinite(requestedMaxSizeMb)
          ? Math.max(25, Math.min(125, requestedMaxSizeMb))
          : 125;

        await chapterSplittingQueue.add(
          'split',
          {
            jobId,
            userId: req.userId,
            videoPath: inputPath,
            srtContent,
            chapters: parsedChapters,
            backupPath,
            originalFilename: videoFile.originalname,
            maxSizeMb: chapterMaxSizeMb,
            storageScope: storageTarget.scope,
            workspaceId: storageTarget.workspaceId || null,
            projectId: storageTarget.projectId || null,
          },
          { jobId, priority }
        );

        console.log(`[Jobs] Chapter splitting job created: ${jobId} with ${parsedChapters.length} chapters`);

        // Return immediately with job ID
        res.status(202).json({
          jobId,
          status: 'pending',
          message: 'Chapter splitting job created',
          chapterCount: parsedChapters.length,
          estimatedTime: `${Math.max(5, parsedChapters.length * 3)}-${parsedChapters.length * 8} minutes`,
        });
      } catch (error: any) {
        console.error('[Jobs] Failed to create chapter splitting job:', error);
        const message = (error as Error).message;
        if (message === 'workspace_forbidden' || message === 'project_forbidden') {
          try { fs.unlinkSync(videoFile.path); } catch {}
          return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
        }
        try { fs.unlinkSync(videoFile.path); } catch {}
        res.status(500).json({ error: 'Failed to create job: ' + error.message });
      }
    }
  );

  type ChapterResultData = {
    chapterOutputDir?: string;
    chapterFiles?: Array<{
      index: number;
      title: string;
      videoFilename: string;
      srtFilename: string;
    }>;
  };

  const readChapterResultData = (raw: string | null): ChapterResultData | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as ChapterResultData;
    } catch {
      return null;
    }
  };

  const getChapterOutputDir = (job: { result_data: string | null }): string | null => {
    const resultData = readChapterResultData(job.result_data);
    if (!resultData?.chapterOutputDir || typeof resultData.chapterOutputDir !== 'string') {
      return null;
    }
    return resultData.chapterOutputDir;
  };

  // List chapter files (archive-free fallback for restrictive enterprise proxies/WAFs)
  app.get('/api/jobs/:jobId/chapters/files', requireAuth, (req: AuthRequest, res: Response) => {
    const { jobId } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.queue !== 'chapter-splitting') {
      return res.status(400).json({ error: 'Not a chapter splitting job' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        error: 'Job not completed',
        status: job.status,
      });
    }

    const outputDir = getChapterOutputDir(job);
    if (!outputDir || !fs.existsSync(outputDir)) {
      return res.status(410).json({ error: 'Chapter files have expired' });
    }

    const files = fs
      .readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.mp4' && ext !== '.srt') return null;

        const absPath = path.join(outputDir, entry.name);
        let size = 0;
        try {
          size = fs.statSync(absPath).size;
        } catch {
          size = 0;
        }

        const fileType = ext === '.mp4' ? 'video' : 'subtitle';

        return {
          name: entry.name,
          size,
          type: fileType,
          url: `/api/jobs/${jobId}/chapters/files/${encodeURIComponent(entry.name)}`,
        };
      })
      .filter((item): item is { name: string; size: number; type: 'video' | 'subtitle'; url: string } => !!item)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    return res.json({
      files,
      totalFiles: files.length,
      totalBytes,
    });
  });

  // Download one chapter file directly (avoids large archive scanning limits in some networks)
  app.get('/api/jobs/:jobId/chapters/files/:fileName', requireAuth, (req: AuthRequest, res: Response) => {
    const { jobId } = req.params;
    const { fileName } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.queue !== 'chapter-splitting') {
      return res.status(400).json({ error: 'Not a chapter splitting job' });
    }
    if (job.status !== 'completed') {
      return res.status(400).json({
        error: 'Job not completed',
        status: job.status,
      });
    }

    const outputDir = getChapterOutputDir(job);
    if (!outputDir || !fs.existsSync(outputDir)) {
      return res.status(410).json({ error: 'Chapter files have expired' });
    }

    if (!fileName || path.basename(fileName) !== fileName || fileName.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const resolvedBase = path.resolve(outputDir);
    const filePath = path.resolve(outputDir, fileName);
    if (!filePath.startsWith(`${resolvedBase}${path.sep}`) && filePath !== resolvedBase) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(fileName).toLowerCase();
    const contentType =
      ext === '.mp4'
        ? 'video/mp4'
        : ext === '.srt'
          ? 'application/x-subrip'
          : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    readStream.on('error', (err) => {
      console.error('[Jobs] Error streaming chapter file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });
  });

  // Download chapter splitting result (archive file)
  app.get('/api/jobs/:jobId/chapters', requireAuth, (req: AuthRequest, res: Response) => {
    const { jobId } = req.params;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const job = getJobForUserOrWorkspace(jobId, req.userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.queue !== 'chapter-splitting') {
      return res.status(400).json({ error: 'Not a chapter splitting job' });
    }

    if (job.status !== 'completed' || !job.result_file_path) {
      return res.status(400).json({
        error: 'Job not completed or result not available',
        status: job.status,
      });
    }

    // Check if file exists
    if (!fs.existsSync(job.result_file_path)) {
      deleteJob(jobId);
      return res.status(410).json({ error: 'Result file has expired' });
    }

    // Parse result data for filename
    let filenameBase = `chapters_${jobId}`;
    try {
      const inputData = JSON.parse(job.input_data || '{}');
      const originalName = inputData.originalName || 'video';
      const baseName = path.basename(originalName, path.extname(originalName));
      filenameBase = `${baseName}_chapters`;
    } catch {}

    // Determine content type based on file extension
    const isZip = job.result_file_path.endsWith('.zip');
    const contentType = isZip ? 'application/zip' : 'application/gzip';
    const ext = isZip ? '.zip' : '.tar.gz';
    const filename = `${filenameBase}${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const readStream = fs.createReadStream(job.result_file_path);
    readStream.pipe(res);

    readStream.on('error', (err) => {
      console.error('[Jobs] Error streaming chapters:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream result' });
      }
    });
  });
}
