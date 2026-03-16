import express from "express";
import crypto from "crypto";
import net from "net";
import dns from "dns/promises";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import db from "../db/init";
import { hashIP } from "../db/queries";
import { Readable } from "stream";

const HARD_DISABLE_EXTERNAL_NETWORK = process.env.HARD_DISABLE_EXTERNAL_NETWORK === "true";
// Worker URL can be a separate scan service/container (recommended for Puppeteer/veraPDF limits).
const BFSG_SCAN_WORKER_URL =
  process.env.BFSG_SCAN_WORKER_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://voxdrop-bfsg-scan-worker:3001"
    : "http://bfsg-scan-worker:3001");
const BFSG_SCAN_ENABLED = process.env.BFSG_SCAN_ENABLED !== "false";
const BFSG_SCAN_CALLBACK_KEY = process.env.BFSG_SCAN_CALLBACK_KEY || "";

const MAX_SCANS_PER_IP_PER_HOUR = Number(process.env.BFSG_RATE_LIMIT_IP_PER_HOUR || 5);
const MAX_SCANS_PER_EMAIL_PER_DAY = Number(process.env.BFSG_RATE_LIMIT_EMAIL_PER_DAY || 3);
const MAX_SCANS_PER_MINUTE_GLOBAL = Number(process.env.BFSG_RATE_LIMIT_GLOBAL_PER_MIN || 20);
const CACHE_TTL_HOURS = Number(process.env.BFSG_SCAN_CACHE_TTL_HOURS || 24);
const INFLIGHT_SCAN_TTL_MINUTES = Number(process.env.BFSG_INFLIGHT_SCAN_TTL_MINUTES || 120);
const DNS_LOOKUP_TIMEOUT_MS = 2500;
const MAX_URL_LENGTH = 2048;
const URL_ERROR_MESSAGE = "URL ist ungültig oder nicht erlaubt";
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localhost.local"];

const BFSG_RATE_LIMIT_IP_PER_HOUR = Number.isFinite(MAX_SCANS_PER_IP_PER_HOUR)
  ? Math.max(1, Math.floor(MAX_SCANS_PER_IP_PER_HOUR))
  : 5;
const BFSG_RATE_LIMIT_EMAIL_PER_DAY = Number.isFinite(MAX_SCANS_PER_EMAIL_PER_DAY)
  ? Math.max(1, Math.floor(MAX_SCANS_PER_EMAIL_PER_DAY))
  : 3;
const BFSG_RATE_LIMIT_GLOBAL_PER_MIN = Number.isFinite(MAX_SCANS_PER_MINUTE_GLOBAL)
  ? Math.max(1, Math.floor(MAX_SCANS_PER_MINUTE_GLOBAL))
  : 20;

let globalScanWindowMinute = Math.floor(Date.now() / 60_000);
let globalScanCountThisMinute = 0;

const scopeResultSchema = z.object({
  status: z.enum(["betroffen", "wahrscheinlich-nicht", "kleinstunternehmen", "öffentlich"]),
  relevantParagraphs: z.array(z.string().max(200)).default([]),
  riskLevel: z.enum(["niedrig", "mittel", "hoch"]),
  selectedServices: z.array(z.string().max(80)).default([]),
  explanation: z.string().max(2000),
});

const scanRequestSchema = z.object({
  url: z.string().url(),
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  newsletter: z.boolean().optional(),
  scopeResult: scopeResultSchema.optional(),
});

const leadRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  newsletter: z.boolean().optional(),
  consent: z.boolean(),
  scopeResult: scopeResultSchema.optional(),
});

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return true;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const octet = Number(ip.split(".")[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // Unique local IPv6
  if (ip.startsWith("fe80")) return true; // Link-local IPv6
  return false;
}

function nowMinuteKey(now = Date.now()) {
  return Math.floor(now / 60_000);
}

function parseResultJson(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 220);
  if (typeof error === "string") return error.slice(0, 220);
  return fallback;
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))
  );
}

function normalizeScanUrl(raw: string) {
  if (!raw) throw new Error("URL fehlt.");
  if (raw.length > MAX_URL_LENGTH) throw new Error(URL_ERROR_MESSAGE);

  const normalized = new URL(raw);
  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
    throw new Error("Invalid protocol");
  }
  if (normalized.username || normalized.password) {
    throw new Error("Credentials not allowed");
  }
  normalized.hash = "";

  if ((normalized.protocol === "http:" && normalized.port === "80") || (normalized.protocol === "https:" && normalized.port === "443")) {
    normalized.port = "";
  }

  if (normalized.pathname.length > 1 && normalized.pathname.endsWith("/")) {
    normalized.pathname = normalized.pathname.replace(/\/+$/, "");
  }

  return normalized.toString();
}

