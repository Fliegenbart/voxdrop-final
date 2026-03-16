import crypto from "crypto";
import type { Request } from "express";

type TokenPayload = {
  sid: string;
  fid: string;
  exp: number;
};

export type StreamSessionResolution = {
  sessionId: string | null;
  source: "token" | "header" | "legacy_query" | "missing";
  error?: "invalid_stream_token" | "expired_stream_token" | "file_mismatch";
};

const STREAM_TOKEN_SECRET = String(
  process.env.SESSION_STREAM_TOKEN_SECRET || process.env.INTERNAL_SERVICE_TOKEN || "",
).trim();

const STREAM_TOKEN_TTL_SECONDS = (() => {
  const parsed = Number(process.env.SESSION_STREAM_TOKEN_TTL_SECONDS || 900);
  if (!Number.isFinite(parsed)) return 900;
  return Math.max(60, Math.min(86400, Math.floor(parsed)));
})();

export const STREAM_LEGACY_QUERY_SUNSET = String(
  process.env.SESSION_QUERY_SUNSET || "Wed, 30 Sep 2026 23:59:59 GMT",
).trim();

const toBase64Url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const fromBase64Url = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const signPayload = (payload: string): string => {
  return crypto.createHmac("sha256", STREAM_TOKEN_SECRET).update(payload).digest("base64url");
};

const parseToken = (token: string): TokenPayload | null => {
  const [encodedPayload, encodedSig] = String(token || "").split(".");
  if (!encodedPayload || !encodedSig) return null;
  if (!STREAM_TOKEN_SECRET) return null;

  const expectedSig = signPayload(encodedPayload);
  const expectedBuf = Buffer.from(expectedSig);
  const providedBuf = Buffer.from(encodedSig);
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return null;
  }

  try {
    const payloadRaw = fromBase64Url(encodedPayload);
    const parsed = JSON.parse(payloadRaw) as TokenPayload;
    if (!parsed?.sid || !parsed?.fid || !Number.isFinite(parsed?.exp)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const createStreamToken = (sessionId: string, fileId: string, ttlSeconds: number = STREAM_TOKEN_TTL_SECONDS): string | null => {
  if (!STREAM_TOKEN_SECRET) return null;
  if (!sessionId || !fileId) return null;
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
  const payload = toBase64Url(JSON.stringify({ sid: sessionId, fid: fileId, exp }));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
};

export const resolveSessionIdForStreamRequest = (req: Request, fileId: string): StreamSessionResolution => {
  const token = typeof req.query.st === "string" ? req.query.st : "";
  if (token) {
    const payload = parseToken(token);
    if (!payload) {
      return { sessionId: null, source: "token", error: "invalid_stream_token" };
    }
    if (payload.fid !== fileId) {
      return { sessionId: null, source: "token", error: "file_mismatch" };
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { sessionId: null, source: "token", error: "expired_stream_token" };
    }
    return { sessionId: payload.sid, source: "token" };
  }

  const headerSession = req.headers["x-session-id"];
  const sessionFromHeader = typeof headerSession === "string" ? headerSession : "";
  if (sessionFromHeader) {
    return { sessionId: sessionFromHeader, source: "header" };
  }

  const legacySession = typeof req.query.session === "string" ? req.query.session : "";
  if (legacySession) {
    return { sessionId: legacySession, source: "legacy_query" };
  }

  return { sessionId: null, source: "missing" };
};

