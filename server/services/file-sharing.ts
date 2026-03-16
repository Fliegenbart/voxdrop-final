/**
 * File Sharing Service
 * Barrierefreies Filesharing mit sprechenden deutschen Token
 * DSGVO-konform mit automatischer Loeschung nach 24-72h
 */

import db from '../db/init';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { GERMAN_WORDS } from './german-words';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';

// Storage directory for shared files
const FILES_DIR = process.env.FILES_DIR || path.join(process.cwd(), 'uploads', 'files');

// Ensure directory exists
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

export interface SharedFile {
  id: string;
  user_id: number | null;
  storage_scope: 'user' | 'workspace' | null;
  workspace_id: string | null;
  project_id: string | null;
  token: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  alt_text: string | null;
  password_hash: string | null;
  downloads: number;
  max_downloads: number | null;
  created_at: string;
  expires_at: string;
  ip_hash: string | null;
}

export interface CreateFileOptions {
  userId?: number;
  expiresInHours: 24 | 48 | 72;
  password?: string;
  maxDownloads?: number;
  ipHash?: string;
  storageScope?: 'user' | 'workspace';
  workspaceId?: string | null;
  projectId?: string | null;
}

export interface FileInfo {
  id: string;
  token: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  altText: string | null;
  downloads: number;
  maxDownloads: number | null;
  hasPassword: boolean;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  downloadUrl: string;
}

/**
 * Generate a word-based file token
 * Format: "wort1-wort2-wort3" (e.g., "sonne-berg-wald")
 */
export function generateFileToken(): string {
  const bytes = crypto.randomBytes(8);
  const index1 = bytes.readUInt16BE(0) % GERMAN_WORDS.length;
  const index2 = bytes.readUInt16BE(2) % GERMAN_WORDS.length;
  const index3 = bytes.readUInt16BE(4) % GERMAN_WORDS.length;
  const index4 = bytes.readUInt16BE(6) % GERMAN_WORDS.length;

  // Ensure unique words
  let finalIndex2 = index2;
  let finalIndex3 = index3;

  if (index1 === index2) {
    finalIndex2 = (index2 + 1) % GERMAN_WORDS.length;
  }
  if (finalIndex2 === index3 || index1 === index3) {
    finalIndex3 = (index3 + 2) % GERMAN_WORDS.length;
  }

  const suffix = crypto.randomBytes(3).toString("hex");
  return `${GERMAN_WORDS[index1]}-${GERMAN_WORDS[finalIndex2]}-${GERMAN_WORDS[finalIndex3]}-${GERMAN_WORDS[index4]}-${suffix}`;
}

/**
 * Check if a token is available
 */
export function isTokenAvailable(token: string): boolean {
  const existing = db.prepare(
    'SELECT id FROM shared_files WHERE token = ?'
  ).get(token);
  return !existing;
}

/**
 * Get unique file token (regenerate if collision)
 */
function getUniqueToken(): string {
  let token = generateFileToken();
  let attempts = 0;

  while (!isTokenAvailable(token) && attempts < 10) {
    token = generateFileToken();
    attempts++;
  }

  // Fallback to UUID-based token if word-based fails
  if (!isTokenAvailable(token)) {
    token = crypto.randomUUID().slice(0, 12);
  }

  return token;
}

/**
 * Create a new shared file entry
 */