type BfsgScanRow = {
  id: string;
  status: string;
  score: number | null;
  created_at: string | null;
  expires_at: string | null;
  result_json: string | null;
  error_message: string | null;
};

function markScanAsFailed(scanId: string, error: string) {
  db.prepare(
    `UPDATE bfsg_scans
     SET status = 'failed', score = NULL, result_json = NULL, error_message = ?, completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    error,
    scanId
  );
}

function markScanAsCompleted(scanId: string, score: number | null, result: unknown | null) {
  db.prepare(
    `UPDATE bfsg_scans
     SET status = 'completed', score = ?, result_json = ?, error_message = NULL, completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(score, result ? JSON.stringify(result) : null, scanId);
}

function findScanById(id: string): BfsgScanRow | undefined {
  return db
    .prepare(
      `SELECT id, status, score, created_at, expires_at, result_json, error_message
       FROM bfsg_scans
       WHERE id = ?
       LIMIT 1`
    )
    .get(id) as BfsgScanRow | undefined;
}

function isInflightScanFresh(createdAtRaw: string | null | undefined): boolean {
  if (!createdAtRaw) return false;
  const createdAt = Date.parse(createdAtRaw);
  if (!Number.isFinite(createdAt)) return false;
  const ttlMs = Math.max(1, INFLIGHT_SCAN_TTL_MINUTES) * 60_000;
  return Date.now() - createdAt < ttlMs;
}

function isScanResultFresh(createdAtRaw: string | null | undefined, expiresAtRaw?: string | null): boolean {
  if (expiresAtRaw) {
    const expiresAt = Date.parse(expiresAtRaw);
    if (Number.isFinite(expiresAt)) {
      return Date.now() < expiresAt;
    }
  }

  if (!createdAtRaw) return false;
  const createdAt = Date.parse(createdAtRaw);
  if (!Number.isFinite(createdAt)) return false;
  const ttlMs = Math.max(1, CACHE_TTL_HOURS) * 60 * 60 * 1000;
  return Date.now() - createdAt < ttlMs;
}

function findLatestScanForUrl(url: string) {
  return db
    .prepare(
      `SELECT id, status, score, created_at, expires_at, result_json, error_message
       FROM bfsg_scans
       WHERE url = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(url) as BfsgScanRow | undefined;
}

function hasGlobalScanCapacity(): boolean {
  const currentMinute = nowMinuteKey();
  if (currentMinute !== globalScanWindowMinute) {
    globalScanWindowMinute = currentMinute;
    globalScanCountThisMinute = 0;
  }

  if (globalScanCountThisMinute >= BFSG_RATE_LIMIT_GLOBAL_PER_MIN) {
    return false;
  }

  globalScanCountThisMinute += 1;
  return true;
}

async function validateExternalUrlOrThrow(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Invalid protocol");
  }
  if (u.username || u.password) {
    throw new Error("Credentials not allowed");
  }
  if (isBlockedHost(u.hostname) || u.hostname.length > 253) {
    throw new Error("URL not allowed");
  }

  const lookupResults = await Promise.race([
    dns.lookup(u.hostname, { all: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timeout")), DNS_LOOKUP_TIMEOUT_MS)
    ),
  ]);
  if (!Array.isArray(lookupResults) || lookupResults.length === 0) {
    throw new Error("URL not resolvable");
  }

  if (lookupResults.some((r) => isPrivateIp((r as { address: string }).address))) {
    throw new Error("URL not allowed");
  }
}

function resolveScanUrl(rawUrl: string) {
  const url = normalizeScanUrl(rawUrl.trim());
  const parsed = new URL(url);
  if (!isBlockedHost(parsed.hostname)) return url;
  throw new Error(URL_ERROR_MESSAGE);
}

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function hoursFromNow(hours: number): string {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

function getClientIp(req: express.Request): string {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  const ip = raw ? String(raw).split(",")[0].trim() : "";
  return ip || req.ip || "unknown";
}

const ipLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: BFSG_RATE_LIMIT_IP_PER_HOUR,
  keyGenerator: (req) => getClientIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
});

const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => getClientIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
});

const router = express.Router();
router.use(express.json({ limit: "256kb" }));

router.post("/lead", leadLimiter, async (req, res) => {
  const parsed = leadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
  }

  if (parsed.data.consent !== true) {
    return res.status(400).json({ error: "Einwilligung erforderlich" });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name?.trim() || null;
  const company = parsed.data.company?.trim() || null;
  const newsletter = parsed.data.newsletter ? 1 : 0;
  const scopeJson = parsed.data.scopeResult ? JSON.stringify(parsed.data.scopeResult) : null;

  const ipHash = hashIP(getClientIp(req));
  const userAgent = (req.headers["user-agent"] as string | undefined) || null;

  db.prepare(
    `INSERT INTO bfsg_leads (email, name, company, newsletter, url, scan_id, scope_result_json, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`
  ).run(email, name, company, newsletter, scopeJson, ipHash, userAgent);

  // Placeholder CRM integration hook.
  // eslint-disable-next-line no-console
  console.log("[BFSG] lead captured", { email, hasName: !!name, hasCompany: !!company, newsletter: !!newsletter });

  return res.json({ ok: true });
});

router.post("/scan", ipLimiter, async (req, res) => {
  if (!BFSG_SCAN_ENABLED || HARD_DISABLE_EXTERNAL_NETWORK) {
    return res.status(404).json({ error: "Not found" });
  }

  const parsed = scanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
  }

  let normalizedUrl: string;
  try {
    const resolved = resolveScanUrl(parsed.data.url);
    const url = new URL(resolved);
    await validateExternalUrlOrThrow(url);
    normalizedUrl = resolved;
  } catch (error) {
    return res.status(400).json({ error: sanitizeErrorMessage(error, URL_ERROR_MESSAGE) });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name?.trim() || null;
  const company = parsed.data.company?.trim() || null;
  const newsletter = parsed.data.newsletter ? 1 : 0;
  const scopeJson = parsed.data.scopeResult ? JSON.stringify(parsed.data.scopeResult) : null;

  // Per-email limit (per day)
  const emailCount = db
    .prepare(
      `SELECT COUNT(1) as c
       FROM bfsg_leads
       WHERE email = ?
       AND created_at >= ?`
    )
    .get(email, startOfTodayUtc()) as { c: number };

  if ((emailCount?.c || 0) >= BFSG_RATE_LIMIT_EMAIL_PER_DAY) {
    return res.status(429).json({ error: "Limit erreicht", message: "Limit pro E-Mail erreicht. Bitte morgen erneut versuchen." });
  }

  const urlStr = normalizedUrl!;
  const nowIso = new Date().toISOString();
  const expiresAt = hoursFromNow(CACHE_TTL_HOURS);

  const latest = findLatestScanForUrl(urlStr);
  let scanId = latest?.id || crypto.randomUUID();
  let shouldStartNewScan = true;
  let latestStatus = latest?.status || null;
  let cachedResultPayload: unknown | undefined;

  if (latest?.status === "completed") {
    if (latest.result_json) {
      if (isScanResultFresh(latest.created_at, latest.expires_at)) {
        const cachedResult = parseResultJson(latest.result_json);
        if (cachedResult) {
          return res.json({ scanId: latest.id, cached: true, status: "completed", result: cachedResult });
        }

        markScanAsFailed(latest.id, "Scan-Ergebnis ist ungültig.");
        latestStatus = "failed";
      } else {
        markScanAsFailed(latest.id, "Scan-Ergebnis ist veraltet.");
        latestStatus = "failed";
      }
    } else {
      markScanAsFailed(latest.id, "Scan-Ergebnis fehlt.");
      latestStatus = "failed";
    }
  }

  if (latest?.status === "pending" || latest?.status === "running") {
    if (latest.created_at && isInflightScanFresh(latest.created_at)) {
      shouldStartNewScan = false;
      latestStatus = latest.status;
      cachedResultPayload = null;
      scanId = latest.id;
    } else {
      markScanAsFailed(latest.id, "Scan-Laufzeit überschritten. Bitte neu starten.");
      latestStatus = "failed";
    }
  }

  if (!shouldStartNewScan && latest) {
    return res.json({ scanId, cached: true, status: latestStatus || "running", result: cachedResultPayload || null });
  }

  if (!hasGlobalScanCapacity()) {
    return res.status(429).json({
      error: "Limit erreicht",
      message: "Maximale Anzahl von Scans pro Minute erreicht. Bitte in Kürze erneut versuchen.",
    });
  }

  if (shouldStartNewScan && (!latestStatus || (latestStatus !== "pending" && latestStatus !== "running"))) {
    scanId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO bfsg_scans (id, url, status, created_at, expires_at)
       VALUES (?, ?, 'pending', ?, ?)`
    ).run(scanId, urlStr, nowIso, expiresAt);
  } else {
    scanId = latest?.id || scanId;
  }

  // Lead record (always)
  const ipHash = hashIP(getClientIp(req));
  const userAgent = (req.headers["user-agent"] as string | undefined) || null;
  db.prepare(
    `INSERT INTO bfsg_leads (email, name, company, newsletter, url, scan_id, scope_result_json, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(email, name, company, newsletter, urlStr, scanId, scopeJson, ipHash, userAgent);

  // Kick scan if not cached
  if (shouldStartNewScan) {
    try {
      const upstream = await fetch(`${BFSG_SCAN_WORKER_URL}/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId, url: urlStr }),
        signal: AbortSignal.timeout(5000),
      });
      if (!upstream.ok) {
        const upstreamText = await upstream.text().catch(() => "");
        const message = upstreamText || `Scan-Worker antwortet mit Status ${upstream.status}`;
        markScanAsFailed(scanId, message);
        return res.status(502).json({ error: "Scan konnte nicht gestartet werden.", message });
      }
      db.prepare(`UPDATE bfsg_scans SET status = 'running' WHERE id = ?`).run(scanId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan-Worker nicht erreichbar";
      markScanAsFailed(scanId, message);
      return res.status(503).json({ error: "Scan konnte nicht gestartet werden.", message });
    }
  }

  return res.json({ scanId, cached: !shouldStartNewScan, status: shouldStartNewScan ? "running" : latest?.status || "pending" });
});

