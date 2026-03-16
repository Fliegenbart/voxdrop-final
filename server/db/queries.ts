import db from './init';
import type { User, Session, AuditLog, Usage } from '../types/auth';
import type { PlanId } from '../billing/config';
import { PLAN_CONFIG, SUBSCRIPTION_PLAN_MAP, CREDIT_ROLLOVER_MAX_PERCENT } from '../billing/config';
import crypto from 'crypto';
import fs from 'fs';
import { IP_HASH_SALT, LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MINUTES, MAX_CONCURRENT_SESSIONS } from '../auth/config';

const safeUnlink = (filePath: string | null | undefined) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore file delete errors to avoid blocking account deletion
  }
};

const safeParseJson = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

// ===========================================
// USER QUERIES
// ===========================================

export const createUser = (email: string, passwordHash: string, organization?: string): User => {
  const bootstrapAdminsRaw = process.env.BOOTSTRAP_ADMIN_EMAILS || '';
  const bootstrapAdmins = bootstrapAdminsRaw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const role: 'user' | 'admin' = bootstrapAdmins.includes(email.trim().toLowerCase()) ? 'admin' : 'user';

  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, organization, role)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(email, passwordHash, organization || null, role);
  const user = getUserById(result.lastInsertRowid as number)!;
  getOrCreateDefaultWorkspaceForUser(user);
  return getUserById(user.id)!;
};

export const getUserById = (id: number): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as User | undefined;
};

export const getUserByEmail = (email: string): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email) as User | undefined;
};

export const updateUserMFA = (userId: number, totpSecret: string | null, mfaEnabled: boolean): void => {
  const stmt = db.prepare(`
    UPDATE users SET totp_secret = ?, mfa_enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(totpSecret, mfaEnabled ? 1 : 0, userId);
};

export const updateUserSubscription = (userId: number, subscription: string): void => {
  const stmt = db.prepare(`
    UPDATE users SET subscription = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(subscription, userId);
};

export const setUserRoleByEmail = (email: string, role: 'user' | 'admin'): void => {
  const stmt = db.prepare(`
    UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP
    WHERE email = ?
  `);
  stmt.run(role, email);
};

// ===========================================
// EMAIL VERIFICATION QUERIES
// ===========================================

export const setVerificationToken = (userId: number, token: string, expiresAt: Date): void => {
  const stmt = db.prepare(`
    UPDATE users SET
      verification_token = ?,
      verification_token_expires = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(token, expiresAt.toISOString(), userId);
};

export const getUserByVerificationToken = (token: string): User | undefined => {
  const stmt = db.prepare(`
    SELECT * FROM users
    WHERE verification_token = ?
    AND verification_token_expires > datetime('now')
  `);
  return stmt.get(token) as User | undefined;
};

export const verifyUserEmail = (userId: number): void => {
  const stmt = db.prepare(`
    UPDATE users SET
      email_verified = 1,
      verification_token = NULL,
      verification_token_expires = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(userId);
};

export const isEmailVerified = (userId: number): boolean => {
  const user = getUserById(userId);
  return user ? !!user.email_verified : false;
};

// ===========================================
// SESSION QUERIES
// ===========================================

export const createSession = (userId: number, token: string, expiresAt: Date, ipHash?: string, userAgent?: string): Session => {
  const stmt = db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at, ip_hash, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(userId, token, expiresAt.toISOString(), ipHash || null, userAgent || null);
  return getSessionById(result.lastInsertRowid as number)!;
};

export const getSessionById = (id: number): Session | undefined => {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as Session | undefined;
};

export const getSessionByToken = (token: string): Session | undefined => {
  const stmt = db.prepare(`
    SELECT * FROM sessions
    WHERE token = ? AND expires_at > datetime('now')
  `);
  return stmt.get(token) as Session | undefined;
};

export const deleteSession = (token: string): void => {
  const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
  stmt.run(token);
};

export const deleteUserSessions = (userId: number): void => {
  const stmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  stmt.run(userId);
};

// ===========================================
// AUDIT LOG QUERIES
// ===========================================

export const createAuditLog = (
  userId: number | null,
  action: string,
  status: 'success' | 'failure',
  resource?: string,
  details?: object | null,
  ipHash?: string,
  workspaceId?: string | null
): void => {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (user_id, action, resource, status, details, ip_hash, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    userId,
    action,
    resource || null,
    status,
    details ? JSON.stringify(details) : null,
    ipHash || null,
    workspaceId || null
  );
};

export const getAuditLogs = (
  limit: number = 100,
  offset: number = 0,
  userId?: number,
  action?: string,
  startDate?: Date,
  endDate?: Date
): AuditLog[] => {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate.toISOString());
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate.toISOString());
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  return stmt.all(...params) as AuditLog[];
};

export const getAuditLogCount = (userId?: number, action?: string): number => {
  let query = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }

  const stmt = db.prepare(query);
  const result = stmt.get(...params) as { count: number };
  return result.count;
};

export const getAuditLogCountBetween = (input: {
  userId?: number;
  action?: string;
  status?: 'success' | 'failure';
  startDate?: Date;
  endDate?: Date;
}): number => {
  let query = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (input.userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(input.userId);
  }

  if (input.action) {
    query += ' AND action = ?';
    params.push(input.action);
  }

  if (input.status) {
    query += ' AND status = ?';
    params.push(input.status);
  }

  if (input.startDate) {
    query += ' AND created_at >= ?';
    params.push(input.startDate.toISOString());
  }

  if (input.endDate) {
    query += ' AND created_at <= ?';
    params.push(input.endDate.toISOString());
  }

  const stmt = db.prepare(query);
  const result = stmt.get(...params) as { count: number };
  return result.count;
};

// ===========================================
// USAGE QUERIES
// ===========================================

