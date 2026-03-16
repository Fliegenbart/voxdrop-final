/**
 * Session Routes
 *
 * API endpoints for session-based file storage and video processing.
 */

import express, { Express, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { detectFileType } from '../utils/file-type';
import { getTmpDir } from '../utils/tmp';

import { gpuRateLimit, requireAdmin, requireAuth, requireMinPlan } from '../auth/middleware';
import { CREDIT_COSTS, PLAN_CONFIG, SUBSCRIPTION_PLAN_MAP, type PlanId } from '../billing/config';
import { addCredits, ensureCreditWallet, getOrCreateDefaultWorkspaceForUser, spendCredits } from '../db/queries';

import {
  getOrCreateSession,
  getSession,
  addFileToSession,
  getSessionFile,
  getSessionFiles,
  deleteSessionFile,
  deleteSession,
  getRecentSessionsForOwner,
  getSessionStats,
  SessionFile
} from '../services/session-storage';

import {
  cutVideo,
  cutMultipleSegments,
  mergeVideos,
  combineVideoAudio,
  extractFreezeFrame,
  renderTimeline,
  getVideoDuration,
  getVideoMetadata,
  createProxyVideo,
  CutSegment,
  TimelineClip,
  TimelineTrack
} from '../services/video-processor';

const resolvePlanId = (subscription: string | undefined): PlanId => {
  const raw = subscription || 'free';
  return SUBSCRIPTION_PLAN_MAP[raw] || 'free';
};

const maxUploadBytesForPlan = (planId: PlanId): number => {
  const maxMb = PLAN_CONFIG[planId]?.rateLimits.maxJobSizeMb ?? PLAN_CONFIG.free.rateLimits.maxJobSizeMb;
  return Math.max(1, Math.floor(maxMb)) * 1024 * 1024;
};

const estimateBillableMinutesFromSeconds = (seconds: number): number => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(1, Math.ceil(seconds / 60));
};

const spendVideoEditCreditsOrThrow = (req: Request, outputSeconds: number, meta: object) => {
  const minutes = estimateBillableMinutesFromSeconds(outputSeconds);
  const perMinute = CREDIT_COSTS.VIDEO_EDIT_MINUTE.credits;
  const credits = minutes * perMinute;

  const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
  const planId = workspace.plan_id as PlanId;

  if (credits <= 0) {
    return { workspaceId: workspace.id, credits: 0 };
  }

  const wallet = ensureCreditWallet(workspace.id, planId);
  if (wallet.balance < credits) {
    throw new Error('insufficient_credits');
  }

  spendCredits(workspace.id, credits, null, {
    costKey: 'VIDEO_EDIT_MINUTE',
    minutes,
    ...meta,
  });

  return { workspaceId: workspace.id, credits };
};

// Multer configuration
const SESSION_UPLOAD_LIMIT_BYTES = maxUploadBytesForPlan('premium');
const upload = multer({
  dest: getTmpDir(),
  limits: { fileSize: SESSION_UPLOAD_LIMIT_BYTES },
});

const SESSION_CHUNK_SIZE_MB = Number(process.env.SESSION_CHUNK_SIZE_MB || 10);
const DEFAULT_CHUNK_SIZE = Math.max(2, Math.min(64, Math.round(SESSION_CHUNK_SIZE_MB))) * 1024 * 1024;
const chunkUpload = multer({
  dest: getTmpDir(),
  limits: { fileSize: DEFAULT_CHUNK_SIZE + 1024 },
});
const STALE_UPLOAD_MAX_AGE_HOURS = Number(process.env.SESSION_UPLOAD_MAX_AGE_HOURS || 72);
const STALE_UPLOAD_MAX_AGE_MS = Math.max(6, STALE_UPLOAD_MAX_AGE_HOURS) * 60 * 60 * 1000;
const PROXY_JOB_MAX_AGE_HOURS = Number(process.env.SESSION_PROXY_JOB_MAX_AGE_HOURS || 24);
const PROXY_JOB_MAX_AGE_MS = Math.max(1, PROXY_JOB_MAX_AGE_HOURS) * 60 * 60 * 1000;
const UPLOADS_DIR = path.join(getTmpDir(), 'voxdrop-session-uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface UploadMeta {
  id: string;
  ownerId: number;
  sessionId: string;
  filename: string;
  mimeType: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  createdAt: string;
  updatedAt: string;
}