router.get("/scan/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "scanId fehlt" });

  const row = findScanById(id);

  if (!row) return res.status(404).json({ error: "Nicht gefunden" });

  // If we already have a completed result cached, return it.
  if (row.status === "completed" && row.result_json) {
    const isFresh = isScanResultFresh(row.created_at, row.expires_at);
    if (!isFresh) {
      markScanAsFailed(id, "Scan-Ergebnis ist veraltet.");
      return res.status(410).json({
        scanId: row.id,
        status: "failed",
        result: null,
        error: "Scan-Ergebnis ist veraltet. Bitte erneut starten.",
      });
    }

    const cachedResult = parseResultJson(row.result_json);
    if (!cachedResult) {
      markScanAsFailed(id, "Scan-Ergebnis ist ungültig.");
      return res.status(500).json({
        scanId: row.id,
        status: "failed",
        result: null,
        error: "Scan-Ergebnis ist ungültig.",
      });
    }

    return res.json({ scanId: row.id, status: row.status, result: cachedResult, error: row.error_message || null });
  }

  // If an in-flight scan is stuck, fail it and return clear status.
  if ((row.status === "pending" || row.status === "running") && !isInflightScanFresh(row.created_at)) {
    markScanAsFailed(id, "Scan-Laufzeit überschritten. Bitte neu starten.");
    return res.status(408).json({
      scanId: row.id,
      status: "failed",
      result: null,
      error: "Scan-Laufzeit überschritten. Bitte neu starten.",
    });
  }

  // Otherwise, ask the scan worker for the latest state and mirror it into our DB.
  if (!BFSG_SCAN_ENABLED || HARD_DISABLE_EXTERNAL_NETWORK) {
    const result = parseResultJson(row.result_json);
    return res.json({ scanId: row.id, status: row.status, result, error: row.error_message || null });
  }

  try {
    const upstream = await fetch(`${BFSG_SCAN_WORKER_URL}/scan/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      const result = parseResultJson(row.result_json);
      return res.json({ scanId: row.id, status: row.status, result, error: row.error_message || null });
    }

    const data = (await upstream.json()) as any;
    const workerStatus = String(data?.status || "running");
    const mappedStatus =
      workerStatus === "completed"
        ? "completed"
        : workerStatus === "failed"
        ? "failed"
        : workerStatus === "pending"
        ? "pending"
        : "running";

    const result = data?.result ?? null;
    const score = Number.isFinite(result?.score) ? Number(result.score) : null;
    const errorMessage = mappedStatus === "failed" ? String(data?.error || data?.message || "Scan failed") : null;

    if (mappedStatus === "completed" && result) {
      db.prepare(
        `UPDATE bfsg_scans
         SET status = 'completed', score = ?, result_json = ?, error_message = NULL, completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(score, JSON.stringify(result), id);
    } else if (mappedStatus === "failed") {
      markScanAsFailed(id, errorMessage || "Scan fehlgeschlagen.");
    } else {
      db.prepare(`UPDATE bfsg_scans SET status = ? WHERE id = ?`).run(mappedStatus, id);
    }

    return res.json({ scanId: id, status: mappedStatus, result, error: errorMessage });
  } catch {
    const result = parseResultJson(row.result_json);
    return res.json({ scanId: row.id, status: row.status, result, error: row.error_message || null });
  }
});

