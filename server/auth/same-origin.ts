import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const ENV_PUBLIC_URL = (process.env.PUBLIC_URL || '').trim();
const ENV_PUBLIC_ORIGIN = ENV_PUBLIC_URL ? safeParseOrigin(ENV_PUBLIC_URL) : null;

function safeParseOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function safeParseHeaderOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return safeParseOrigin(value);
}

function requestOriginFromHeaders(req: Request): string | null {
  const host = req.get('host');
  if (!host) return null;

  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' && forwardedProto.trim().length > 0
    ? forwardedProto.split(',')[0].trim()
    : req.protocol;

  return proto ? `${proto}://${host}` : null;
}

function hostFromHostHeader(hostHeader: string): string {
  return hostHeader.split(':')[0].toLowerCase();
}

function forwardedHostFromHeaders(req: Request): string | null {
  const xfHost = req.headers['x-forwarded-host'];
  if (typeof xfHost === 'string' && xfHost.trim().length > 0) {
    return hostFromHostHeader(xfHost.split(',')[0].trim());
  }
  return null;
}

/**
 * Basic CSRF mitigation for cookie-authenticated browser requests:
 * for state-changing requests, require same-origin via Origin/Referer checks.
 *
 * This is intentionally "same-origin" rather than a CSRF token to avoid
 * invasive client changes across many fetch() call sites.
 */
export function isSameOriginRequest(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return true;

  const origin = safeParseHeaderOrigin(req.headers.origin) || safeParseHeaderOrigin(req.headers.referer);
  if (!origin) {
    // Some requests omit Origin/Referer. Sec-Fetch-Site is a reliable browser-provided
    // signal (cannot be set by frontend JS). Prefer same-origin only.
    const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    return secFetchSite === 'same-origin';
  }

  const reqOrigin = requestOriginFromHeaders(req);
  if (reqOrigin && origin === reqOrigin) return true;

  // If PUBLIC_URL is configured, allow it explicitly (common for reverse-proxy setups).
  if (ENV_PUBLIC_ORIGIN && origin === ENV_PUBLIC_ORIGIN) return true;

  // Robust fallback: allow if hostname matches even when scheme differs.
  // This is important behind reverse proxies when req.protocol may be "http"
  // while the browser Origin is "https".
  try {
    const originUrl = new URL(origin);
    const hostHeader = req.get('host');
    if (hostHeader) {
      const reqHost = hostFromHostHeader(hostHeader);
      const forwardedHost = forwardedHostFromHeaders(req);
      const originHost = originUrl.hostname.toLowerCase();
      if (originHost === reqHost) return true;
      if (forwardedHost && originHost === forwardedHost) return true;
      if (process.env.NODE_ENV !== 'production' && LOCAL_HOSTS.has(originHost) && LOCAL_HOSTS.has(reqHost)) {
        return true;
      }
    }

    if (ENV_PUBLIC_ORIGIN) {
      const envHost = new URL(ENV_PUBLIC_ORIGIN).hostname.toLowerCase();
      if (originUrl.hostname.toLowerCase() === envHost) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (isSameOriginRequest(req)) return next();
  return res.status(403).json({ error: 'CSRF protection: invalid origin' });
}