export const getOrCreateUsage = (userId: number): Usage => {
  let usage = db.prepare('SELECT * FROM usage WHERE user_id = ?').get(userId) as Usage | undefined;

  if (!usage) {
    db.prepare('INSERT INTO usage (user_id) VALUES (?)').run(userId);
    usage = db.prepare('SELECT * FROM usage WHERE user_id = ?').get(userId) as Usage;
  }

  // Check if a month has passed since last reset
  if (usage.last_reset) {
    const lastReset = new Date(usage.last_reset);
    const now = new Date();

    // Reset if we're in a different month or year
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      db.prepare(`
        UPDATE usage SET
          transcriptions_count = 0,
          videos_count = 0,
          last_reset = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(userId);

      // Fetch updated usage
      usage = db.prepare('SELECT * FROM usage WHERE user_id = ?').get(userId) as Usage;
    }
  }

  return usage;
};

export const incrementUsage = (userId: number, type: 'transcriptions' | 'videos'): Usage => {
  const column = type === 'transcriptions' ? 'transcriptions_count' : 'videos_count';

  db.prepare(`
    UPDATE usage SET ${column} = ${column} + 1
    WHERE user_id = ?
  `).run(userId);

  return getOrCreateUsage(userId);
};

export const resetUsage = (userId: number): void => {
  db.prepare(`
    UPDATE usage SET transcriptions_count = 0, videos_count = 0, last_reset = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(userId);
};

// ===========================================
// ACCOUNT LOCKOUT FUNCTIONS
// ===========================================

export const isAccountLocked = (userId: number): boolean => {
  const user = getUserById(userId);
  if (!user || !user.locked_until) return false;

  const lockedUntil = new Date(user.locked_until);
  return lockedUntil > new Date();
};

export const recordFailedLogin = (userId: number): { locked: boolean; attemptsRemaining: number } => {
  const user = getUserById(userId);
  if (!user) return { locked: false, attemptsRemaining: LOCKOUT_THRESHOLD };

  const newAttempts = (user.failed_login_attempts || 0) + 1;

  if (newAttempts >= LOCKOUT_THRESHOLD) {
    // Lock the account
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    db.prepare(`
      UPDATE users SET
        failed_login_attempts = ?,
        locked_until = ?,
        last_failed_login = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newAttempts, lockUntil.toISOString(), userId);

    return { locked: true, attemptsRemaining: 0 };
  }

  db.prepare(`
    UPDATE users SET
      failed_login_attempts = ?,
      last_failed_login = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newAttempts, userId);

  return { locked: false, attemptsRemaining: LOCKOUT_THRESHOLD - newAttempts };
};

export const resetFailedLoginAttempts = (userId: number): void => {
  db.prepare(`
    UPDATE users SET
      failed_login_attempts = 0,
      locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
};

export const getLockoutInfo = (userId: number): { locked: boolean; lockedUntil: Date | null; attempts: number } => {
  const user = getUserById(userId);
  if (!user) return { locked: false, lockedUntil: null, attempts: 0 };

  const locked = isAccountLocked(userId);
  return {
    locked,
    lockedUntil: user.locked_until ? new Date(user.locked_until) : null,
    attempts: user.failed_login_attempts || 0
  };
};

// ===========================================
// SESSION MANAGEMENT (with limits)
// ===========================================

export const getActiveSessionCount = (userId: number): number => {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM sessions
    WHERE user_id = ? AND expires_at > datetime('now')
  `).get(userId) as { count: number };
  return result.count;
};

export const enforceSessionLimit = (userId: number): void => {
  const activeCount = getActiveSessionCount(userId);

  if (activeCount >= MAX_CONCURRENT_SESSIONS) {
    // Delete oldest sessions to make room
    db.prepare(`
      DELETE FROM sessions WHERE id IN (
        SELECT id FROM sessions
        WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).run(userId, activeCount - MAX_CONCURRENT_SESSIONS + 1);
  }
};

// ===========================================
// GDPR DATA EXPORT
// ===========================================

export const exportUserData = (userId: number): object => {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  const usage = getOrCreateUsage(userId);
  const sessions = db.prepare(`
    SELECT id, created_at, expires_at, user_agent
    FROM sessions WHERE user_id = ?
  `).all(userId);

  const auditLogs = db.prepare(`
    SELECT action, resource, status, details, created_at
    FROM audit_logs WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 1000
  `).all(userId) as Array<{ action: string; resource: string | null; status: string; details: string | null; created_at: string }>;

  const recordings = db.prepare(`
    SELECT original_name, file_size, mime_type, duration_seconds, created_at, expires_at
    FROM user_recordings
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  const sharedFiles = db.prepare(`
    SELECT token, original_name, file_size, mime_type, alt_text, downloads, max_downloads, created_at, expires_at, password_hash
    FROM shared_files
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Array<{ password_hash: string | null } & Record<string, unknown>>;

  const jobs = db.prepare(`
    SELECT id, queue, status, priority, input_data, result_data, progress_stage, progress_percent,
           error_message, attempts, created_at, started_at, completed_at, expires_at
    FROM jobs
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Array<Record<string, any>>;

  const shortLinks = db.prepare(`
    SELECT id, short_code, target_url, title, clicks, is_active, is_paused, created_at, expires_at, password_hash
    FROM short_links
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Array<{ password_hash: string | null } & Record<string, unknown>>;

  const linkClicks = db.prepare(`
    SELECT sl.short_code, lc.clicked_at, lc.click_count
    FROM link_clicks lc
    JOIN short_links sl ON sl.id = lc.link_id
    WHERE sl.user_id = ?
    ORDER BY lc.clicked_at DESC
  `).all(userId);

  const achievements = db.prepare(`
    SELECT achievement_id, unlocked_at
    FROM user_achievements
    WHERE user_id = ?
    ORDER BY unlocked_at DESC
  `).all(userId);

  const streak = db.prepare(`
    SELECT current_streak, longest_streak, last_activity_date
    FROM user_streaks
    WHERE user_id = ?
  `).get(userId);

  return {
    exportDate: new Date().toISOString(),
    exportVersion: '1.0',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      subscription: user.subscription,
      organization: user.organization,
      mfaEnabled: !!user.mfa_enabled,
      createdAt: user.created_at,
      consentVersion: user.consent_version,
      consentGivenAt: user.consent_given_at,
      deletionRequestedAt: user.deletion_requested_at
    },
    usage: {
      transcriptions: usage.transcriptions_count,
      videos: usage.videos_count,
      lastReset: usage.last_reset
    },
    sessions,
    recordings,
    sharedFiles: sharedFiles.map(({ password_hash, ...rest }) => ({
      ...rest,
      hasPassword: !!password_hash
    })),
    jobs: jobs.map(job => ({
      ...job,
      input_data: safeParseJson(job.input_data),
      result_data: safeParseJson(job.result_data)
    })),
    shortLinks: shortLinks.map(({ password_hash, ...rest }) => ({
      ...rest,
      hasPassword: !!password_hash
    })),
    linkClicks,
    achievements,
    streak: streak || null,
    activeSessions: sessions.length,
    auditLogCount: auditLogs.length,
    recentActivity: auditLogs.slice(0, 100).map(log => ({
      ...log,
      details: safeParseJson(log.details)
    })) // Last 100 actions
  };
};

// ===========================================
// GDPR ACCOUNT DELETION
// ===========================================

export const deleteUserAccount = (userId: number): void => {
  const recordingPaths = db.prepare(`
    SELECT file_path FROM user_recordings
    WHERE user_id = ? AND (storage_scope = 'user' OR storage_scope IS NULL)
  `).all(userId) as Array<{ file_path: string }>;
  const sharedFilePaths = db.prepare(`
    SELECT file_path FROM shared_files
    WHERE user_id = ? AND (storage_scope = 'user' OR storage_scope IS NULL)
  `).all(userId) as Array<{ file_path: string }>;
  const jobResultPaths = db.prepare(`
    SELECT result_file_path FROM jobs
    WHERE user_id = ? AND result_file_path IS NOT NULL
    AND (storage_scope = 'user' OR storage_scope IS NULL)
  `).all(userId) as Array<{ result_file_path: string }>;

  [...recordingPaths.map(r => r.file_path),
    ...sharedFilePaths.map(f => f.file_path),
    ...jobResultPaths.map(j => j.result_file_path)
  ].forEach(safeUnlink);

  // Anonymize audit logs (keep for compliance, remove user reference)
  db.prepare(`
    UPDATE audit_logs SET user_id = NULL, details = NULL
    WHERE user_id = ?
  `).run(userId);

  // Delete user (cascades to sessions and usage via foreign keys)
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
};

export const requestAccountDeletion = (userId: number): void => {
  db.prepare(`
    UPDATE users SET
      deletion_requested_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
};

export const cancelDeletionRequest = (userId: number): void => {
  db.prepare(`
    UPDATE users SET
      deletion_requested_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
};

// ===========================================
// CONSENT TRACKING
// ===========================================

export const recordConsent = (userId: number, consentVersion: string): void => {
  db.prepare(`
    UPDATE users SET
      consent_version = ?,
      consent_given_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(consentVersion, userId);
};

// ===========================================
// ADMIN FUNCTIONS
// ===========================================

export const getSecurityEvents = (
  limit: number = 100,
  offset: number = 0
): AuditLog[] => {
  const stmt = db.prepare(`
    SELECT * FROM audit_logs
    WHERE action IN ('login', 'register', 'mfa_verify', 'mfa_disable', 'account_locked')
    AND status = 'failure'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset) as AuditLog[];
};

export const getLockedAccounts = (): User[] => {
  const stmt = db.prepare(`
    SELECT * FROM users
    WHERE locked_until > datetime('now')
  `);
  return stmt.all() as User[];
};

export const unlockAccount = (userId: number): void => {
  db.prepare(`
    UPDATE users SET
      failed_login_attempts = 0,
      locked_until = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
};

// ===========================================
// AUDIT LOG RETENTION
// ===========================================

export const cleanupOldAuditLogs = (retentionDays: number = 90): number => {
  const result = db.prepare(`
    DELETE FROM audit_logs
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  return result.changes;
};

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

// Hash IP address for DSGVO compliance (anonymization)
// Uses required salt from config (no fallback)
export const hashIP = (ip: string): string => {
  return crypto.createHash('sha256').update(ip + IP_HASH_SALT).digest('hex').substring(0, 16);
};

// Generate secure random token
export const generateToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate request ID for audit trail
export const generateRequestId = (): string => {
  return crypto.randomBytes(8).toString('hex');
};

// ===========================================
// DASHBOARD STATISTICS
// ===========================================

export interface DashboardStats {
  toolUsage: {
    transcriptions: { total: number; thisMonth: number };
    pdfConversions: { total: number; thisMonth: number };
    podcasts: { total: number; thisMonth: number };
    shortLinks: { total: number; totalClicks: number };
  };
  recentActivity: Array<{
    type: string;
    status: string;
    resource: string | null;
    date: string;
  }>;
  usageQuota: {
    transcriptions: { used: number; limit: number };
    videos: { used: number; limit: number };
  };
  topLinks: Array<{
    shortCode: string;
    title: string | null;
    clicks: number;
  }>;
}

// ===========================================
// ACHIEVEMENTS SYSTEM
// ===========================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'impact' | 'consistency' | 'mastery' | 'explorer';
  unlockedAt?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Impact achievements
  { id: 'first_transcription', name: 'Erste Untertitel', description: 'Erstes Video transkribiert', icon: '🎬', category: 'impact' },
  { id: 'first_pdf', name: 'PDF-Pionier', description: 'Erste PDF/UA-Konvertierung', icon: '📄', category: 'impact' },
  { id: 'first_podcast', name: 'Podcast-Premiere', description: 'Ersten Podcast erstellt', icon: '🎙️', category: 'impact' },
  { id: 'docs_10', name: 'Einstieg', description: '10 Dokumente barrierefrei gemacht', icon: '🌱', category: 'impact' },
  { id: 'docs_50', name: 'Barrierebrecher', description: '50 Dokumente barrierefrei gemacht', icon: '🔨', category: 'impact' },
  { id: 'docs_100', name: 'Accessibility Champion', description: '100 Dokumente barrierefrei gemacht', icon: '🏆', category: 'impact' },
  { id: 'docs_500', name: 'Inklusions-Held', description: '500 Dokumente barrierefrei gemacht', icon: '🦸', category: 'impact' },
  { id: 'video_hours_1', name: 'Eine Stunde', description: '1 Stunde Video untertitelt', icon: '⏱️', category: 'impact' },
  { id: 'video_hours_10', name: 'Zehn Stunden', description: '10 Stunden Video untertitelt', icon: '⏰', category: 'impact' },
  { id: 'video_hours_100', name: 'Hundert Stunden', description: '100 Stunden Video untertitelt', icon: '🎖️', category: 'impact' },

  // Consistency achievements
  { id: 'streak_3', name: 'Dranbleiber', description: '3 Tage in Folge aktiv', icon: '🔥', category: 'consistency' },
  { id: 'streak_7', name: 'Wochenkrieger', description: '7 Tage in Folge aktiv', icon: '💪', category: 'consistency' },
  { id: 'streak_30', name: 'Monatsmeister', description: '30 Tage in Folge aktiv', icon: '👑', category: 'consistency' },

  // Mastery achievements
  { id: 'all_tools', name: 'Allrounder', description: 'Alle Tools mindestens einmal genutzt', icon: '🧰', category: 'mastery' },
  { id: 'persona_perfect', name: 'Perfekter Score', description: 'Dokument für alle 7 Personas zugänglich', icon: '✨', category: 'mastery' },

  // Explorer achievements
  { id: 'early_adopter', name: 'Early Adopter', description: 'Unter den ersten 100 Nutzern', icon: '🚀', category: 'explorer' },
];

export const getUserAchievements = (userId: number): Achievement[] => {
  const unlocked = db.prepare(`
    SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?
  `).all(userId) as Array<{ achievement_id: string; unlocked_at: string }>;

  const unlockedMap = new Map(unlocked.map(a => [a.achievement_id, a.unlocked_at]));

  return ACHIEVEMENTS.map(a => ({
    ...a,
    unlockedAt: unlockedMap.get(a.id)
  }));
};

export const unlockAchievement = (userId: number, achievementId: string): boolean => {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)
    `).run(userId, achievementId);
    return true;
  } catch {
    return false;
  }
};

export const checkAndUnlockAchievements = (userId: number): string[] => {
  const newlyUnlocked: string[] = [];

  // Get current stats
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN queue = 'transcription' AND status = 'completed' THEN 1 ELSE 0 END) as transcriptions,
      SUM(CASE WHEN queue = 'pdfua-conversion' AND status = 'completed' THEN 1 ELSE 0 END) as pdfs,
      SUM(CASE WHEN queue = 'podcast' AND status = 'completed' THEN 1 ELSE 0 END) as podcasts
    FROM jobs WHERE user_id = ?
  `).get(userId) as { transcriptions: number; pdfs: number; podcasts: number };

  const totalDocs = (stats.transcriptions || 0) + (stats.pdfs || 0) + (stats.podcasts || 0);

  // Check document milestones
  const docMilestones = [
    { count: 10, id: 'docs_10' },
    { count: 50, id: 'docs_50' },
    { count: 100, id: 'docs_100' },
    { count: 500, id: 'docs_500' },
  ];

  for (const milestone of docMilestones) {
    if (totalDocs >= milestone.count) {
      if (unlockAchievement(userId, milestone.id)) {
        newlyUnlocked.push(milestone.id);
      }
    }
  }

  // Check first-time achievements
  if (stats.transcriptions >= 1) unlockAchievement(userId, 'first_transcription');
  if (stats.pdfs >= 1) unlockAchievement(userId, 'first_pdf');
  if (stats.podcasts >= 1) unlockAchievement(userId, 'first_podcast');

  // Check all tools used
  if (stats.transcriptions >= 1 && stats.pdfs >= 1 && stats.podcasts >= 1) {
    unlockAchievement(userId, 'all_tools');
  }

  // Update streak
  updateUserStreak(userId);

  return newlyUnlocked;
};

export const updateUserStreak = (userId: number): { current: number; longest: number } => {
  const today = new Date().toISOString().split('T')[0];

  // Get or create streak record
  let streak = db.prepare(`SELECT * FROM user_streaks WHERE user_id = ?`).get(userId) as {
    current_streak: number;
    longest_streak: number;
    last_activity_date: string;
  } | undefined;

  if (!streak) {
    db.prepare(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES (?, 1, 1, ?)`).run(userId, today);
    unlockAchievement(userId, 'streak_3'); // Will be ignored if not 3 days
    return { current: 1, longest: 1 };
  }

  const lastDate = streak.last_activity_date;
  if (lastDate === today) {
    return { current: streak.current_streak, longest: streak.longest_streak };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let newStreak = 1;
  if (lastDate === yesterday) {
    newStreak = streak.current_streak + 1;
  }

  const newLongest = Math.max(streak.longest_streak, newStreak);

  db.prepare(`
    UPDATE user_streaks SET current_streak = ?, longest_streak = ?, last_activity_date = ? WHERE user_id = ?
  `).run(newStreak, newLongest, today, userId);

  // Check streak achievements
  if (newStreak >= 3) unlockAchievement(userId, 'streak_3');
  if (newStreak >= 7) unlockAchievement(userId, 'streak_7');
  if (newStreak >= 30) unlockAchievement(userId, 'streak_30');

  return { current: newStreak, longest: newLongest };
};

// ===========================================
// IMPACT METRICS
// ===========================================

export interface ImpactMetrics {
  totalDocuments: number;
  videoMinutesAccessible: number;
  estimatedPeopleReached: number;
  criticalIssuesFixed: number;
  accessibilityScore: number;
  streak: { current: number; longest: number };
}

export const getImpactMetrics = (userId: number): ImpactMetrics => {
  // Get job stats
  const jobStats = db.prepare(`
    SELECT
      COUNT(*) as total_docs,
      SUM(CASE WHEN queue = 'transcription' AND status = 'completed' THEN 1 ELSE 0 END) as transcriptions
    FROM jobs
    WHERE user_id = ? AND status = 'completed'
  `).get(userId) as { total_docs: number; transcriptions: number };

  // Estimate video minutes from transcription jobs (average 5 min per transcription)
  const videoMinutes = (jobStats.transcriptions || 0) * 5;

  // Estimate people reached: each accessible document reaches ~20% more audience
  // For 7 personas: accessible doc reaches all 7, limited reaches ~4, blocked reaches ~2
  // Average improvement: +3 personas * 1000 people per persona segment = 3000 per doc
  const estimatedReach = (jobStats.total_docs || 0) * 500;

  // Get streak
  const streakData = db.prepare(`
    SELECT current_streak, longest_streak FROM user_streaks WHERE user_id = ?
  `).get(userId) as { current_streak: number; longest_streak: number } | undefined;

  // Calculate accessibility score based on activity
  // More diverse tool usage = higher score
  const toolUsage = db.prepare(`
    SELECT COUNT(DISTINCT queue) as unique_tools FROM jobs WHERE user_id = ? AND status = 'completed'
  `).get(userId) as { unique_tools: number };

  const accessibilityScore = Math.min(100, (jobStats.total_docs || 0) * 2 + (toolUsage.unique_tools || 0) * 10);

  return {
    totalDocuments: jobStats.total_docs || 0,
    videoMinutesAccessible: videoMinutes,
    estimatedPeopleReached: estimatedReach,
    criticalIssuesFixed: Math.floor((jobStats.total_docs || 0) * 2.5), // Average 2.5 issues per doc
    accessibilityScore,
    streak: {
      current: streakData?.current_streak || 0,
      longest: streakData?.longest_streak || 0
    }
  };
};

// ===========================================
// LEARNING RECOMMENDATIONS
// ===========================================

export interface LearningRecommendation {
  id: string;
  title: string;
  description: string;
  type: 'tip' | 'warning' | 'celebration';
  action?: string;
  actionUrl?: string;
}

export const getLearningRecommendations = (userId: number): LearningRecommendation[] => {
  const recommendations: LearningRecommendation[] = [];

  // Get usage patterns
  const usage = db.prepare(`
    SELECT
      SUM(CASE WHEN queue = 'transcription' THEN 1 ELSE 0 END) as transcriptions,
      SUM(CASE WHEN queue = 'pdfua-conversion' THEN 1 ELSE 0 END) as pdfs,
      SUM(CASE WHEN queue = 'podcast' THEN 1 ELSE 0 END) as podcasts
    FROM jobs WHERE user_id = ? AND status = 'completed'
  `).get(userId) as { transcriptions: number; pdfs: number; podcasts: number };

  const totalDocs = (usage.transcriptions || 0) + (usage.pdfs || 0) + (usage.podcasts || 0);

  // Onboarding recommendations
  if (totalDocs === 0) {
    recommendations.push({
      id: 'start',
      title: 'Willkommen bei VoxDrop!',
      description: 'Starten Sie mit Ihrer ersten Transkription oder PDF-Konvertierung.',
      type: 'tip',
      action: 'Jetzt starten',
      actionUrl: '/tools/untertitel'
    });
  }

  // Tool discovery
  if (usage.transcriptions > 0 && usage.pdfs === 0) {
    recommendations.push({
      id: 'try_pdf',
      title: 'PDF/UA noch nicht entdeckt?',
      description: 'Konvertieren Sie PowerPoints in barrierefreie PDFs für noch mehr Reichweite.',
      type: 'tip',
      action: 'PDF/UA testen',
      actionUrl: '/tools/pptx-to-pdf-smart'
    });
  }

  if (usage.pdfs > 0 && usage.podcasts === 0) {
    recommendations.push({
      id: 'try_podcast',
      title: 'Podcasts aus Präsentationen',
      description: 'Machen Sie Ihre Inhalte auch für Audio-Lerner zugänglich.',
      type: 'tip',
      action: 'Podcast erstellen',
      actionUrl: '/tools/pptx-podcast'
    });
  }

  // Milestone celebrations
  if (totalDocs === 10) {
    recommendations.push({
      id: 'celebrate_10',
      title: '10 Dokumente geschafft!',
      description: 'Sie haben bereits 10 Dokumente barrierefrei gemacht. Weiter so!',
      type: 'celebration'
    });
  }

  // Streak encouragement
  const streak = db.prepare(`SELECT current_streak FROM user_streaks WHERE user_id = ?`).get(userId) as { current_streak: number } | undefined;
  if (streak && streak.current_streak >= 3 && streak.current_streak < 7) {
    recommendations.push({
      id: 'streak_going',
      title: `${streak.current_streak} Tage Streak!`,
      description: 'Noch ${7 - streak.current_streak} Tage bis zum Wochenkrieger-Badge.',
      type: 'celebration'
    });
  }

  return recommendations.slice(0, 3); // Max 3 recommendations
};

// ===========================================
// EXTENDED DASHBOARD STATS
// ===========================================

export interface ExtendedDashboardStats extends DashboardStats {
  impact: ImpactMetrics;
  achievements: Achievement[];
  recommendations: LearningRecommendation[];
}

export const getExtendedDashboardStats = (userId: number, usageLimits: { transcriptions: number; videos: number }): ExtendedDashboardStats => {
  const baseStats = getDashboardStats(userId, usageLimits);

  // Check for new achievements
  checkAndUnlockAchievements(userId);

  return {
    ...baseStats,
    impact: getImpactMetrics(userId),
    achievements: getUserAchievements(userId),
    recommendations: getLearningRecommendations(userId)
  };
};

export const getDashboardStats = (userId: number, usageLimits: { transcriptions: number; videos: number }): DashboardStats => {
  // Tool usage from jobs table
  const jobStats = db.prepare(`
    SELECT
      SUM(CASE WHEN queue = 'transcription' AND status = 'completed' THEN 1 ELSE 0 END) as transcriptions_total,
      SUM(CASE WHEN queue = 'transcription' AND status = 'completed' AND created_at >= date('now', 'start of month') THEN 1 ELSE 0 END) as transcriptions_month,
      SUM(CASE WHEN queue = 'pdfua-conversion' AND status = 'completed' THEN 1 ELSE 0 END) as pdf_total,
      SUM(CASE WHEN queue = 'pdfua-conversion' AND status = 'completed' AND created_at >= date('now', 'start of month') THEN 1 ELSE 0 END) as pdf_month,
      SUM(CASE WHEN queue = 'podcast' AND status = 'completed' THEN 1 ELSE 0 END) as podcasts_total,
      SUM(CASE WHEN queue = 'podcast' AND status = 'completed' AND created_at >= date('now', 'start of month') THEN 1 ELSE 0 END) as podcasts_month
    FROM jobs
    WHERE user_id = ?
  `).get(userId) as {
    transcriptions_total: number | null;
    transcriptions_month: number | null;
    pdf_total: number | null;
    pdf_month: number | null;
    podcasts_total: number | null;
    podcasts_month: number | null;
  };

  // Short links stats
  const linkStats = db.prepare(`
    SELECT
      COUNT(*) as total_links,
      COALESCE(SUM(clicks), 0) as total_clicks
    FROM short_links
    WHERE user_id = ? AND is_active = 1
  `).get(userId) as { total_links: number; total_clicks: number };

  // Recent activity from audit logs
  const recentActivity = db.prepare(`
    SELECT action as type, status, resource, created_at as date
    FROM audit_logs
    WHERE user_id = ?
      AND action IN ('transcribe', 'simplify_text', 'pptx_convert', 'podcast_convert', 'link_create', 'color_analysis')
    ORDER BY created_at DESC
    LIMIT 5
  `).all(userId) as Array<{ type: string; status: string; resource: string | null; date: string }>;

  // Usage quota
  const usage = getOrCreateUsage(userId);

  // Top 5 links by clicks
  const topLinks = db.prepare(`
    SELECT short_code as shortCode, title, clicks
    FROM short_links
    WHERE user_id = ? AND is_active = 1
    ORDER BY clicks DESC
    LIMIT 5
  `).all(userId) as Array<{ shortCode: string; title: string | null; clicks: number }>;

  return {
    toolUsage: {
      transcriptions: {
        total: jobStats.transcriptions_total || 0,
        thisMonth: jobStats.transcriptions_month || 0
      },
      pdfConversions: {
        total: jobStats.pdf_total || 0,
        thisMonth: jobStats.pdf_month || 0
      },
      podcasts: {
        total: jobStats.podcasts_total || 0,
        thisMonth: jobStats.podcasts_month || 0
      },
      shortLinks: {
        total: linkStats.total_links || 0,
        totalClicks: linkStats.total_clicks || 0
      }
    },
    recentActivity,
    usageQuota: {
      transcriptions: {
        used: usage.transcriptions_count,
        limit: usageLimits.transcriptions
      },
      videos: {
        used: usage.videos_count,
        limit: usageLimits.videos
      }
    },
    topLinks
  };
};

// ===========================================
// USER RECORDINGS (24h Storage)
// ===========================================

export type StorageScope = 'user' | 'workspace';

export interface UserRecording {
  id: string;
  user_id: number;
  storage_scope: StorageScope;
  workspace_id: string | null;
  project_id: string | null;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  duration_seconds: number | null;
  created_at: string;
  expires_at: string;
}

export const createRecording = (
  userId: number,
  id: string,
  filename: string,
  originalName: string,
  filePath: string,
  fileSize: number,
  mimeType: string,
  durationSeconds?: number,
  scope: StorageScope = 'user',
  workspaceId?: string | null,
  projectId?: string | null
): UserRecording => {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now

  const stmt = db.prepare(`
    INSERT INTO user_recordings (
      id, user_id, storage_scope, workspace_id, project_id,
      filename, original_name, file_path, file_size, mime_type,
      duration_seconds, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    userId,
    scope,
    workspaceId || null,
    projectId || null,
    filename,
    originalName,
    filePath,
    fileSize,
    mimeType,
    durationSeconds || null,
    expiresAt
  );
  return getRecordingByIdForUser(id, userId)!;
};

export const getUserRecordings = (userId: number): UserRecording[] => {
  const stmt = db.prepare(`
    SELECT * FROM user_recordings
    WHERE user_id = ? AND (storage_scope = 'user' OR storage_scope IS NULL)
    AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `);
  return stmt.all(userId) as UserRecording[];
};

export const getWorkspaceRecordings = (workspaceId: string, projectId?: string | null): UserRecording[] => {
  const stmt = db.prepare(`
    SELECT * FROM user_recordings
    WHERE workspace_id = ? AND storage_scope = 'workspace'
    ${projectId ? 'AND project_id = ?' : ''}
    AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `);
  return projectId ? (stmt.all(workspaceId, projectId) as UserRecording[]) : (stmt.all(workspaceId) as UserRecording[]);
};

export const getRecordingByIdForUser = (recordingId: string, userId: number): UserRecording | undefined => {
  const stmt = db.prepare(`
    SELECT r.* FROM user_recordings r
    WHERE r.id = ?
    AND r.expires_at > datetime('now')
    AND (
      (r.user_id = ? AND (r.storage_scope = 'user' OR r.storage_scope IS NULL))
      OR (
        r.storage_scope = 'workspace'
        AND r.workspace_id IN (
          SELECT workspace_id FROM workspace_members
          WHERE user_id = ? AND status = 'active'
        )
      )
    )
  `);
  return stmt.get(recordingId, userId, userId) as UserRecording | undefined;
};

export const deleteRecordingForUser = (recordingId: string, userId: number): boolean => {
  const stmt = db.prepare(`
    DELETE FROM user_recordings
    WHERE id = ? AND user_id = ? AND (storage_scope = 'user' OR storage_scope IS NULL)
  `);
  const result = stmt.run(recordingId, userId);
  return result.changes > 0;
};

export const deleteWorkspaceRecording = (recordingId: string, workspaceId: string): boolean => {
  const stmt = db.prepare(`
    DELETE FROM user_recordings
    WHERE id = ? AND workspace_id = ? AND storage_scope = 'workspace'
  `);
  const result = stmt.run(recordingId, workspaceId);
  return result.changes > 0;
};

export const getRecordingCount = (userId: number): number => {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM user_recordings
    WHERE user_id = ? AND (storage_scope = 'user' OR storage_scope IS NULL) AND expires_at > datetime('now')
  `);
  const result = stmt.get(userId) as { count: number };
  return result.count;
};

// ===========================================
// WORKSPACE + BILLING QUERIES
// ===========================================

export interface Workspace {
  id: string;
  name: string;
  plan_id: PlanId;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: number;
  workspace_id: string;
  user_id: number;
  role: 'owner' | 'admin' | 'billing_admin' | 'creator' | 'reviewer' | 'viewer';
  seat_type: 'creator' | 'reviewer';
  status: 'active' | 'invited' | 'removed';
  invited_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  email: string;
}

export interface WorkspaceProject {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: 'creator' | 'owner';
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: number | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface CreditWallet {
  workspace_id: string;
  balance: number;
  reserved: number;
  last_allocation_at: string | null;
  updated_at: string;
}

export interface CreditLedgerEntry {
  id: number;
  workspace_id: string;
  type: 'ALLOCATION' | 'CONSUME' | 'RESERVE' | 'RELEASE' | 'PURCHASE' | 'ADJUST';
  amount: number;
  job_id: string | null;
  meta: string | null;
  created_at: string;
}

export interface CreditUsageDay {
  day: string;
  consumed: number;
  reserved: number;
  added: number;
}

export interface CreditUsageSummary {
  totals: {
    consumed: number;
    reserved: number;
    added: number;
  };
  daily: CreditUsageDay[];
}

const resolvePlanIdForSubscription = (subscription: string): PlanId => {
  return SUBSCRIPTION_PLAN_MAP[subscription] || 'free';
};

export const createWorkspace = (name: string, planId: PlanId): Workspace => {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspaces (id, name, plan_id)
    VALUES (?, ?, ?)
  `).run(id, name, planId);
  return getWorkspaceById(id)!;
};

export const getWorkspaceById = (workspaceId: string): Workspace | undefined => {
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as Workspace | undefined;
};

export const getWorkspacesForUser = (userId: number): Workspace[] => {
  const stmt = db.prepare(`
    SELECT w.* FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ? AND wm.status = 'active'
    ORDER BY w.created_at DESC
  `);
  return stmt.all(userId) as Workspace[];
};

export const getWorkspaceMember = (workspaceId: string, userId: number): WorkspaceMember | undefined => {
  const stmt = db.prepare(`
    SELECT * FROM workspace_members
    WHERE workspace_id = ? AND user_id = ? AND status = 'active'
  `);
  return stmt.get(workspaceId, userId) as WorkspaceMember | undefined;
};

export const getWorkspaceMemberById = (memberId: number): WorkspaceMember | undefined => {
  const stmt = db.prepare(`
    SELECT * FROM workspace_members
    WHERE id = ?
  `);
  return stmt.get(memberId) as WorkspaceMember | undefined;
};

export const getWorkspaceMembers = (workspaceId: string): WorkspaceMember[] => {
  const stmt = db.prepare(`
    SELECT * FROM workspace_members
    WHERE workspace_id = ? AND status = 'active'
    ORDER BY created_at ASC
  `);
  return stmt.all(workspaceId) as WorkspaceMember[];
};

export const getWorkspaceMembersWithUser = (workspaceId: string): WorkspaceMemberWithUser[] => {
  const stmt = db.prepare(`
    SELECT wm.*, u.email as email
    FROM workspace_members wm
    INNER JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ? AND wm.status = 'active'
    ORDER BY wm.created_at ASC
  `);
  return stmt.all(workspaceId) as WorkspaceMemberWithUser[];
};

export const countWorkspaceOwners = (workspaceId: string): number => {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM workspace_members
    WHERE workspace_id = ? AND status = 'active' AND role = 'owner'
  `);
  const row = stmt.get(workspaceId) as { count: number };
  return row?.count || 0;
};

export const removeWorkspaceMember = (memberId: number, workspaceId: string): boolean => {
  const stmt = db.prepare(`
    UPDATE workspace_members
    SET status = 'removed', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND workspace_id = ? AND status = 'active'
  `);
  const result = stmt.run(memberId, workspaceId);
  return result.changes > 0;
};

export const getWorkspaceProjects = (workspaceId: string): WorkspaceProject[] => {
  const stmt = db.prepare(`
    SELECT * FROM workspace_projects
    WHERE workspace_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(workspaceId) as WorkspaceProject[];
};

export const getWorkspaceProjectById = (projectId: string): WorkspaceProject | undefined => {
  return db.prepare('SELECT * FROM workspace_projects WHERE id = ?').get(projectId) as WorkspaceProject | undefined;
};

export const createWorkspaceProject = (
  workspaceId: string,
  name: string,
  createdBy?: number | null,
  description?: string | null
): WorkspaceProject => {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_projects (id, workspace_id, name, description, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, workspaceId, name, description || null, createdBy || null);
  return getWorkspaceProjectById(id)!;
};

export const deleteWorkspaceProject = (projectId: string, workspaceId: string): boolean => {
  const stmt = db.prepare(`
    DELETE FROM workspace_projects
    WHERE id = ? AND workspace_id = ?
  `);
  const result = stmt.run(projectId, workspaceId);
  return result.changes > 0;
};

export const createWorkspaceMember = (
  workspaceId: string,
  userId: number,
  role: WorkspaceMember['role'],
  seatType: WorkspaceMember['seat_type'] = 'creator',
  status: WorkspaceMember['status'] = 'active',
  invitedEmail?: string | null
): WorkspaceMember => {
  db.prepare(`
    INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, seat_type, status, invited_email)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workspaceId, userId, role, seatType, status, invitedEmail || null);
  return getWorkspaceMember(workspaceId, userId)!;
};

export const createWorkspaceInvite = (
  workspaceId: string,
  email: string,
  invitedBy?: number | null,
  role: WorkspaceInvite['role'] = 'creator',
  expiresInDays: number = 7
): WorkspaceInvite => {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO workspace_invites (id, workspace_id, email, role, token, status, invited_by, expires_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, workspaceId, email.toLowerCase(), role, token, invitedBy || null, expiresAt);

  return getWorkspaceInviteByToken(token)!;
};

export const getWorkspaceInviteByToken = (token: string): WorkspaceInvite | undefined => {
  return db.prepare(`
    SELECT * FROM workspace_invites
    WHERE token = ?
  `).get(token) as WorkspaceInvite | undefined;
};

export const getWorkspaceInvitesForWorkspace = (workspaceId: string): WorkspaceInvite[] => {
  return db.prepare(`
    SELECT * FROM workspace_invites
    WHERE workspace_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId) as WorkspaceInvite[];
};

export const markWorkspaceInviteAccepted = (inviteId: string): void => {
  db.prepare(`
    UPDATE workspace_invites
    SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(inviteId);
};

export const revokeWorkspaceInvite = (inviteId: string, workspaceId: string): boolean => {
  const result = db.prepare(`
    UPDATE workspace_invites
    SET status = 'revoked'
    WHERE id = ? AND workspace_id = ? AND status = 'pending'
  `).run(inviteId, workspaceId);
  return result.changes > 0;
};

export const setUserDefaultWorkspace = (userId: number, workspaceId: string): void => {
  db.prepare(`
    UPDATE users SET default_workspace_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(workspaceId, userId);
};

export const getUserDefaultWorkspaceId = (userId: number): string | null => {
  const row = db.prepare('SELECT default_workspace_id FROM users WHERE id = ?').get(userId) as { default_workspace_id: string | null } | undefined;
  return row?.default_workspace_id || null;
};

export const getOrCreateDefaultWorkspaceForUser = (user: User): Workspace => {
  if (user.default_workspace_id) {
    const existing = getWorkspaceById(user.default_workspace_id);
    if (existing) {
      return existing;
    }
  }

  const planId = resolvePlanIdForSubscription(user.subscription);
  const fallbackName = user.organization?.trim() || user.email.split('@')[0] || 'Persönlicher Workspace';
  const workspace = createWorkspace(fallbackName, planId);
  createWorkspaceMember(workspace.id, user.id, 'owner', 'creator', 'active');
  setUserDefaultWorkspace(user.id, workspace.id);
  ensureCreditWallet(workspace.id, planId);
  return workspace;
};

export const getCreditWallet = (workspaceId: string): CreditWallet | undefined => {
  return db.prepare('SELECT * FROM credit_wallets WHERE workspace_id = ?').get(workspaceId) as CreditWallet | undefined;
};

export const ensureCreditWallet = (workspaceId: string, planId?: PlanId): CreditWallet => {
  let wallet = getCreditWallet(workspaceId);
  if (!wallet) {
    db.prepare(`
      INSERT INTO credit_wallets (workspace_id, balance, reserved)
      VALUES (?, 0, 0)
    `).run(workspaceId);
    wallet = getCreditWallet(workspaceId)!;
  }

  if (planId) {
    wallet = applyMonthlyAllocation(workspaceId, planId);
  }
  return wallet;
};

const insertCreditLedger = (
  workspaceId: string,
  type: CreditLedgerEntry['type'],
  amount: number,
  jobId?: string | null,
  meta?: object | null
): void => {
  db.prepare(`
    INSERT INTO credit_ledger (workspace_id, type, amount, job_id, meta)
    VALUES (?, ?, ?, ?, ?)
  `).run(workspaceId, type, amount, jobId || null, meta ? JSON.stringify(meta) : null);
};

export const hasFinalCreditLedgerEntryForJob = (workspaceId: string, jobId: string): boolean => {
  const row = db.prepare(`
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = ?
      AND job_id = ?
      AND type IN ('CONSUME', 'RELEASE')
    LIMIT 1
  `).get(workspaceId, jobId) as { 1: 1 } | undefined;
  return !!row;
};

const isSameMonth = (a: Date, b: Date): boolean => {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
};

export const applyMonthlyAllocation = (workspaceId: string, planId: PlanId): CreditWallet => {
  const tx = db.transaction(() => {
    let wallet = ensureCreditWallet(workspaceId);
    const now = new Date();
    const lastAllocation = wallet.last_allocation_at ? new Date(wallet.last_allocation_at) : null;

    if (lastAllocation && isSameMonth(lastAllocation, now)) {
      return wallet;
    }

    const included = PLAN_CONFIG[planId]?.includedCreditsPerMonth || 0;
    const rolloverCap = Math.floor(included * CREDIT_ROLLOVER_MAX_PERCENT);
    const rollover = rolloverCap > 0 ? Math.min(wallet.balance, rolloverCap) : 0;
    const newBalance = included + rollover;

    db.prepare(`
      UPDATE credit_wallets
      SET balance = ?, last_allocation_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?
    `).run(newBalance, now.toISOString(), workspaceId);

    insertCreditLedger(workspaceId, 'ALLOCATION', included, null, {
      planId,
      rollover,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    });

    wallet = getCreditWallet(workspaceId)!;
    return wallet;
  });

  return tx();
};

export const reserveCredits = (
  workspaceId: string,
  amount: number,
  jobId?: string | null,
  meta?: object | null
): CreditWallet => {
  if (amount <= 0) {
    throw new Error('invalid_amount');
  }

  const tx = db.transaction(() => {
    const wallet = getCreditWallet(workspaceId);
    if (!wallet) throw new Error('wallet_not_found');
    if (wallet.balance < amount) throw new Error('insufficient_credits');

    db.prepare(`
      UPDATE credit_wallets
      SET balance = balance - ?, reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?
    `).run(amount, amount, workspaceId);

    insertCreditLedger(workspaceId, 'RESERVE', amount, jobId, meta || null);
    return getCreditWallet(workspaceId)!;
  });

  return tx();
};

export const spendCredits = (
  workspaceId: string,
  amount: number,
  jobId?: string | null,
  meta?: object | null
): CreditWallet => {
  if (amount <= 0) {
    throw new Error('invalid_amount');
  }

  const tx = db.transaction(() => {
    const wallet = getCreditWallet(workspaceId);
    if (!wallet) throw new Error('wallet_not_found');
    if (wallet.balance < amount) throw new Error('insufficient_credits');

    db.prepare(`
      UPDATE credit_wallets
      SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?
    `).run(amount, workspaceId);

    insertCreditLedger(workspaceId, 'CONSUME', amount, jobId, meta || null);
    return getCreditWallet(workspaceId)!;
  });

  return tx();
};

export const consumeCredits = (
  workspaceId: string,
  amount: number,
  jobId?: string | null,
  meta?: object | null
): CreditWallet => {
  if (amount <= 0) {
    throw new Error('invalid_amount');
  }

  const tx = db.transaction(() => {
    const wallet = getCreditWallet(workspaceId);
    if (!wallet) throw new Error('wallet_not_found');
    if (wallet.reserved < amount) throw new Error('insufficient_reserved');

    db.prepare(`
      UPDATE credit_wallets
      SET reserved = reserved - ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?
    `).run(amount, workspaceId);

    insertCreditLedger(workspaceId, 'CONSUME', amount, jobId, meta || null);
    return getCreditWallet(workspaceId)!;
  });

  return tx();
};

export const releaseCredits = (
  workspaceId: string,
  amount: number,
  jobId?: string | null,
  meta?: object | null
): CreditWallet => {
  if (amount <= 0) {
    throw new Error('invalid_amount');
  }

  const tx = db.transaction(() => {
    const wallet = getCreditWallet(workspaceId);
    if (!wallet) throw new Error('wallet_not_found');
    if (wallet.reserved < amount) throw new Error('insufficient_reserved');

    db.prepare(`
      UPDATE credit_wallets
      SET balance = balance + ?, reserved = reserved - ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?
    `).run(amount, amount, workspaceId);

    insertCreditLedger(workspaceId, 'RELEASE', amount, jobId, meta || null);
    return getCreditWallet(workspaceId)!;
  });

  return tx();
};

export const addCredits = (
  workspaceId: string,
  amount: number,
  type: 'PURCHASE' | 'ADJUST',
  meta?: object | null
): CreditWallet => {
  if (amount <= 0) {
    throw new Error('invalid_amount');
  }

  const tx = db.transaction(() => {
    const wallet = getCreditWallet(workspaceId);
    if (!wallet) throw new Error('wallet_not_found');

    db.prepare(`
      UPDATE credit_wallets
      SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?
    `).run(amount, workspaceId);

    insertCreditLedger(workspaceId, type, amount, null, meta || null);
    return getCreditWallet(workspaceId)!;
  });

  return tx();
};

export const getCreditUsageSummary = (
  workspaceId: string,
  from: Date,
  to: Date
): CreditUsageSummary => {
  const stmt = db.prepare(`
    SELECT date(created_at) as day,
      SUM(CASE WHEN type = 'CONSUME' THEN amount ELSE 0 END) as consumed,
      SUM(CASE WHEN type = 'RESERVE' THEN amount ELSE 0 END) as reserved,
      SUM(CASE WHEN type IN ('PURCHASE','ALLOCATION','ADJUST') THEN amount ELSE 0 END) as added
    FROM credit_ledger
    WHERE workspace_id = ? AND created_at >= ? AND created_at <= ?
    GROUP BY date(created_at)
    ORDER BY date(created_at) ASC
  `);

  const rows = stmt.all(workspaceId, from.toISOString(), to.toISOString()) as CreditUsageDay[];
  const totals = rows.reduce(
    (acc, row) => ({
      consumed: acc.consumed + (row.consumed || 0),
      reserved: acc.reserved + (row.reserved || 0),
      added: acc.added + (row.added || 0),
    }),
    { consumed: 0, reserved: 0, added: 0 }
  );

  return {
    totals,
    daily: rows.map(row => ({
      day: row.day,
      consumed: row.consumed || 0,
      reserved: row.reserved || 0,
      added: row.added || 0,
    })),
  };
};

// ===========================================
// BLOG (CMS-lite)
// ===========================================

export type BlogPostStatus = 'draft' | 'published';

export interface BlogPostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  author: string;
  category: string;
  status: BlogPostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export const listBlogPostsAdmin = (): BlogPostRow[] => {
  const stmt = db.prepare(`
    SELECT *
    FROM blog_posts
    ORDER BY datetime(updated_at) DESC, id DESC
  `);
  return stmt.all() as BlogPostRow[];
};

export const listBlogPostsPublic = (): BlogPostRow[] => {
  const stmt = db.prepare(`
    SELECT *
    FROM blog_posts
    WHERE status = 'published'
    ORDER BY datetime(published_at) DESC, id DESC
  `);
  return stmt.all() as BlogPostRow[];
};

export const getBlogPostBySlugAdmin = (slug: string): BlogPostRow | undefined => {
  const stmt = db.prepare(`SELECT * FROM blog_posts WHERE slug = ?`);
  return stmt.get(slug) as BlogPostRow | undefined;
};

export const getBlogPostBySlugPublic = (slug: string): BlogPostRow | undefined => {
  const stmt = db.prepare(`
    SELECT *
    FROM blog_posts
    WHERE slug = ? AND status = 'published'
  `);
  return stmt.get(slug) as BlogPostRow | undefined;
};

export const createBlogPost = (input: {
  slug: string;
  title: string;
  excerpt?: string;
  content_md?: string;
  author?: string;
  category?: string;
  status?: BlogPostStatus;
  published_at?: string | null;
}): BlogPostRow => {
  const stmt = db.prepare(`
    INSERT INTO blog_posts (slug, title, excerpt, content_md, author, category, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    input.slug,
    input.title,
    input.excerpt || '',
    input.content_md || '',
    input.author || '',
    input.category || '',
    input.status || 'draft',
    input.published_at || null,
  );

  const row = db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(result.lastInsertRowid) as BlogPostRow | undefined;
  if (!row) throw new Error('blog_post_create_failed');
  return row;
};

export const updateBlogPost = (id: number, patch: Partial<{
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  author: string;
  category: string;
  status: BlogPostStatus;
  published_at: string | null;
}>): BlogPostRow => {
  const current = db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(id) as BlogPostRow | undefined;
  if (!current) throw new Error('blog_post_not_found');

  const nextStatus = (patch.status ?? current.status) as BlogPostStatus;
  // If publishing without explicit published_at, set it now.
  const nextPublishedAt =
    nextStatus === 'published'
      ? (patch.published_at ?? current.published_at ?? new Date().toISOString())
      : (patch.published_at ?? null);

  const stmt = db.prepare(`
    UPDATE blog_posts
    SET
      slug = ?,
      title = ?,
      excerpt = ?,
      content_md = ?,
      author = ?,
      category = ?,
      status = ?,
      published_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    patch.slug ?? current.slug,
    patch.title ?? current.title,
    patch.excerpt ?? current.excerpt,
    patch.content_md ?? current.content_md,
    patch.author ?? current.author,
    patch.category ?? current.category,
    nextStatus,
    nextPublishedAt,
    id
  );

  const row = db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(id) as BlogPostRow | undefined;
  if (!row) throw new Error('blog_post_update_failed');
  return row;
};

export const deleteBlogPost = (id: number): void => {
  db.prepare(`DELETE FROM blog_posts WHERE id = ?`).run(id);
};