const proxyJobs = new Map<string, { status: 'processing' | 'completed' | 'failed'; path: string; error?: string; updatedAt: number }>();

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuidV4(value: string | undefined | null): boolean {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

const sessionKey = (req: Request): string => String(req.user?.id ?? req.ip ?? 'unknown');

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

type VideoFastMode = 'reencode' | 'auto' | 'copy';
const resolveFastMode = (value: unknown): VideoFastMode => {
  const v = String(value || '').toLowerCase();
  if (v === 'copy') return 'copy';
  if (v === 'auto') return 'auto';
  return 'auto';
};

type VideoAspect = '16:9' | '4:3' | '9:16';
const resolveAspect = (value: unknown): VideoAspect | undefined => {
  const v = String(value || '');
  if (v === '16:9' || v === '4:3' || v === '9:16') return v;
  return undefined;
};

const resolveBool = (value: unknown): boolean => {
  const v = String(value ?? '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

const SESSION_RATE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_UPLOAD_INIT_LIMIT = clampInt(Number(process.env.SESSION_UPLOAD_INIT_LIMIT || 200), 20, 2000);
const SESSION_UPLOAD_CHUNK_LIMIT = clampInt(Number(process.env.SESSION_UPLOAD_CHUNK_LIMIT || 6000), 200, 50000);
const SESSION_UPLOAD_COMPLETE_LIMIT = clampInt(Number(process.env.SESSION_UPLOAD_COMPLETE_LIMIT || 200), 20, 2000);
const SESSION_FILE_UPLOAD_LIMIT = clampInt(Number(process.env.SESSION_FILE_UPLOAD_LIMIT || 80), 10, 2000);

const VIDEO_EDIT_RATE_LIMITS: Record<string, number> = {
  pro: clampInt(Number(process.env.VIDEO_EDIT_RATE_LIMIT_PRO || 20), 2, 200),
  premium: clampInt(Number(process.env.VIDEO_EDIT_RATE_LIMIT_PREMIUM || 40), 2, 500),
  team: clampInt(Number(process.env.VIDEO_EDIT_RATE_LIMIT_TEAM || 60), 2, 1000),
};

// These endpoints are hit frequently (chunk upload) and should not be too strict.
const uploadInitLimiter = rateLimit({
  windowMs: SESSION_RATE_WINDOW_MS,
  max: SESSION_UPLOAD_INIT_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: sessionKey,
});

const uploadChunkLimiter = rateLimit({
  windowMs: SESSION_RATE_WINDOW_MS,
  max: SESSION_UPLOAD_CHUNK_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: sessionKey,
});

const uploadCompleteLimiter = rateLimit({
  windowMs: SESSION_RATE_WINDOW_MS,
  max: SESSION_UPLOAD_COMPLETE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: sessionKey,
});

const sessionFileUploadLimiter = rateLimit({
  windowMs: SESSION_RATE_WINDOW_MS,
  max: SESSION_FILE_UPLOAD_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: sessionKey,
});

// Proxy upload-limit tester (hidden tool page at /tools/proxy-test/)
const PROXY_TEST_LIMIT_BYTES = Math.round(Number(process.env.PROXY_TEST_LIMIT_MB || 450)) * 1024 * 1024;
const proxyTestLimiter = rateLimit({
  windowMs: SESSION_RATE_WINDOW_MS,
  max: clampInt(Number(process.env.PROXY_TEST_RATE_LIMIT || 120), 20, 5000),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: sessionKey,
});

type ProxyTestEvent = {
  id: string;
  ts: string;
  userId: number;
  ip: string;
  ua: string;
  contentType: string;
  contentLength: number | null;
  received: number;
  expected: number;
  ok: boolean;
  status: number;
  note?: string;
};

const PROXY_TEST_LOG_LIMIT = clampInt(Number(process.env.PROXY_TEST_LOG_LIMIT || 50), 5, 200);
const proxyTestEventsByUser = new Map<number, ProxyTestEvent[]>();
function addProxyTestEvent(userId: number, ev: ProxyTestEvent) {
  const list = proxyTestEventsByUser.get(userId) || [];
  list.push(ev);
  if (list.length > PROXY_TEST_LOG_LIMIT) {
    list.splice(0, list.length - PROXY_TEST_LOG_LIMIT);
  }
  proxyTestEventsByUser.set(userId, list);
}

const getUploadDir = (uploadId: string) => path.join(UPLOADS_DIR, uploadId);
const getUploadMetaPath = (uploadId: string) => path.join(getUploadDir(uploadId), 'meta.json');
const getProxyPath = (filePath: string) => path.join(
  path.dirname(filePath),
  `${path.basename(filePath, path.extname(filePath))}.proxy.mp4`
);

function readUploadMeta(uploadId: string): UploadMeta | null {
  const metaPath = getUploadMetaPath(uploadId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as UploadMeta;
  } catch {
    return null;
  }
}

function writeUploadMeta(uploadId: string, meta: UploadMeta) {
  const uploadDir = getUploadDir(uploadId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  fs.writeFileSync(getUploadMetaPath(uploadId), JSON.stringify(meta, null, 2));
}

function cleanupUpload(uploadId: string) {
  const uploadDir = getUploadDir(uploadId);
  if (!fs.existsSync(uploadDir)) return;
  try {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  } catch {}
}

function cleanupStaleUploads(maxAgeMs = STALE_UPLOAD_MAX_AGE_MS) {
  const now = Date.now();
  try {
    const entries = fs.readdirSync(UPLOADS_DIR);
    for (const entry of entries) {
      const metaPath = path.join(UPLOADS_DIR, entry, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as UploadMeta;
        const updatedAt = new Date(meta.updatedAt).getTime();
        if (now - updatedAt > maxAgeMs) {
          cleanupUpload(entry);
        }
      } catch {
        // Ignore bad metadata
      }
    }
  } catch {
    // Ignore cleanup failures
  }
}

function cleanupProxyJobs(maxAgeMs = PROXY_JOB_MAX_AGE_MS) {
  const now = Date.now();
  for (const [key, job] of proxyJobs.entries()) {
    if (now - job.updatedAt > maxAgeMs) {
      proxyJobs.delete(key);
    }
  }
}

// Allowed video MIME types
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska'
]);

// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4'
]);

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
]);

// Combined allowed types for upload
const ALLOWED_MEDIA_TYPES = new Set([...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_IMAGE_TYPES]);

