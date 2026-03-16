/**
 * URL Shortener Service
 * Barrierefreie Kurzlinks mit sprechenden deutschen Wörtern
 * Erweitert für Behörden: Ablaufdatum, Custom Codes, Passwortschutz
 */

import db from '../db/init';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { GERMAN_WORDS } from './german-words';

export interface ShortLink {
  id: number;
  short_code: string;
  target_url: string;
  title: string | null;
  user_id: number;
  clicks: number;
  is_active: number;
  is_paused: number;
  password_hash: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface ClickStat {
  date: string;
  clicks: number;
}

export interface CreateLinkOptions {
  title?: string;
  customCode?: string;
  expiresAt?: Date;
  password?: string;
}

export interface UpdateLinkOptions {
  targetUrl?: string;
  title?: string;
  expiresAt?: Date | null;
  password?: string | null;
}

/**
 * Generiert einen wortbasierten Kurzcode
 * Format: "wort1-wort2" (z.B. "sonne-berg")
 */
export function generateShortCode(): string {
  const bytes = crypto.randomBytes(4);
  const index1 = bytes.readUInt16BE(0) % GERMAN_WORDS.length;
  const index2 = bytes.readUInt16BE(2) % GERMAN_WORDS.length;

  // Sicherstellen, dass nicht zweimal dasselbe Wort
  let finalIndex2 = index2;
  if (index1 === index2) {
    finalIndex2 = (index2 + 1) % GERMAN_WORDS.length;
  }

  return `${GERMAN_WORDS[index1]}-${GERMAN_WORDS[finalIndex2]}`;
}

/**
 * Validiert eine URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validiert einen Custom Code
 */
export function isValidCustomCode(code: string): boolean {
  // 3-50 Zeichen, nur Kleinbuchstaben, Zahlen und Bindestriche
  return /^[a-z0-9-]{3,50}$/.test(code);
}

/**
 * Prüft ob ein Code verfügbar ist
 */
export function isCodeAvailable(code: string): boolean {
  const existing = db.prepare(
    'SELECT id FROM short_links WHERE short_code = ?'
  ).get(code);
  return !existing;
}

/**
 * Erstellt einen neuen Short Link
 */
export async function createShortLink(
  targetUrl: string,
  userId: number,
  options?: CreateLinkOptions
): Promise<ShortLink> {
  let shortCode: string;

  // Custom Code oder generierter Code
  if (options?.customCode) {
    if (!isValidCustomCode(options.customCode)) {
      throw new Error('Ungültiger Custom Code. Erlaubt: 3-50 Zeichen, Kleinbuchstaben, Zahlen, Bindestriche.');
    }
    if (!isCodeAvailable(options.customCode)) {
      throw new Error('Dieser Custom Code ist bereits vergeben.');
    }
    shortCode = options.customCode;
  } else {
    // Generiere eindeutigen Code
    let attempts = 0;
    const maxAttempts = 10;

    do {
      shortCode = generateShortCode();
      if (isCodeAvailable(shortCode)) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error('Konnte keinen eindeutigen Short Code generieren');
    }
  }

  // Passwort hashen falls angegeben
  let passwordHash: string | null = null;
  if (options?.password) {
    passwordHash = await bcrypt.hash(options.password, 10);
  }

  // Ablaufdatum formatieren
  const expiresAt = options?.expiresAt
    ? options.expiresAt.toISOString()
    : null;

  const result = db.prepare(`
    INSERT INTO short_links (short_code, target_url, title, user_id, expires_at, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(shortCode, targetUrl, options?.title || null, userId, expiresAt, passwordHash);

  return {
    id: result.lastInsertRowid as number,
    short_code: shortCode,
    target_url: targetUrl,
    title: options?.title || null,
    user_id: userId,
    clicks: 0,
    is_active: 1,
    is_paused: 0,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  };
}

/**
 * Findet einen Short Link anhand des Codes (für Redirect)
 * Gibt null zurück wenn nicht aktiv
 */
export function findShortLink(code: string): ShortLink | null {
  return db.prepare(`
    SELECT * FROM short_links
    WHERE short_code = ? AND is_active = 1
  `).get(code) as ShortLink | null;
}

/**
 * Prüft den Status eines Links für Redirect
 */
export function getLinkStatus(code: string): {
  exists: boolean;
  expired: boolean;
  paused: boolean;
  passwordProtected: boolean;
  link: ShortLink | null;
} {
  const link = db.prepare(`
    SELECT * FROM short_links WHERE short_code = ? AND is_active = 1
  `).get(code) as ShortLink | null;

  if (!link) {
    return { exists: false, expired: false, paused: false, passwordProtected: false, link: null };
  }

  const expired = link.expires_at ? new Date(link.expires_at) < new Date() : false;
  const paused = link.is_paused === 1;
  const passwordProtected = !!link.password_hash;

  return { exists: true, expired, paused, passwordProtected, link };
}

/**
 * Erhöht den Klick-Zähler
 */
export function incrementClicks(code: string): void {
  db.prepare(`
    UPDATE short_links SET clicks = clicks + 1 WHERE short_code = ?
  `).run(code);
}

/**
 * Holt alle Links eines Benutzers
 */
export function getUserLinks(userId: number): ShortLink[] {
  return db.prepare(`
    SELECT * FROM short_links
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(userId) as ShortLink[];
}

export function getActiveLinkCount(userId: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM short_links
    WHERE user_id = ? AND is_active = 1
  `).get(userId) as { count: number };
  return row?.count || 0;
}

/**
 * Löscht einen Link (soft delete)
 */
export function deleteLink(id: number, userId: number): boolean {
  const result = db.prepare(`
    UPDATE short_links SET is_active = 0
    WHERE id = ? AND user_id = ?
  `).run(id, userId);

  return result.changes > 0;
}

/**
 * Holt Statistiken für einen Link
 */
export function getLinkStats(id: number, userId: number): ShortLink | null {
  return db.prepare(`
    SELECT * FROM short_links
    WHERE id = ? AND user_id = ?
  `).get(id, userId) as ShortLink | null;
}

/**
 * Aktualisiert einen bestehenden Link
 */
export async function updateShortLink(
  id: number,
  userId: number,
  options: UpdateLinkOptions
): Promise<ShortLink | null> {
  // Prüfen ob Link existiert und dem User gehört
  const existing = db.prepare(`
    SELECT * FROM short_links WHERE id = ? AND user_id = ? AND is_active = 1
  `).get(id, userId) as ShortLink | null;

  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (options.targetUrl !== undefined) {
    if (!isValidUrl(options.targetUrl)) {
      throw new Error('Ungültige URL');
    }
    updates.push('target_url = ?');
    values.push(options.targetUrl);
  }

  if (options.title !== undefined) {
    updates.push('title = ?');
    values.push(options.title);
  }

  if (options.expiresAt !== undefined) {
    updates.push('expires_at = ?');
    values.push(options.expiresAt ? options.expiresAt.toISOString() : null);
  }

  if (options.password !== undefined) {
    if (options.password === null) {
      // Passwort entfernen
      updates.push('password_hash = ?');
      values.push(null);
    } else if (options.password) {
      // Neues Passwort setzen
      const passwordHash = await bcrypt.hash(options.password, 10);
      updates.push('password_hash = ?');
      values.push(passwordHash);
    }
  }

  if (updates.length === 0) {
    return existing;
  }

  values.push(id, userId);

  db.prepare(`
    UPDATE short_links SET ${updates.join(', ')}
    WHERE id = ? AND user_id = ?
  `).run(...values);

  return db.prepare(`
    SELECT * FROM short_links WHERE id = ?
  `).get(id) as ShortLink;
}

/**
 * Pausiert oder reaktiviert einen Link
 */
export function toggleLinkPause(id: number, userId: number): ShortLink | null {
  const link = db.prepare(`
    SELECT * FROM short_links WHERE id = ? AND user_id = ? AND is_active = 1
  `).get(id, userId) as ShortLink | null;

  if (!link) {
    return null;
  }

  const newPausedState = link.is_paused === 1 ? 0 : 1;

  db.prepare(`
    UPDATE short_links SET is_paused = ? WHERE id = ?
  `).run(newPausedState, id);

  return {
    ...link,
    is_paused: newPausedState
  };
}

/**
 * Prüft das Passwort für einen geschützten Link
 */
export async function verifyLinkPassword(code: string, password: string): Promise<boolean> {
  const link = db.prepare(`
    SELECT password_hash FROM short_links WHERE short_code = ? AND is_active = 1
  `).get(code) as { password_hash: string | null } | null;

  if (!link || !link.password_hash) {
    return false;
  }

  return bcrypt.compare(password, link.password_hash);
}

/**
 * Zeichnet einen Klick auf (tagesbasiert für DSGVO-Konformität)
 */
export function recordClick(linkId: number): void {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Versuche den Zähler für heute zu erhöhen
  const result = db.prepare(`
    UPDATE link_clicks SET click_count = click_count + 1
    WHERE link_id = ? AND clicked_at = ?
  `).run(linkId, today);

  // Falls kein Eintrag für heute existiert, erstelle einen neuen
  if (result.changes === 0) {
    db.prepare(`
      INSERT INTO link_clicks (link_id, clicked_at, click_count)
      VALUES (?, ?, 1)
    `).run(linkId, today);
  }

  // Auch den Gesamtzähler erhöhen
  db.prepare(`
    UPDATE short_links SET clicks = clicks + 1 WHERE id = ?
  `).run(linkId);
}

/**
 * Holt Klick-Statistiken für einen Link (letzte X Tage)
 */
export function getClickStats(linkId: number, userId: number, days: number = 30): ClickStat[] {
  // Prüfen ob Link dem User gehört
  const link = db.prepare(`
    SELECT id FROM short_links WHERE id = ? AND user_id = ?
  `).get(linkId, userId);

  if (!link) {
    return [];
  }

  // Hole Klicks der letzten X Tage
  const stats = db.prepare(`
    SELECT clicked_at as date, click_count as clicks
    FROM link_clicks
    WHERE link_id = ? AND clicked_at >= date('now', '-' || ? || ' days')
    ORDER BY clicked_at ASC
  `).all(linkId, days) as ClickStat[];

  return stats;
}

/**
 * Holt einen einzelnen Link mit ID (für Bearbeitung)
 */
export function getLinkById(id: number, userId: number): ShortLink | null {
  return db.prepare(`
    SELECT * FROM short_links
    WHERE id = ? AND user_id = ? AND is_active = 1
  `).get(id, userId) as ShortLink | null;
}
