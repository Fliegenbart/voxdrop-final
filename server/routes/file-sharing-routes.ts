/**
 * File Sharing Routes
 *
 * API endpoints for accessible file sharing.
 * Supports anonymous uploads (50MB) and authenticated uploads (250MB).
 */

import { Express, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { detectFileType } from '../utils/file-type';
import { getTmpDir } from '../utils/tmp';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';
import { getPublicBaseUrl } from '../utils/public-url';

import { requireAuth } from '../auth/middleware';
import { hashIP, getOrCreateDefaultWorkspaceForUser, getWorkspaceById, getWorkspaceMember } from '../db/queries';
import { resolveStorageTarget } from '../utils/storage-target';
import { PLAN_CONFIG, SUBSCRIPTION_PLAN_MAP, type PlanId } from '../billing/config';

import {
  createSharedFile,
  getFileByToken,
  getFileInfo,
  getUserFiles,
  getWorkspaceFiles,
  deleteFile,
  deleteWorkspaceFile,
  verifyFilePassword,
  isFileAccessible,
  incrementDownloads,
  isImageFile,
  updateAltText,
  formatFileSize,
  getStorageStats,
  getUserActiveStorageBytes,
  getWorkspaceActiveStorageBytes,
  SharedFile,
} from '../services/file-sharing';

// File size limits
const ANONYMOUS_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const resolvePlanId = (subscription: string | undefined): PlanId => {
  const raw = subscription || 'free';
  return SUBSCRIPTION_PLAN_MAP[raw] || 'free';
};

const maxUploadBytesForPlan = (planId: PlanId): number => {
  const maxMb = PLAN_CONFIG[planId]?.rateLimits.maxJobSizeMb ?? PLAN_CONFIG.free.rateLimits.maxJobSizeMb;
  return Math.max(1, Math.floor(maxMb)) * 1024 * 1024;
};

const AUTHENTICATED_MAX_SIZE = maxUploadBytesForPlan('premium');

const FILESHARING_QUOTA_BYTES: Record<PlanId, number> = {
  free: 100 * 1024 * 1024, // 100MB
  pro: 5 * 1024 * 1024 * 1024, // 5GB
  premium: 50 * 1024 * 1024 * 1024, // 50GB
};

const ALLOWED_SHARED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/zip',
  'text/plain',
  'text/csv',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'video/mp4',
  'video/webm',
  'video/mpeg',
  'video/quicktime'
]);

const ALLOWED_SHARED_DECLARED_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/json',
  'image/svg+xml'
]);

const ALLOWED_ZIP_EXTENSIONS = new Set(['.zip', '.pptx', '.docx', '.xlsx']);

// Multer configuration with dynamic limits
const storage = multer.diskStorage({
  destination: getTmpDir(),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = safeExtensionFromOriginalName(file.originalname) || '';
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: AUTHENTICATED_MAX_SIZE } // Will be checked manually for anonymous
});

// Helper: Check file size based on auth status
function checkFileSize(req: Request, file: Express.Multer.File): { valid: boolean; error?: string } {
  const maxSize = req.user ? maxUploadBytesForPlan(resolvePlanId((req.user as any).subscription)) : ANONYMOUS_MAX_SIZE;

  if (file.size > maxSize) {
    return {
      valid: false,
      error: req.user
        ? `Datei zu groß. Maximum: ${formatFileSize(maxSize)}`
        : `Datei zu groß. Maximum für anonyme Uploads: ${formatFileSize(ANONYMOUS_MAX_SIZE)}. Mit Login: ${formatFileSize(AUTHENTICATED_MAX_SIZE)}`
    };
  }

  return { valid: true };
}

