/**
 * Session Storage Service
 *
 * Manages temporary file storage for user sessions.
 * Files are stored per session and auto-deleted after 24 hours.
 * DSGVO-compliant: All data stored on German Hetzner server.
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { safeStoredExtension } from '../utils/safe-filename';

// Session storage configuration
const SESSION_DIR = process.env.SESSION_STORAGE_DIR || '/tmp/voxdrop-sessions';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

export interface SessionFile {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  path: string;
}

export interface Session {
  id: string;
  ownerId?: number;
  createdAt: Date;
  lastAccessedAt: Date;
  files: SessionFile[];
}

export interface RecentSessionSummary {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  files: SessionFile[];
}

// In-memory session index (persisted to disk on changes)
const sessions = new Map<string, Session>();
const INDEX_FILE = path.join(SESSION_DIR, 'sessions.json');

// Load sessions from disk on startup
function loadSessions() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
      for (const [id, session] of Object.entries(data)) {
        const s = session as Session;
        s.createdAt = new Date(s.createdAt);
        s.lastAccessedAt = new Date(s.lastAccessedAt);
        s.files = s.files.map(f => ({
          ...f,
          createdAt: new Date(f.createdAt)
        }));
        sessions.set(id, s);
      }
      console.log(`[Session] Loaded ${sessions.size} sessions from disk`);
    }
  } catch (err) {
    console.error('[Session] Error loading sessions:', err);
  }
}

// Save sessions to disk
function saveSessions() {
  try {
    const data: Record<string, Session> = {};
    sessions.forEach((session, id) => {
      data[id] = session;
    });
    fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Session] Error saving sessions:', err);
  }
}

// Initialize
loadSessions();

/**
 * Create a new session or get existing one
 */
export function getOrCreateSession(sessionId?: string, ownerId?: number): Session {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    if (ownerId !== undefined) {
      if (session.ownerId === undefined) {
        session.ownerId = ownerId;
      }
      if (session.ownerId === ownerId) {
        session.lastAccessedAt = new Date();
        saveSessions();
        return session;
      }
    } else {
      session.lastAccessedAt = new Date();
      saveSessions();
      return session;
    }
  }

  // Create new session
  const newSession: Session = {
    id: uuidv4(),
    ownerId,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    files: []
  };

  // Create session directory
  const sessionDir = path.join(SESSION_DIR, newSession.id);
  fs.mkdirSync(sessionDir, { recursive: true });

  sessions.set(newSession.id, newSession);
  saveSessions();

  console.log(`[Session] Created new session: ${newSession.id}`);
  return newSession;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string, ownerId?: number): Session | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (ownerId !== undefined) {
    if (session.ownerId === undefined) {
      session.ownerId = ownerId;
    }
    if (session.ownerId !== ownerId) {
      return undefined;
    }
  }
  session.lastAccessedAt = new Date();
  saveSessions();
  return session;
}

/**
 * Add a file to session
 */