export async function createSharedFile(
  filePath: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  options: CreateFileOptions
): Promise<SharedFile> {
  const id = crypto.randomUUID();
  const token = getUniqueToken();

  // Calculate expiration
  const expiresAt = new Date(
    Date.now() + options.expiresInHours * 60 * 60 * 1000
  ).toISOString();

  // Hash password if provided
  let passwordHash: string | null = null;
  if (options.password) {
    passwordHash = await bcrypt.hash(options.password, 10);
  }

  // Move file to permanent storage
  const scope = options.storageScope === 'workspace' && options.workspaceId ? 'workspace' : 'user';
  const ownerDir = scope === 'workspace'
    ? `workspace-${options.workspaceId}`
    : (options.userId ? options.userId.toString() : 'anonymous');
  const projectDir = options.projectId ? options.projectId : 'root';
  const targetDir = path.join(FILES_DIR, scope, ownerDir, projectDir);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const ext = safeExtensionFromOriginalName(originalName) || '';
  const targetPath = path.join(targetDir, `${id}${ext}`);

  // Move from temp to permanent location
  // Use copyFile + unlink instead of rename to support cross-filesystem moves
  fs.copyFileSync(filePath, targetPath);
  fs.unlinkSync(filePath);

  // Insert into database
  db.prepare(`
    INSERT INTO shared_files (
      id, user_id, storage_scope, workspace_id, project_id,
      token, original_name, file_path, file_size,
      mime_type, password_hash, max_downloads, expires_at, ip_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    options.userId || null,
    scope,
    scope === 'workspace' ? options.workspaceId || null : null,
    scope === 'workspace' ? options.projectId || null : null,
    token,
    originalName,
    targetPath,
    fileSize,
    mimeType,
    passwordHash,
    options.maxDownloads || null,
    expiresAt,
    options.ipHash || null
  );

  return getFileById(id)!;
}

/**
 * Get file by ID
 */
export function getFileById(id: string): SharedFile | null {
  return db.prepare(
    'SELECT * FROM shared_files WHERE id = ?'
  ).get(id) as SharedFile | null;
}

/**
 * Get file by token
 */
export function getFileByToken(token: string): SharedFile | null {
  return db.prepare(
    'SELECT * FROM shared_files WHERE token = ?'
  ).get(token) as SharedFile | null;
}

/**
 * Get file info (public, no password hash)
 */
export function getFileInfo(token: string): FileInfo | null {
  const file = getFileByToken(token);
  if (!file) return null;

  const isExpired = new Date(file.expires_at) < new Date();

  return {
    id: file.id,
    token: file.token,
    originalName: file.original_name,
    fileSize: file.file_size,
    mimeType: file.mime_type,
    altText: file.alt_text,
    downloads: file.downloads,
    maxDownloads: file.max_downloads,
    hasPassword: !!file.password_hash,
    createdAt: file.created_at,
    expiresAt: file.expires_at,
    isExpired,
    downloadUrl: `/f/${file.token}/download`
  };
}

/**
 * Verify file password
 */
export async function verifyFilePassword(token: string, password: string): Promise<boolean> {
  const file = getFileByToken(token);
  if (!file || !file.password_hash) return false;

  return bcrypt.compare(password, file.password_hash);
}

/**
 * Check if file is accessible (not expired, not at download limit)
 */
export function isFileAccessible(file: SharedFile): { accessible: boolean; reason?: string } {
  // Check expiration
  if (new Date(file.expires_at) < new Date()) {
    return { accessible: false, reason: 'expired' };
  }

  // Check download limit
  if (file.max_downloads && file.downloads >= file.max_downloads) {
    return { accessible: false, reason: 'download_limit_reached' };
  }

  // Check if file exists on disk
  if (!fs.existsSync(file.file_path)) {
    return { accessible: false, reason: 'file_not_found' };
  }

  return { accessible: true };
}

/**
 * Increment download count
 */
export function incrementDownloads(token: string): void {
  db.prepare(
    'UPDATE shared_files SET downloads = downloads + 1 WHERE token = ?'
  ).run(token);
}

/**
 * Get all files for a user
 */
export function getUserFiles(userId: number): SharedFile[] {
  return db.prepare(`
    SELECT * FROM shared_files
    WHERE user_id = ? AND (storage_scope = 'user' OR storage_scope IS NULL)
    AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `).all(userId) as SharedFile[];
}

export function getWorkspaceFiles(workspaceId: string, projectId?: string | null): SharedFile[] {
  const stmt = db.prepare(`
    SELECT * FROM shared_files
    WHERE workspace_id = ? AND storage_scope = 'workspace'
    ${projectId ? 'AND project_id = ?' : ''}
    AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `);
  return projectId ? (stmt.all(workspaceId, projectId) as SharedFile[]) : (stmt.all(workspaceId) as SharedFile[]);
}

/**
 * Delete a file
 */
export function deleteFile(id: string, userId?: number): boolean {
  // Get file first
  let file: SharedFile | null;

  if (userId) {
    file = db.prepare(
      'SELECT * FROM shared_files WHERE id = ? AND user_id = ?'
    ).get(id, userId) as SharedFile | null;
  } else {
    file = getFileById(id);
  }

  if (!file) return false;

  // Delete from filesystem
  if (fs.existsSync(file.file_path)) {
    try {
      fs.unlinkSync(file.file_path);
    } catch (error) {
      console.error(`[FileSharing] Failed to delete file: ${file.file_path}`, error);
    }
  }

  // Delete from database
  const result = userId
    ? db.prepare('DELETE FROM shared_files WHERE id = ? AND user_id = ?').run(id, userId)
    : db.prepare('DELETE FROM shared_files WHERE id = ?').run(id);

  return result.changes > 0;
}

export function deleteWorkspaceFile(id: string, workspaceId: string): boolean {
  const file = db.prepare(
    'SELECT * FROM shared_files WHERE id = ? AND workspace_id = ? AND storage_scope = ?'
  ).get(id, workspaceId, 'workspace') as SharedFile | null;

  if (!file) return false;

  if (fs.existsSync(file.file_path)) {
    try {
      fs.unlinkSync(file.file_path);
    } catch (error) {
      console.error(`[FileSharing] Failed to delete file: ${file.file_path}`, error);
    }
  }

  const result = db.prepare('DELETE FROM shared_files WHERE id = ? AND workspace_id = ? AND storage_scope = ?')
    .run(id, workspaceId, 'workspace');
  return result.changes > 0;
}

/**
 * Update alt text for an image
 */
export function updateAltText(id: string, altText: string): void {
  db.prepare(
    'UPDATE shared_files SET alt_text = ? WHERE id = ?'
  ).run(altText, id);
}

/**
 * Check if file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get storage statistics
 */
export function getStorageStats(): { totalFiles: number; totalSize: number; byUser: number; anonymous: number } {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_files,
      COALESCE(SUM(file_size), 0) as total_size,
      COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as by_user,
      COUNT(CASE WHEN user_id IS NULL THEN 1 END) as anonymous
    FROM shared_files
    WHERE expires_at > datetime('now')
  `).get() as { total_files: number; total_size: number; by_user: number; anonymous: number };

  return {
    totalFiles: stats.total_files,
    totalSize: stats.total_size,
    byUser: stats.by_user,
    anonymous: stats.anonymous
  };
}

export function getUserActiveStorageBytes(userId: number): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(file_size), 0) as total
    FROM shared_files
    WHERE user_id = ?
      AND (storage_scope = 'user' OR storage_scope IS NULL)
      AND expires_at > datetime('now')
  `).get(userId) as { total: number } | undefined;
  return Number(row?.total || 0);
}

export function getWorkspaceActiveStorageBytes(workspaceId: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(file_size), 0) as total
    FROM shared_files
    WHERE workspace_id = ?
      AND storage_scope = 'workspace'
      AND expires_at > datetime('now')
  `).get(workspaceId) as { total: number } | undefined;
  return Number(row?.total || 0);
}

export { FILES_DIR };