async function validateSharedFileType(file: Express.Multer.File): Promise<{ valid: boolean; error?: string }> {
  const detected = await detectFileType(file.path);
  const detectedMime = detected?.mime;
  const declaredMime = file.mimetype;
  const ext = safeExtensionFromOriginalName(file.originalname) || '';

  if (detectedMime) {
    if (!ALLOWED_SHARED_MIME_TYPES.has(detectedMime)) {
      return { valid: false, error: `Dateityp ${detectedMime} ist nicht erlaubt` };
    }
    if (detectedMime === 'application/zip' && !ALLOWED_ZIP_EXTENSIONS.has(ext)) {
      return { valid: false, error: 'ZIP-Dateien sind nur für .zip/.pptx/.docx/.xlsx erlaubt' };
    }
    if (declaredMime && declaredMime !== detectedMime) {
      console.warn(`[FileSharing] MIME mismatch: declared=${declaredMime}, detected=${detectedMime}`);
    }
    return { valid: true };
  }

  // Fallback for text-based formats without magic bytes
  if (declaredMime && ALLOWED_SHARED_DECLARED_TYPES.has(declaredMime)) {
    return { valid: true };
  }

  return { valid: false, error: 'Dateityp konnte nicht bestimmt werden' };
}

// Helper: Generate alt text for images using Ollama
async function generateAltTextForImage(filePath: string): Promise<string | null> {
  try {
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';

    // Read image as base64
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');

    // Call Ollama with vision model
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llava',
        prompt: 'Beschreibe dieses Bild kurz und präzise auf Deutsch für blinde Nutzer. Maximal 2 Sätze.',
        images: [base64Image],
        stream: false
      })
    });

    if (!response.ok) {
      console.log('[FileSharing] Ollama not available for alt-text generation');
      return null;
    }

    const result = await response.json();
    return result.response?.trim() || null;
  } catch (error) {
    console.error('[FileSharing] Alt-text generation failed:', error);
    return null;
  }
}