export function addFileToSession(
  sessionId: string,
  tempFilePath: string,
  originalName: string,
  mimeType: string
): SessionFile | null {
  const session = sessions.get(sessionId);
  if (!session) {
    console.error(`[Session] Session not found: ${sessionId}`);
    return null;
  }

  const fileId = uuidv4();
  const ext = safeStoredExtension({ mimeType, originalName, fallback: '.mp4' });
  const fileName = `${fileId}${ext}`;
  const sessionDir = path.join(SESSION_DIR, sessionId);
  const filePath = path.join(sessionDir, fileName);

  // Move file into the session directory.
  // Prefer rename (fast, no copy). Fall back to copy+unlink across filesystems.
  try {
    if (tempFilePath !== filePath) {
      try {
        fs.renameSync(tempFilePath, filePath);
      } catch (err: any) {
        if (err?.code === 'EXDEV') {
          fs.copyFileSync(tempFilePath, filePath);
          fs.unlinkSync(tempFilePath);
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    console.error('[Session] Error moving file:', err);
    return null;
  }

  const stats = fs.statSync(filePath);
  const sessionFile: SessionFile = {
    id: fileId,
    name: fileName,
    originalName,
    mimeType,
    size: stats.size,
    createdAt: new Date(),
    path: filePath
  };

  session.files.push(sessionFile);
  session.lastAccessedAt = new Date();
  saveSessions();

  console.log(`[Session] Added file ${originalName} to session ${sessionId}`);
  return sessionFile;
}

/**
 * Get file from session
 */
export function getSessionFile(sessionId: string, fileId: string, ownerId?: number): SessionFile | undefined {
  const session = getSession(sessionId, ownerId);
  if (!session) return undefined;

  return session.files.find(f => f.id === fileId);
}

/**
 * Get all files from session
 */
export function getSessionFiles(sessionId: string, ownerId?: number): SessionFile[] {
  const session = getSession(sessionId, ownerId);
  return session?.files || [];
}

/**
 * Delete file from session
 */
export function deleteSessionFile(sessionId: string, fileId: string, ownerId?: number): boolean {
  const session = getSession(sessionId, ownerId);
  if (!session) return false;

  const fileIndex = session.files.findIndex(f => f.id === fileId);
  if (fileIndex === -1) return false;

  const file = session.files[fileIndex];

  // Delete file from disk
  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    const proxyPath = path.join(
      path.dirname(file.path),
      `${path.basename(file.path, path.extname(file.path))}.proxy.mp4`
    );
    if (fs.existsSync(proxyPath)) {
      fs.unlinkSync(proxyPath);
    }
  } catch (err) {
    console.error('[Session] Error deleting file:', err);
  }

  // Remove from session
  session.files.splice(fileIndex, 1);
  saveSessions();

  console.log(`[Session] Deleted file ${fileId} from session ${sessionId}`);
  return true;
}

/**
 * Delete entire session
 */
export function deleteSession(sessionId: string, ownerId?: number): boolean {
  const session = getSession(sessionId, ownerId);
  if (!session) return false;

  const sessionDir = path.join(SESSION_DIR, sessionId);

  // Delete all files
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('[Session] Error deleting session directory:', err);
  }

  sessions.delete(sessionId);
  saveSessions();

  console.log(`[Session] Deleted session: ${sessionId}`);
  return true;
}

function getSessionExpiry(session: Session): Date {
  return new Date(session.lastAccessedAt.getTime() + SESSION_MAX_AGE_MS);
}

export function getRecentSessionsForOwner(ownerId: number, limit = 12): RecentSessionSummary[] {
  cleanupExpiredSessions();

  const now = Date.now();

  return Array.from(sessions.values())
    .filter((session) => {
      if (session.ownerId !== ownerId) return false;
      if (session.files.length === 0) return false;
      return getSessionExpiry(session).getTime() > now;
    })
    .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime())
    .slice(0, Math.max(1, limit))
    .map((session) => ({
      id: session.id,
      createdAt: new Date(session.createdAt),
      lastAccessedAt: new Date(session.lastAccessedAt),
      expiresAt: getSessionExpiry(session),
      files: [...session.files].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }));
}

/**
 * Cleanup expired sessions (older than 24 hours)
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let deletedCount = 0;

  sessions.forEach((session, id) => {
    const age = now - session.lastAccessedAt.getTime();
    if (age > SESSION_MAX_AGE_MS) {
      deleteSession(id);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    console.log(`[Session] Cleaned up ${deletedCount} expired sessions`);
  }

  return deletedCount;
}

// Run cleanup every hour
setInterval(() => {
  cleanupExpiredSessions();
}, 60 * 60 * 1000);

// Run cleanup on startup
cleanupExpiredSessions();

/**
 * Get session statistics
 */
export function getSessionStats() {
  let totalFiles = 0;
  let totalSize = 0;

  sessions.forEach(session => {
    totalFiles += session.files.length;
    session.files.forEach(f => {
      totalSize += f.size;
    });
  });

  return {
    sessionCount: sessions.size,
    totalFiles,
    totalSizeBytes: totalSize,
    totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
  };
}