router.get("/scan/:id/stream", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).end();

  if (!BFSG_SCAN_ENABLED || HARD_DISABLE_EXTERNAL_NETWORK) {
    return res.status(404).json({ error: "Scan nicht verfügbar." });
  }

  const row = findScanById(id);
  if (!row) {
    res.status(404);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: scan-error\ndata: ${JSON.stringify({ message: "Scan nicht gefunden" })}\n\n`);
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Scan nicht gefunden" })}\n\n`);
    res.end();
    return;
  }

  // Serve terminal states from persisted row immediately.
  if (row.status === "completed" && row.result_json) {
    if (!isScanResultFresh(row.created_at, row.expires_at)) {
      markScanAsFailed(id, "Scan-Ergebnis ist veraltet.");
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.write(`event: scan-error\ndata: ${JSON.stringify({ message: "Scan-Ergebnis ist veraltet. Bitte erneut starten." })}\n\n`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Scan-Ergebnis ist veraltet. Bitte erneut starten." })}\n\n`);
      res.end();
      return;
    }

    const result = parseResultJson(row.result_json);
    if (!result) {
      markScanAsFailed(id, "Scan-Ergebnis ist ungültig.");
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.write(`event: scan-error\ndata: ${JSON.stringify({ message: "Scan-Ergebnis ist ungültig." })}\n\n`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Scan-Ergebnis ist ungültig." })}\n\n`);
      res.end();
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: complete\ndata: ${JSON.stringify({ result })}\n\n`);
    res.end();
    return;
  }

  if (row.status === "failed") {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: scan-error\ndata: ${JSON.stringify({ message: row.error_message || "Scan fehlgeschlagen." })}\n\n`);
    res.write(`event: error\ndata: ${JSON.stringify({ message: row.error_message || "Scan fehlgeschlagen." })}\n\n`);
    res.end();
    return;
  }

  if ((row.status === "pending" || row.status === "running") && !isInflightScanFresh(row.created_at)) {
    markScanAsFailed(id, "Scan-Laufzeit überschritten. Bitte neu starten.");
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: scan-error\ndata: ${JSON.stringify({ message: "Scan-Laufzeit überschritten. Bitte neu starten." })}\n\n`);
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Scan-Laufzeit überschritten. Bitte neu starten." })}\n\n`);
    res.end();
    return;
  }

  // Proxy SSE from worker
  try {
    const upstream = await fetch(`${BFSG_SCAN_WORKER_URL}/scan/${encodeURIComponent(id)}/stream`, {
      headers: { accept: "text/event-stream" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok || !upstream.body) {
      res.status(502);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`event: scan-error\ndata: ${JSON.stringify({ message: "Scan-Worker nicht erreichbar" })}\n\n`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Scan-Worker nicht erreichbar" })}\n\n`);
      res.end();
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.on("data", (chunk) => res.write(chunk));
    nodeStream.on("end", () => res.end());
    nodeStream.on("error", () => res.end());
    req.on("close", () => {
      try {
        nodeStream.destroy();
      } catch {
        // ignore
      }
    });
  } catch {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: scan-error\ndata: ${JSON.stringify({ message: "Scan-Worker nicht erreichbar" })}\n\n`);
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Scan-Worker nicht erreichbar" })}\n\n`);
    res.end();
  }
});

// Internal callback used by bfsg-scan-worker to persist results in the main DB.
router.post("/scan/:id/result", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "scanId fehlt" });

  if (!BFSG_SCAN_CALLBACK_KEY) {
    return res.status(403).json({ error: "Callback disabled" });
  }
  const key = String(req.headers["x-bfsg-scan-key"] || "");
  if (key !== BFSG_SCAN_CALLBACK_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const bodySchema = z.object({
    status: z.enum(["completed", "failed"]),
    score: z.number().int().optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  if (parsed.data.status === "failed") {
    markScanAsFailed(id, parsed.data.error || "Scan failed");
    return res.json({ ok: true });
  }

  const score =
    typeof parsed.data.score === "number" && Number.isFinite(parsed.data.score) ? parsed.data.score : null;
  markScanAsCompleted(id, score, parsed.data.result);

  return res.json({ ok: true });
});

export default router;