export function registerFileSharingRoutes(app: Express) {
  const publicFileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen, bitte später erneut versuchen.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => hashIP(req.ip || 'unknown')
  });

  /**
   * Upload a file (anonymous or authenticated)
   * POST /api/files/upload
   */
  app.post('/api/files/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Keine Datei ausgewählt' });
    }

    // Check file size
    const sizeCheck = checkFileSize(req, file);
    if (!sizeCheck.valid) {
      // Cleanup temp file
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(413).json({ error: sizeCheck.error });
    }

    // Validate file type (magic bytes + declared MIME)
    const typeCheck = await validateSharedFileType(file);
    if (!typeCheck.valid) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(400).json({ error: typeCheck.error || 'Ungültiger Dateityp' });
    }

    // Parse options
    const expiresInHours = parseInt(req.body.expiresIn) || 24;
    const validExpiry = [24, 48, 72].includes(expiresInHours) ? expiresInHours as 24 | 48 | 72 : 24;
    const password = req.body.password?.trim() || undefined;
    const maxDownloads = req.body.maxDownloads ? parseInt(req.body.maxDownloads) : undefined;

    try {
      const storageTarget = resolveStorageTarget(req.user!, {
        scope: req.body.storageScope,
        workspaceId: req.body.workspaceId,
        projectId: req.body.projectId,
      });

      const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(req.user!)
        : getOrCreateDefaultWorkspaceForUser(req.user!);
      const planId = workspace.plan_id as PlanId;

      // Enforce per-plan filesharing storage quota (active files only).
      const limitBytes = FILESHARING_QUOTA_BYTES[planId] ?? FILESHARING_QUOTA_BYTES.free;
      const usedBytes = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? getWorkspaceActiveStorageBytes(workspace.id)
        : getUserActiveStorageBytes(req.user!.id);
      if (usedBytes + file.size > limitBytes) {
        try { fs.unlinkSync(file.path); } catch {}
        return res.status(413).json({
          error: 'Speicher-Limit erreicht',
          message: `Filesharing-Limit erreicht (${formatFileSize(limitBytes)}).`,
          usedBytes,
          limitBytes,
          requiresUpgrade: planId !== 'premium',
        });
      }

      // Create shared file
      const sharedFile = await createSharedFile(
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
        {
          userId: req.user?.id,
          expiresInHours: validExpiry,
          password,
          maxDownloads,
          ipHash: hashIP(req.ip || ''),
          storageScope: storageTarget.scope,
          workspaceId: storageTarget.workspaceId || undefined,
          projectId: storageTarget.projectId || undefined,
        }
      );

      // Generate alt-text for images (async, don't wait)
      if (isImageFile(file.mimetype)) {
        generateAltTextForImage(sharedFile.file_path).then(altText => {
          if (altText) {
            updateAltText(sharedFile.id, altText);
            console.log(`[FileSharing] Generated alt-text for ${sharedFile.id}`);
          }
        });
      }

      const baseUrl = getPublicBaseUrl(req);

      res.json({
        success: true,
        file: {
          id: sharedFile.id,
          token: sharedFile.token,
          originalName: sharedFile.original_name,
          fileSize: sharedFile.file_size,
          fileSizeFormatted: formatFileSize(sharedFile.file_size),
          mimeType: sharedFile.mime_type,
          hasPassword: !!password,
          downloads: 0,
          maxDownloads: maxDownloads || null,
          createdAt: sharedFile.created_at,
          expiresAt: sharedFile.expires_at,
          downloadUrl: `${baseUrl}/f/${sharedFile.token}`,
          directDownloadUrl: `${baseUrl}/f/${sharedFile.token}/download`
        }
      });
    } catch (error) {
      console.error('[FileSharing] Upload failed:', error);
      // Cleanup temp file
      try { fs.unlinkSync(file.path); } catch {}
      const message = (error as Error).message;
      if (message === 'workspace_forbidden' || message === 'project_forbidden') {
        return res.status(403).json({ error: 'Kein Zugriff auf den Workspace/Ordner' });
      }
      res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }
  });

  /**
   * List user's files (authenticated only)
   * GET /api/files
   */
  app.get('/api/files', requireAuth, (req: Request, res: Response) => {
    const scope = req.query.scope === 'workspace' ? 'workspace' : 'user';
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;

    let files: SharedFile[] = [];
    if (scope === 'workspace') {
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId fehlt' });
      }
      const membership = getWorkspaceMember(workspaceId, req.user!.id);
      if (!membership) {
        return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
      }
      files = getWorkspaceFiles(workspaceId, projectId);
    } else {
      files = getUserFiles(req.user!.id);
    }

    res.json({
      files: files.map(f => ({
        id: f.id,
        token: f.token,
        originalName: f.original_name,
        fileSize: f.file_size,
        fileSizeFormatted: formatFileSize(f.file_size),
        mimeType: f.mime_type,
        altText: f.alt_text,
        hasPassword: !!f.password_hash,
        downloads: f.downloads,
        maxDownloads: f.max_downloads,
        createdAt: f.created_at,
        expiresAt: f.expires_at,
        downloadUrl: `/f/${f.token}`
      }))
    });
  });

  /**
   * Delete a file (authenticated, owner only)
   * DELETE /api/files/:id
   */
  app.delete('/api/files/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const scope = req.query.scope === 'workspace' ? 'workspace' : 'user';
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;

    let success = false;
    if (scope === 'workspace') {
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId fehlt' });
      }
      const membership = getWorkspaceMember(workspaceId, req.user!.id);
      if (!membership) {
        return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
      }
      success = deleteWorkspaceFile(id, workspaceId);
    } else {
      success = deleteFile(id, req.user!.id);
    }

    if (!success) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    res.json({ success: true });
  });

  /**
   * Get file info (public)
   * GET /f/:token/info
   */
  app.get('/f/:token/info', publicFileLimiter, (req: Request, res: Response) => {
    const { token } = req.params;

    const info = getFileInfo(token);

    if (!info) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    if (info.isExpired) {
      return res.status(410).json({ error: 'Datei abgelaufen' });
    }

    res.json({
      originalName: info.originalName,
      fileSize: info.fileSize,
      fileSizeFormatted: formatFileSize(info.fileSize),
      mimeType: info.mimeType,
      altText: info.altText,
      hasPassword: info.hasPassword,
      downloads: info.downloads,
      maxDownloads: info.maxDownloads,
      expiresAt: info.expiresAt
    });
  });

  /**
   * Verify password for protected file
   * POST /f/:token/verify
   */
  app.post('/f/:token/verify', publicFileLimiter, async (req: Request, res: Response) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Passwort erforderlich' });
    }

    const valid = await verifyFilePassword(token, password);

    res.json({ valid });
  });

  /**
   * Download file
   * GET /f/:token/download
   */
  app.get('/f/:token/download', publicFileLimiter, async (req: Request, res: Response) => {
    const { token } = req.params;

    const file = getFileByToken(token);

    if (!file) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    // Check accessibility
    const accessibility = isFileAccessible(file);
    if (!accessibility.accessible) {
      if (accessibility.reason === 'expired') {
        return res.status(410).json({ error: 'Diese Datei ist abgelaufen und nicht mehr verfügbar.' });
      }
      if (accessibility.reason === 'download_limit_reached') {
        return res.status(403).json({ error: 'Das Download-Limit für diese Datei wurde erreicht.' });
      }
      return res.status(404).json({ error: 'Datei nicht verfügbar' });
    }

    // Check password
    if (file.password_hash) {
      return res.status(401).json({
        error: 'Diese Datei ist passwortgeschuetzt.',
        requiresPassword: true
      });
    }

    // Increment download counter
    incrementDownloads(token);

    // Send file
    res.download(file.file_path, file.original_name, (err) => {
      if (err && !res.headersSent) {
        console.error('[FileSharing] Download error:', err);
        res.status(500).json({ error: 'Download fehlgeschlagen' });
      }
    });
  });

  /**
   * Download file with password in body
   * POST /f/:token/download
   */
  app.post('/f/:token/download', publicFileLimiter, async (req: Request, res: Response) => {
    const { token } = req.params;
    const { password } = req.body as { password?: string };

    const file = getFileByToken(token);

    if (!file) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    // Check accessibility
    const accessibility = isFileAccessible(file);
    if (!accessibility.accessible) {
      if (accessibility.reason === 'expired') {
        return res.status(410).json({ error: 'Diese Datei ist abgelaufen und nicht mehr verfügbar.' });
      }
      if (accessibility.reason === 'download_limit_reached') {
        return res.status(403).json({ error: 'Das Download-Limit für diese Datei wurde erreicht.' });
      }
      return res.status(404).json({ error: 'Datei nicht verfügbar' });
    }

    // Check password
    if (file.password_hash) {
      if (!password) {
        return res.status(401).json({
          error: 'Diese Datei ist passwortgeschuetzt.',
          requiresPassword: true
        });
      }

      const valid = await verifyFilePassword(token, password);
      if (!valid) {
        return res.status(401).json({ error: 'Falsches Passwort' });
      }
    }

    // Increment download counter
    incrementDownloads(token);

    // Send file
    res.download(file.file_path, file.original_name, (err) => {
      if (err && !res.headersSent) {
        console.error('[FileSharing] Download error:', err);
        res.status(500).json({ error: 'Download fehlgeschlagen' });
      }
    });
  });

  /**
   * File download page (renders info, handled by frontend)
   * GET /f/:token
   */
  app.get('/f/:token', publicFileLimiter, (req: Request, _res: Response, next) => {
    const { token } = req.params;

    // Check if file exists
    const file = getFileByToken(token);

    if (!file) {
      // Let frontend handle 404
      return next();
    }

    // Let frontend render the download page
    next();
  });

  /**
   * Storage statistics (admin)
   * GET /api/files/stats
   */
  app.get('/api/files/stats', requireAuth, (req: Request, res: Response) => {
    // Only admins can see stats
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Nicht berechtigt' });
    }

    const stats = getStorageStats();

    res.json({
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      totalSizeFormatted: formatFileSize(stats.totalSize),
      byUser: stats.byUser,
      anonymous: stats.anonymous
    });
  });
}