function normalizeDeclaredMimeType(mimeType?: string): string {
  const raw = String(mimeType || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(';')[0].trim();
}

export function registerSessionRoutes(app: Express) {
  cleanupStaleUploads(STALE_UPLOAD_MAX_AGE_MS);
  cleanupProxyJobs(PROXY_JOB_MAX_AGE_MS);
  setInterval(() => cleanupStaleUploads(STALE_UPLOAD_MAX_AGE_MS), 60 * 60 * 1000);
  setInterval(() => cleanupProxyJobs(PROXY_JOB_MAX_AGE_MS), 60 * 60 * 1000);

  /**
   * Resumable upload init
   */
  app.post('/api/session/uploads/init', requireAuth, requireMinPlan('pro'), uploadInitLimiter, async (req: Request, res: Response) => {
    const { filename, mimeType, size, uploadId } = req.body as {
      filename?: string;
      mimeType?: string;
      size?: number;
      uploadId?: string;
    };

    if (!filename || !mimeType || !size || size <= 0) {
      return res.status(400).json({ error: 'filename, mimeType, and size are required' });
    }
    const normalizedMimeType = normalizeDeclaredMimeType(mimeType);
    if (!normalizedMimeType) {
      return res.status(400).json({ error: 'Invalid mimeType' });
    }

    const planId = resolvePlanId(req.user!.subscription);
    const maxBytes = maxUploadBytesForPlan(planId);
    if (size > maxBytes) {
      return res.status(413).json({ error: 'File too large' });
    }

    const sessionId = req.headers['x-session-id'] as string;
    const session = getOrCreateSession(sessionId, req.user!.id);

    if (uploadId) {
      if (!isUuidV4(uploadId)) {
        return res.status(400).json({ error: 'Invalid uploadId' });
      }
      const existing = readUploadMeta(uploadId);
      if (existing && existing.ownerId === req.user!.id && existing.size === size && existing.filename === filename) {
        return res.json({
          uploadId: existing.id,
          chunkSize: existing.chunkSize,
          totalChunks: existing.totalChunks,
          receivedChunks: existing.receivedChunks,
          sessionId: existing.sessionId
        });
      }
    }

    const newUploadId = uuidv4();
    const totalChunks = Math.ceil(size / DEFAULT_CHUNK_SIZE);
    const now = new Date().toISOString();

    const meta: UploadMeta = {
      id: newUploadId,
      ownerId: req.user!.id,
      sessionId: session.id,
      filename,
      mimeType: normalizedMimeType,
      size,
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks,
      receivedChunks: [],
      createdAt: now,
      updatedAt: now
    };

    writeUploadMeta(newUploadId, meta);

    res.json({
      uploadId: newUploadId,
      chunkSize: meta.chunkSize,
      totalChunks: meta.totalChunks,
      receivedChunks: meta.receivedChunks,
      sessionId: meta.sessionId
    });
  });

  /**
   * Resumable upload chunk
   */
  app.post('/api/session/uploads/:uploadId/chunk', requireAuth, requireMinPlan('pro'), uploadChunkLimiter, express.raw({ type: () => true, limit: DEFAULT_CHUNK_SIZE + 1024 }), (req: Request, res: Response) => {
    const { uploadId } = req.params;
    if (!isUuidV4(uploadId)) {
      return res.status(400).json({ error: 'Invalid uploadId' });
    }
    const meta = readUploadMeta(uploadId);
    if (!meta) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    if (meta.ownerId !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Some corporate proxies/DLP solutions strip custom headers. Support query params as a fallback.
    const chunkIndex = Number((req.headers['x-chunk-index'] as string | undefined) ?? (req.query.i as string | undefined) ?? (req.query.chunkIndex as string | undefined));
    const totalChunks = Number((req.headers['x-total-chunks'] as string | undefined) ?? (req.query.n as string | undefined) ?? (req.query.totalChunks as string | undefined));

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || !Number.isInteger(totalChunks) || totalChunks <= 0) {
      return res.status(400).json({ error: 'Invalid chunk headers' });
    }

    if (totalChunks !== meta.totalChunks) {
      return res.status(409).json({ error: 'Chunk count mismatch' });
    }

    if (chunkIndex >= meta.totalChunks) {
      return res.status(400).json({ error: 'Chunk index out of range' });
    }

    const uploadDir = getUploadDir(uploadId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const chunkPath = path.join(uploadDir, `chunk_${chunkIndex}`);
    try {
      fs.writeFileSync(chunkPath, req.body as Buffer);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to save chunk' });
    }

    if (!meta.receivedChunks.includes(chunkIndex)) {
      meta.receivedChunks.push(chunkIndex);
      meta.receivedChunks.sort((a, b) => a - b);
    }
    meta.updatedAt = new Date().toISOString();
    writeUploadMeta(uploadId, meta);

    res.json({ received: meta.receivedChunks.length, total: meta.totalChunks });
  });

  /**
   * Resumable upload chunk (multipart fallback for strict proxies/WAFs)
   */
  app.post('/api/session/uploads/:uploadId/chunk-multipart', requireAuth, requireMinPlan('pro'), uploadChunkLimiter, chunkUpload.single('chunk'), (req: Request, res: Response) => {
    const { uploadId } = req.params;
    if (!isUuidV4(uploadId)) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ error: 'Invalid uploadId' });
    }

    const meta = readUploadMeta(uploadId);
    if (!meta) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(404).json({ error: 'Upload not found' });
    }
    if (meta.ownerId !== req.user!.id) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(403).json({ error: 'Forbidden' });
    }

    const chunkIndex = Number(
      (req.body?.chunkIndex as string | undefined) ??
      (req.headers['x-chunk-index'] as string | undefined) ??
      (req.query.i as string | undefined) ??
      (req.query.chunkIndex as string | undefined)
    );
    const totalChunks = Number(
      (req.body?.totalChunks as string | undefined) ??
      (req.headers['x-total-chunks'] as string | undefined) ??
      (req.query.n as string | undefined) ??
      (req.query.totalChunks as string | undefined)
    );

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || !Number.isInteger(totalChunks) || totalChunks <= 0) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ error: 'Invalid chunk headers' });
    }

    if (totalChunks !== meta.totalChunks) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(409).json({ error: 'Chunk count mismatch' });
    }

    if (chunkIndex >= meta.totalChunks) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ error: 'Chunk index out of range' });
    }

    if (!req.file?.path) {
      return res.status(400).json({ error: 'No chunk provided' });
    }

    const uploadDir = getUploadDir(uploadId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const chunkPath = path.join(uploadDir, `chunk_${chunkIndex}`);
    try {
      fs.copyFileSync(req.file.path, chunkPath);
      fs.unlinkSync(req.file.path);
    } catch {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(500).json({ error: 'Failed to save chunk' });
    }

    if (!meta.receivedChunks.includes(chunkIndex)) {
      meta.receivedChunks.push(chunkIndex);
      meta.receivedChunks.sort((a, b) => a - b);
    }
    meta.updatedAt = new Date().toISOString();
    writeUploadMeta(uploadId, meta);

    res.json({ received: meta.receivedChunks.length, total: meta.totalChunks, fallback: 'multipart' });
  });

  /**
   * Resumable upload complete
   */
  app.post('/api/session/uploads/:uploadId/complete', requireAuth, requireMinPlan('pro'), uploadCompleteLimiter, async (req: Request, res: Response) => {
    const { uploadId } = req.params;
    if (!isUuidV4(uploadId)) {
      return res.status(400).json({ error: 'Invalid uploadId' });
    }
    const meta = readUploadMeta(uploadId);
    if (!meta) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    if (meta.ownerId !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const missingChunks = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      if (!meta.receivedChunks.includes(i)) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      return res.status(409).json({ error: 'Upload incomplete', missingChunks });
    }

    const uploadDir = getUploadDir(uploadId);
    // Never use user-controlled filenames for paths.
    const assembledPath = path.join(uploadDir, 'assembled.upload');

    try {
      const output = fs.createWriteStream(assembledPath);
      for (let i = 0; i < meta.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${i}`);
        if (!fs.existsSync(chunkPath)) {
          output.close();
          return res.status(500).json({ error: `Missing chunk ${i}` });
        }
        await new Promise<void>((resolve, reject) => {
          const input = fs.createReadStream(chunkPath);
          input.on('error', reject);
          input.on('end', resolve);
          input.pipe(output, { end: false });
        });
      }
      await new Promise<void>((resolve, reject) => {
        output.end(() => resolve());
        output.on('error', reject);
      });
    } catch {
      return res.status(500).json({ error: 'Failed to assemble upload' });
    }

    // Validate file type
    const detected = await detectFileType(assembledPath);
    const detectedMime = detected?.mime;
    const effectiveMime = detectedMime || normalizeDeclaredMimeType(meta.mimeType);

    if (!effectiveMime || !ALLOWED_MEDIA_TYPES.has(effectiveMime)) {
      cleanupUpload(uploadId);
      return res.status(400).json({ error: 'Invalid file type' });
    }

    const session = getOrCreateSession(meta.sessionId, req.user!.id);
    const sessionFile = addFileToSession(
      session.id,
      assembledPath,
      meta.filename,
      effectiveMime
    );

    if (!sessionFile) {
      cleanupUpload(uploadId);
      return res.status(500).json({ error: 'Failed to save file to session' });
    }

    cleanupUpload(uploadId);

    const metadata = await getVideoMetadata(sessionFile.path);

    res.json({
      sessionId: session.id,
      file: {
        id: sessionFile.id,
        name: sessionFile.originalName,
        mimeType: sessionFile.mimeType,
        size: sessionFile.size,
        createdAt: sessionFile.createdAt,
        metadata
      }
    });
  });

  /**
   * Get or create session
   * Returns session ID and list of files
   */
  app.get('/api/session', requireAuth, (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const session = getOrCreateSession(sessionId, req.user!.id);

    res.json({
      sessionId: session.id,
      files: session.files.map(f => ({
        id: f.id,
        name: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt
      })),
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt
    });
  });

  /**
   * List recent active sessions for the current user
   */
  app.get('/api/session/recent', requireAuth, (req: Request, res: Response) => {
    const limit = clampInt(Number(req.query.limit || 12), 1, 50);
    const sessions = getRecentSessionsForOwner(req.user!.id, limit);

    res.json({
      sessions: sessions.map((session) => {
        const videoCount = session.files.filter((file) => file.mimeType.startsWith('video/')).length;
        return {
          sessionId: session.id,
          createdAt: session.createdAt,
          lastAccessedAt: session.lastAccessedAt,
          expiresAt: session.expiresAt,
          fileCount: session.files.length,
          videoCount,
          files: session.files.map((file) => ({
            id: file.id,
            name: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            createdAt: file.createdAt
          }))
        };
      })
    });
  });

  /**
   * Upload file to session
   */
  app.post('/api/session/files', requireAuth, requireMinPlan('pro'), sessionFileUploadLimiter, upload.single('file'), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const planId = resolvePlanId(req.user!.subscription);
    const maxBytes = maxUploadBytesForPlan(planId);
    if (file.size > maxBytes) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(413).json({ error: 'File too large' });
    }

    // Validate file type (magic bytes + declared MIME)
    const detected = await detectFileType(file.path);
    const detectedMime = detected?.mime;
    const effectiveMime = detectedMime || normalizeDeclaredMimeType(file.mimetype);

    if (!effectiveMime || !ALLOWED_MEDIA_TYPES.has(effectiveMime)) {
      // Cleanup temp file
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(400).json({
        error: 'Invalid file type',
        allowed: Array.from(ALLOWED_MEDIA_TYPES)
      });
    }

    // Get or create session
    const session = getOrCreateSession(sessionId, req.user!.id);

    // Add file to session
    const sessionFile = addFileToSession(
      session.id,
      file.path,
      file.originalname,
      effectiveMime
    );

    if (!sessionFile) {
      return res.status(500).json({ error: 'Failed to save file to session' });
    }

    // Get video metadata
    const metadata = await getVideoMetadata(sessionFile.path);

    res.json({
      sessionId: session.id,
      file: {
        id: sessionFile.id,
        name: sessionFile.originalName,
        mimeType: sessionFile.mimeType,
        size: sessionFile.size,
        createdAt: sessionFile.createdAt,
        metadata
      }
    });
  });

  /**
   * List all files in session
   */
  app.get('/api/session/files', requireAuth, (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const files = getSessionFiles(sessionId, req.user!.id);

    res.json({
      sessionId,
      files: files.map(f => ({
        id: f.id,
        name: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt
      }))
    });
  });

  /**
   * Get/stream a file from session
   * Supports both header (X-Session-ID) and query param (?session=xxx) for session ID
   * Query param is needed for video streaming where headers can't be set
   */
  app.get('/api/session/files/:fileId/proxy/status', requireAuth, (req: Request, res: Response) => {
    const sessionId = (req.headers['x-session-id'] as string) || (req.query.session as string);
    const { fileId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required (use X-Session-ID header or ?session= query param)' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const proxyPath = getProxyPath(file.path);
    if (fs.existsSync(proxyPath)) {
      const stats = fs.statSync(proxyPath);
      return res.json({ status: 'completed', size: stats.size });
    }

    const key = `${sessionId}:${fileId}`;
    const job = proxyJobs.get(key);
    if (!job) {
      return res.json({ status: 'pending' });
    }
    return res.json({ status: job.status, error: job.error });
  });

  app.post('/api/session/files/:fileId/proxy', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = (req.headers['x-session-id'] as string) || (req.query.session as string);
    const { fileId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required (use X-Session-ID header or ?session= query param)' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!file.mimeType.startsWith('video/')) {
      return res.status(400).json({ error: 'File must be a video' });
    }

    const proxyPath = getProxyPath(file.path);
    if (fs.existsSync(proxyPath)) {
      return res.json({ status: 'completed' });
    }

    const key = `${sessionId}:${fileId}`;
    const existing = proxyJobs.get(key);
    if (existing && existing.status === 'processing') {
      return res.status(202).json({ status: 'processing' });
    }

    proxyJobs.set(key, { status: 'processing', path: proxyPath, updatedAt: Date.now() });
    createProxyVideo(file.path, proxyPath)
      .then(result => {
        if (result.success) {
          proxyJobs.set(key, { status: 'completed', path: proxyPath, updatedAt: Date.now() });
        } else {
          proxyJobs.set(key, { status: 'failed', path: proxyPath, error: result.error, updatedAt: Date.now() });
        }
      })
      .catch(error => {
        proxyJobs.set(key, { status: 'failed', path: proxyPath, error: String(error), updatedAt: Date.now() });
      });

    return res.status(202).json({ status: 'processing' });
  });

  app.get('/api/session/files/:fileId/proxy', requireAuth, (req: Request, res: Response) => {
    const sessionId = (req.headers['x-session-id'] as string) || (req.query.session as string);
    const { fileId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required (use X-Session-ID header or ?session= query param)' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const proxyPath = getProxyPath(file.path);
    if (!fs.existsSync(proxyPath)) {
      return res.status(404).json({ error: 'Proxy not ready' });
    }

    const stat = fs.statSync(proxyPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });

      fs.createReadStream(proxyPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`
      });

      fs.createReadStream(proxyPath).pipe(res);
    }
  });

  app.get('/api/session/files/:fileId', requireAuth, (req: Request, res: Response) => {
    const sessionId = (req.headers['x-session-id'] as string) || (req.query.session as string);
    const { fileId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required (use X-Session-ID header or ?session= query param)' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Support range requests for video streaming
    const stat = fs.statSync(file.path);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': file.mimeType
      });

      fs.createReadStream(file.path, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`
      });

      fs.createReadStream(file.path).pipe(res);
    }
  });

  /**
   * Get file metadata
   */
  app.get('/api/session/files/:fileId/metadata', requireAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const metadata = await getVideoMetadata(file.path);

    res.json({
      id: file.id,
      name: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      metadata
    });
  });

  /**
   * Delete file from session
   */
  app.delete('/api/session/files/:fileId', requireAuth, (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const success = deleteSessionFile(sessionId, fileId, req.user!.id);

    if (!success) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ success: true });
  });

  /**
   * Delete entire session
   */
  app.delete('/api/session', requireAuth, (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const success = deleteSession(sessionId, req.user!.id);

    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  });

  /**
   * Proxy upload-limit tester endpoint (accepts raw body and echoes received byte size).
   * Requires auth to avoid turning this into a public "upload anything" endpoint.
   */
  app.get('/api/proxy-test', requireAuth, (_req: Request, res: Response) => {
    res.setHeader('X-Voxdrop-ProxyTest', '1');
    res.json({
      status: 'ready',
      maxBytes: PROXY_TEST_LIMIT_BYTES,
      info: 'POST any content-type to this endpoint (raw or multipart) to test proxy limits',
    });
  });

  // Returns the most recent proxy-test events for the current user (helps debugging corporate proxies).
  app.get('/api/proxy-test/logs', requireAuth, (req: Request, res: Response) => {
    const userId = req.user!.id;
    const events = proxyTestEventsByUser.get(userId) || [];
    res.setHeader('X-Voxdrop-ProxyTest', '1');
    res.json({ ok: true, count: events.length, events });
  });

  app.post(
    '/api/proxy-test',
    requireAuth,
    proxyTestLimiter,
    // Accept any content-type so corporate proxies can do their "media type detection"
    // (some block application/octet-stream or require multipart/form-data).
    express.raw({ type: '*/*', limit: PROXY_TEST_LIMIT_BYTES }),
    (req: Request, res: Response) => {
      const requestId = uuidv4();
      const received = Buffer.isBuffer(req.body) ? (req.body as Buffer).length : 0;
      const expected = Number.parseInt(String(req.headers['x-test-size'] || '0'), 10) || 0;
      const contentType = String(req.headers['content-type'] || '');
      const ua = String(req.headers['user-agent'] || '');
      const ip = String((req.headers['x-forwarded-for'] || req.ip || '')).split(',')[0].trim();
      const contentLengthHeader = Number.parseInt(String(req.headers['content-length'] || '0'), 10);
      const contentLength = Number.isFinite(contentLengthHeader) && contentLengthHeader > 0 ? contentLengthHeader : null;

      res.setHeader('X-Voxdrop-ProxyTest', '1');
      res.setHeader('X-Voxdrop-ProxyTest-RequestId', requestId);
      addProxyTestEvent(req.user!.id, {
        id: requestId,
        ts: new Date().toISOString(),
        userId: req.user!.id,
        ip,
        ua,
        contentType,
        contentLength,
        received,
        expected,
        ok: true,
        status: 200,
      });

      res.json({
        ok: true,
        id: requestId,
        received,
        expected,
        contentType: String(req.headers['content-type'] || ''),
        contentLength: Number.parseInt(String(req.headers['content-length'] || '0'), 10) || null,
        // Note: multipart/form-data adds boundary bytes, so exact match isn't guaranteed.
        match: expected > 0 ? received === expected : null,
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (err: any, req: Request, res: Response, _next: any) => {
      const requestId = uuidv4();
      const contentType = String(req.headers['content-type'] || '');
      const ua = String(req.headers['user-agent'] || '');
      const ip = String((req.headers['x-forwarded-for'] || req.ip || '')).split(',')[0].trim();
      const contentLengthHeader = Number.parseInt(String(req.headers['content-length'] || '0'), 10);
      const contentLength = Number.isFinite(contentLengthHeader) && contentLengthHeader > 0 ? contentLengthHeader : null;
      const expected = Number.parseInt(String(req.headers['x-test-size'] || '0'), 10) || 0;

      const status = err?.type === 'entity.too.large' ? 413 : 400;
      const note = String(err?.type || err?.message || 'body_parse_error');

      if (req.user?.id) {
        addProxyTestEvent(req.user.id, {
          id: requestId,
          ts: new Date().toISOString(),
          userId: req.user.id,
          ip,
          ua,
          contentType,
          contentLength,
          received: 0,
          expected,
          ok: false,
          status,
          note,
        });
      }

      res.setHeader('X-Voxdrop-ProxyTest', '1');
      res.setHeader('X-Voxdrop-ProxyTest-RequestId', requestId);
      res.status(status).json({ ok: false, id: requestId, error: note });
    }
  );

  /**
   * Cut video into segments
   */
  app.post('/api/video/cut', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileId, segments, maxSizeMb, aspect, normalizeAudio, fastMode } = req.body as {
      fileId: string;
      segments: CutSegment[];
      maxSizeMb?: number;
      aspect?: VideoAspect;
      normalizeAudio?: boolean;
      fastMode?: VideoFastMode;
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!fileId || !segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'fileId and segments array required' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get session to add new files
    const session = getSession(sessionId, req.user!.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Create output directory in session
    const outputDir = path.dirname(file.path);

    console.log(`[Session] Cutting video ${file.originalName} into ${segments.length} segments`);

    const outputSeconds = segments.reduce((sum, seg) => {
      const start = Number(seg?.start);
      const end = Number(seg?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return sum;
      return sum + Math.max(0, end - start);
    }, 0);

    let billing: { workspaceId: string; credits: number } | null = null;
    try {
      billing = spendVideoEditCreditsOrThrow(req, outputSeconds, { action: 'video_cut', segmentCount: segments.length });

      const effectiveMaxSizeMb = Number.isFinite(Number(maxSizeMb)) ? Number(maxSizeMb) : undefined;
      const result = await cutMultipleSegments(file.path, outputDir, segments, {
        maxSizeMb: effectiveMaxSizeMb,
        resolution: effectiveMaxSizeMb ? '720p' : undefined,
        aspect: resolveAspect(aspect),
        normalizeAudio: resolveBool(normalizeAudio),
        fastMode: resolveFastMode(fastMode),
      });

      // Add resulting files to session
      const newFiles: SessionFile[] = [];
      for (const outputPath of result.files) {
        const baseName = path.basename(file.originalName, path.extname(file.originalName));
        const clipNumber = newFiles.length + 1;
        const newFileName = `${baseName}_clip${clipNumber}.mp4`;

        const sessionFile = addFileToSession(
          sessionId,
          outputPath,
          newFileName,
          'video/mp4'
        );

        if (sessionFile) {
          newFiles.push(sessionFile);
        }
      }

      if (!result.success && billing?.credits && newFiles.length === 0) {
        try {
          addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_cut', reason: 'no_output_files' });
        } catch {}
      }

      res.json({
        success: result.success,
        files: newFiles.map(f => ({
          id: f.id,
          name: f.originalName,
          mimeType: f.mimeType,
          size: f.size,
          createdAt: f.createdAt
        })),
        errors: result.errors
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (billing?.credits) {
        try {
          addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_cut', error: message });
        } catch {}
      }
      return res.status(500).json({ error: message || 'Failed to cut video' });
    }
  });

  /**
   * Cut (keep segments) and merge into a single output video.
   * Useful for text-based editing (remove parts of transcript -> keep the rest).
   */
  app.post('/api/video/cut-merge', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileId, segments, outputName, maxSizeMb, aspect, normalizeAudio, fastMode } = req.body as {
      fileId: string;
      segments: CutSegment[];
      outputName?: string;
      maxSizeMb?: number;
      aspect?: VideoAspect;
      normalizeAudio?: boolean;
      fastMode?: VideoFastMode;
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    if (!fileId || !segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'fileId and segments array required' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const session = getSession(sessionId, req.user!.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const outputDir = path.dirname(file.path);
    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    const format = 'mp4';
    const outputFileName = outputName || `${baseName}_textcut_${uuidv4().slice(0, 8)}.${format}`;
    const mergedOutputPath = path.join(outputDir, `${uuidv4()}.${format}`);

    const keepSegments: CutSegment[] = segments
      .map((s) => ({ start: Number((s as any)?.start), end: Number((s as any)?.end) }))
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
      .sort((a, b) => a.start - b.start);

    if (keepSegments.length === 0) {
      return res.status(400).json({ error: 'segments must contain valid start/end values' });
    }

    const outputSeconds = keepSegments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);

    let billing: { workspaceId: string; credits: number } | null = null;
    const intermediatePaths: string[] = [];
    try {
      billing = spendVideoEditCreditsOrThrow(req, outputSeconds, { action: 'video_cut_merge', segmentCount: keepSegments.length });

      const effectiveMaxSizeMb = Number.isFinite(Number(maxSizeMb)) ? Number(maxSizeMb) : undefined;
      const cut = await cutMultipleSegments(file.path, outputDir, keepSegments, {
        maxSizeMb: effectiveMaxSizeMb,
        resolution: effectiveMaxSizeMb ? '720p' : undefined,
        aspect: resolveAspect(aspect),
        normalizeAudio: resolveBool(normalizeAudio),
        fastMode: resolveFastMode(fastMode),
      });

      intermediatePaths.push(...cut.files);

      if (!cut.success || cut.files.length === 0) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_cut_merge', reason: 'cut_failed' }); } catch {}
        }
        return res.status(500).json({ error: cut.errors?.[0] || 'Cut failed' });
      }

      const merged = await mergeVideos(cut.files, mergedOutputPath, {
        maxSizeMb: effectiveMaxSizeMb,
        durationSeconds: outputSeconds,
        resolution: effectiveMaxSizeMb ? '720p' : undefined,
        aspect: resolveAspect(aspect),
        normalizeAudio: resolveBool(normalizeAudio),
        fastMode: resolveFastMode(fastMode),
      });

      if (!merged.success || !merged.outputPath) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_cut_merge', reason: 'merge_failed', error: merged.error }); } catch {}
        }
        return res.status(500).json({ error: merged.error || 'Merge failed' });
      }

      const sessionFile = addFileToSession(sessionId, merged.outputPath, outputFileName, 'video/mp4');
      if (!sessionFile) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_cut_merge', reason: 'save_failed' }); } catch {}
        }
        return res.status(500).json({ error: 'Failed to save merged video' });
      }

      const metadata = await getVideoMetadata(sessionFile.path);
      return res.json({
        success: true,
        file: {
          id: sessionFile.id,
          name: sessionFile.originalName,
          mimeType: sessionFile.mimeType,
          size: sessionFile.size,
          createdAt: sessionFile.createdAt,
          metadata
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (billing?.credits) {
        try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_cut_merge', error: message }); } catch {}
      }
      return res.status(500).json({ error: message || 'Textschnitt fehlgeschlagen' });
    } finally {
      // Clean up intermediate clip files (not part of session).
      for (const p of intermediatePaths) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  });

  /**
   * Merge multiple videos
   */
  app.post('/api/video/merge', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileIds, outputName, maxSizeMb, aspect, normalizeAudio, fastMode } = req.body as {
      fileIds: string[];
      outputName?: string;
      maxSizeMb?: number;
      aspect?: VideoAspect;
      normalizeAudio?: boolean;
      fastMode?: VideoFastMode;
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 fileIds required' });
    }

    const session = getSession(sessionId, req.user!.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get all input files
    const inputPaths: string[] = [];
    for (const fileId of fileIds) {
      const file = getSessionFile(sessionId, fileId, req.user!.id);
      if (!file) {
        return res.status(404).json({ error: `File not found: ${fileId}` });
      }
      inputPaths.push(file.path);
    }

    // Create output path
    const outputFileName = outputName || `merged_${uuidv4().slice(0, 8)}.mp4`;
    const outputPath = path.join(path.dirname(inputPaths[0]), outputFileName);

    console.log(`[Session] Merging ${inputPaths.length} videos`);

    let billing: { workspaceId: string; credits: number } | null = null;
    try {
      const durations = await Promise.all(inputPaths.map(p => getVideoDuration(p)));
      const outputSeconds = durations.reduce((sum, seconds) => sum + (Number.isFinite(seconds) ? Math.max(0, seconds) : 0), 0);
      billing = spendVideoEditCreditsOrThrow(req, outputSeconds, { action: 'video_merge', inputCount: inputPaths.length });

      const effectiveMaxSizeMb = Number.isFinite(Number(maxSizeMb)) ? Number(maxSizeMb) : undefined;
      const result = await mergeVideos(inputPaths, outputPath, {
        maxSizeMb: effectiveMaxSizeMb,
        durationSeconds: outputSeconds,
        resolution: effectiveMaxSizeMb ? '720p' : undefined,
        aspect: resolveAspect(aspect),
        normalizeAudio: resolveBool(normalizeAudio),
        fastMode: resolveFastMode(fastMode),
      });

      if (!result.success) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_merge', error: result.error }); } catch {}
        }
        return res.status(500).json({ error: result.error });
      }

      // Add merged file to session
      const sessionFile = addFileToSession(
        sessionId,
        result.outputPath!,
        outputFileName,
        'video/mp4'
      );

      if (!sessionFile) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_merge', error: 'save_failed' }); } catch {}
        }
        return res.status(500).json({ error: 'Failed to save merged file' });
      }

      res.json({
        success: true,
        file: {
          id: sessionFile.id,
          name: sessionFile.originalName,
          mimeType: sessionFile.mimeType,
          size: sessionFile.size,
          createdAt: sessionFile.createdAt
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (billing?.credits) {
        try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_merge', error: message }); } catch {}
      }
      return res.status(500).json({ error: message || 'Failed to merge videos' });
    }
  });

  /**
   * Trim video (cut start/end)
   */
  app.post('/api/video/trim', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileId, start, end, maxSizeMb, aspect, normalizeAudio, fastMode } = req.body as {
      fileId: string;
      start: number;
      end: number;
      maxSizeMb?: number;
      aspect?: VideoAspect;
      normalizeAudio?: boolean;
      fastMode?: VideoFastMode;
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!fileId || start === undefined || end === undefined) {
      return res.status(400).json({ error: 'fileId, start, and end required' });
    }

    const file = getSessionFile(sessionId, fileId, req.user!.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    const outputFileName = `${baseName}_trimmed.mp4`;
    const outputPath = path.join(path.dirname(file.path), `${uuidv4()}.mp4`);

    console.log(`[Session] Trimming video ${file.originalName}: ${start}s - ${end}s`);

    let billing: { workspaceId: string; credits: number } | null = null;
    try {
      const outputSeconds = Math.max(0, Number(end) - Number(start));
      billing = spendVideoEditCreditsOrThrow(req, outputSeconds, { action: 'video_trim' });

      const effectiveMaxSizeMb = Number.isFinite(Number(maxSizeMb)) ? Number(maxSizeMb) : undefined;
      const result = await cutVideo(file.path, outputPath, start, end, {
        maxSizeMb: effectiveMaxSizeMb,
        durationSeconds: outputSeconds,
        resolution: effectiveMaxSizeMb ? '720p' : undefined,
        aspect: resolveAspect(aspect),
        normalizeAudio: resolveBool(normalizeAudio),
        fastMode: resolveFastMode(fastMode),
      });

      if (!result.success) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_trim', error: result.error }); } catch {}
        }
        return res.status(500).json({ error: result.error });
      }

      // Add trimmed file to session
      const sessionFile = addFileToSession(
        sessionId,
        result.outputPath!,
        outputFileName,
        'video/mp4'
      );

      if (!sessionFile) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_trim', error: 'save_failed' }); } catch {}
        }
        return res.status(500).json({ error: 'Failed to save trimmed file' });
      }

      res.json({
        success: true,
        file: {
          id: sessionFile.id,
          name: sessionFile.originalName,
          mimeType: sessionFile.mimeType,
          size: sessionFile.size,
          createdAt: sessionFile.createdAt
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (billing?.credits) {
        try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_trim', error: message }); } catch {}
      }
      return res.status(500).json({ error: message || 'Failed to trim video' });
    }
  });

  /**
   * Combine video and audio tracks
   * Creates a new video with the audio track replaced/added
   */
  app.post('/api/video/combine-tracks', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const {
      videoFileId,
      audioFileId,
      videoTrimStart,
      videoTrimEnd,
      audioTrimStart,
      audioTrimEnd,
      audioVolume,
      maxSizeMb,
      aspect,
      normalizeAudio
    } = req.body as {
      videoFileId: string;
      audioFileId: string;
      videoTrimStart?: number;
      videoTrimEnd?: number;
      audioTrimStart?: number;
      audioTrimEnd?: number;
      audioVolume?: number;
      maxSizeMb?: number;
      aspect?: VideoAspect;
      normalizeAudio?: boolean;
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!videoFileId || !audioFileId) {
      return res.status(400).json({ error: 'videoFileId and audioFileId required' });
    }

    const videoFile = getSessionFile(sessionId, videoFileId, req.user!.id);
    const audioFile = getSessionFile(sessionId, audioFileId, req.user!.id);

    if (!videoFile) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    if (!audioFile) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const baseName = path.basename(videoFile.originalName, path.extname(videoFile.originalName));
    const outputFileName = `${baseName}_with_voiceover.mp4`;
    const outputPath = path.join(path.dirname(videoFile.path), `${uuidv4()}.mp4`);

    console.log(`[Session] Combining video ${videoFile.originalName} with audio ${audioFile.originalName}`);

    let billing: { workspaceId: string; credits: number } | null = null;
    try {
      const duration = await getVideoDuration(videoFile.path);
      const start = Number.isFinite(videoTrimStart as any) ? Number(videoTrimStart) : 0;
      const end = Number.isFinite(videoTrimEnd as any) ? Number(videoTrimEnd) : duration;
      const outputSeconds = Math.max(0, end - start) || Math.max(0, duration);
      billing = spendVideoEditCreditsOrThrow(req, outputSeconds, { action: 'video_combine_tracks' });

      const result = await combineVideoAudio(
        videoFile.path,
        audioFile.path,
        outputPath,
        {
          videoTrimStart,
          videoTrimEnd,
          audioTrimStart,
          audioTrimEnd,
          audioVolume,
          maxSizeMb: Number.isFinite(Number(maxSizeMb)) ? Number(maxSizeMb) : undefined,
          durationSeconds: outputSeconds,
          resolution: Number.isFinite(Number(maxSizeMb)) ? '720p' : undefined,
          aspect: resolveAspect(aspect),
          normalizeAudio: resolveBool(normalizeAudio),
        }
      );

      if (!result.success) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_combine_tracks', error: result.error }); } catch {}
        }
        return res.status(500).json({ error: result.error });
      }

      // Add combined file to session
      const sessionFile = addFileToSession(
        sessionId,
        result.outputPath!,
        outputFileName,
        'video/mp4'
      );

      if (!sessionFile) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_combine_tracks', error: 'save_failed' }); } catch {}
        }
        return res.status(500).json({ error: 'Failed to save combined file' });
      }

      // Get metadata for the new file
      const metadata = await getVideoMetadata(sessionFile.path);

      res.json({
        success: true,
        file: {
          id: sessionFile.id,
          name: sessionFile.originalName,
          mimeType: sessionFile.mimeType,
          size: sessionFile.size,
          createdAt: sessionFile.createdAt,
          metadata
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (billing?.credits) {
        try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_combine_tracks', error: message }); } catch {}
      }
      return res.status(500).json({ error: message || 'Failed to combine video and audio' });
    }
  });

  /**
   * Extract freeze frame (Standbild) from video
   * Creates a still image at the specified timestamp
   */
  app.post('/api/video/freeze-frame', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const { fileId, time, format } = req.body as {
      fileId: string;
      time: number;
      format?: 'jpg' | 'png';
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!fileId || time === undefined || time < 0) {
      return res.status(400).json({ error: 'fileId and valid time required' });
    }

    const imageFormat = format === 'png' ? 'png' : 'jpg';

    const file = getSessionFile(sessionId, fileId, req.user!.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify it's a video file
    if (!ALLOWED_VIDEO_TYPES.has(file.mimeType)) {
      return res.status(400).json({ error: 'File must be a video' });
    }

    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    const timestamp = time.toFixed(2).replace('.', '_');
    const outputFileName = `${baseName}_frame_${timestamp}.${imageFormat}`;
    const outputPath = path.join(path.dirname(file.path), `${uuidv4()}.${imageFormat}`);

    console.log(`[Session] Extracting freeze frame from ${file.originalName} at ${time}s`);

    const result = await extractFreezeFrame(file.path, outputPath, time, imageFormat);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Add image file to session
    const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg';
    const sessionFile = addFileToSession(
      sessionId,
      result.outputPath!,
      outputFileName,
      mimeType
    );

    if (!sessionFile) {
      return res.status(500).json({ error: 'Failed to save freeze frame' });
    }

    res.json({
      success: true,
      file: {
        id: sessionFile.id,
        name: sessionFile.originalName,
        mimeType: sessionFile.mimeType,
        size: sessionFile.size,
        createdAt: sessionFile.createdAt
      }
    });
  });

  /**
   * Render timeline into a single video
   * Takes a timeline definition with tracks and clips, renders to output video
   */
  app.post('/api/video/render-timeline', requireAuth, requireMinPlan('pro'), gpuRateLimit('video_edit', VIDEO_EDIT_RATE_LIMITS), async (req: Request, res: Response) => {
    const sessionId = req.headers['x-session-id'] as string;
    const {
      tracks,
      outputFormat,
      resolution,
      outputName,
      maxSizeMb,
      aspect,
      normalizeAudio,
      cleanAudio,
      transition,
    } = req.body as {
      tracks: Array<{
        type: 'video' | 'audio';
        clips: Array<{
          fileId: string;
          sourceStart: number;
          sourceEnd: number;
          timelineStart: number;
          type: 'video' | 'audio' | 'image';
          volume?: number;
          fadeInSeconds?: number;
          fadeOutSeconds?: number;
        }>;
        muted?: boolean;
        volume?: number;
        layout?: {
          preset?: 'full' | 'pip_tr' | 'pip_tl' | 'pip_br' | 'pip_bl' | 'lower_third' | 'center';
          x?: number;
          y?: number;
          w?: number;
          h?: number;
          opacity?: number;
        };
        role?: 'voice' | 'music' | 'sfx';
      }>;
      outputFormat?: 'mp4' | 'webm';
      resolution?: '720p' | '1080p' | 'original';
      outputName?: string;
      maxSizeMb?: number;
      aspect?: VideoAspect;
      normalizeAudio?: boolean;
      cleanAudio?: boolean;
      transition?: { type: 'none' | 'fade' | 'crossfade'; durationSeconds?: number };
    };

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({ error: 'tracks array required' });
    }

    const session = getSession(sessionId, req.user!.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Resolve file IDs to file paths and build timeline tracks
    const resolvedTracks: TimelineTrack[] = [];

    for (const track of tracks) {
      const resolvedClips: TimelineClip[] = [];

      for (const clip of track.clips) {
        const file = getSessionFile(sessionId, clip.fileId, req.user!.id);
        if (!file) {
          return res.status(404).json({ error: `File not found: ${clip.fileId}` });
        }

        resolvedClips.push({
          sourceFilePath: file.path,
          sourceStart: clip.sourceStart,
          sourceEnd: clip.sourceEnd,
          timelineStart: clip.timelineStart,
          type: clip.type,
          volume: clip.volume,
          fadeInSeconds: clip.fadeInSeconds,
          fadeOutSeconds: clip.fadeOutSeconds,
        });
      }

      resolvedTracks.push({
        type: track.type,
        clips: resolvedClips,
        muted: track.muted,
        volume: track.volume,
        layout: track.layout,
        role: track.role,
      });
    }

    // Create output path
    const format = outputFormat === 'webm' ? 'webm' : 'mp4';
    const outputFileName = outputName || `timeline_export_${uuidv4().slice(0, 8)}.${format}`;
    const outputPath = path.join(
      path.dirname(session.files[0]?.path || getTmpDir()),
      `${uuidv4()}.${format}`
    );

    console.log(`[Session] Rendering timeline with ${tracks.length} tracks`);

    let billing: { workspaceId: string; credits: number } | null = null;
    try {
      const outputSeconds = tracks.reduce((max, track) => {
        const clips = Array.isArray(track?.clips) ? track.clips : [];
        return clips.reduce((innerMax: number, clip: any) => {
          const timelineStart = Number(clip?.timelineStart) || 0;
          const dur = Math.max(0, Number(clip?.sourceEnd) - Number(clip?.sourceStart));
          return Math.max(innerMax, timelineStart + (Number.isFinite(dur) ? dur : 0));
        }, max);
      }, 0);

      billing = spendVideoEditCreditsOrThrow(req, outputSeconds, { action: 'video_render_timeline', trackCount: tracks.length });

      const result = await renderTimeline({
        tracks: resolvedTracks,
        outputPath,
        resolution,
        format,
        maxSizeMb: Number.isFinite(Number(maxSizeMb)) ? Number(maxSizeMb) : undefined,
        durationSeconds: outputSeconds,
        aspect: resolveAspect(aspect),
        normalizeAudio: resolveBool(normalizeAudio),
        cleanAudio: resolveBool(cleanAudio),
        transition,
      });

      if (!result.success) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_render_timeline', error: result.error }); } catch {}
        }
        return res.status(500).json({ error: result.error });
      }

      // Add rendered file to session
      const mimeType = format === 'webm' ? 'video/webm' : 'video/mp4';
      const sessionFile = addFileToSession(
        sessionId,
        result.outputPath!,
        outputFileName,
        mimeType
      );

      if (!sessionFile) {
        if (billing?.credits) {
          try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_render_timeline', error: 'save_failed' }); } catch {}
        }
        return res.status(500).json({ error: 'Failed to save rendered video' });
      }

      // Get metadata for the new file
      const metadata = await getVideoMetadata(sessionFile.path);

      res.json({
        success: true,
        file: {
          id: sessionFile.id,
          name: sessionFile.originalName,
          mimeType: sessionFile.mimeType,
          size: sessionFile.size,
          createdAt: sessionFile.createdAt,
          metadata
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (billing?.credits) {
        try { addCredits(billing.workspaceId, billing.credits, 'ADJUST', { refundFor: 'video_render_timeline', error: message }); } catch {}
      }
      return res.status(500).json({ error: message || 'Failed to render timeline' });
    }
  });

  /**
   * Get session statistics (admin endpoint)
   */
  app.get('/api/session/stats', requireAuth, requireAdmin, (_req: Request, res: Response) => {
    res.json(getSessionStats());
  });
}
