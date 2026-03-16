import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { getPublicOrigin } from "./utils/public-url";
import { bootstrapAdminsFromEnv } from './bootstrap/admins';
import { buildContentSecurityPolicy, isUnsafeEvalEnabled } from "./security/csp";
import { redactForLog } from "./security/redaction";

const app = express();
const GLOBAL_JSON_BODY_LIMIT = String(process.env.JSON_BODY_LIMIT || "10mb");
const GLOBAL_URLENCODED_BODY_LIMIT = String(process.env.URLENCODED_BODY_LIMIT || "10mb");
let unsafeEvalWarningLogged = false;

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: GLOBAL_JSON_BODY_LIMIT,
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: GLOBAL_URLENCODED_BODY_LIMIT }));
app.use(cookieParser());

// DSGVO & Security Headers
app.use((_req, res, next) => {
  const isOpenReelLabPath =
    _req.path === '/openreel-lab' || _req.path.startsWith('/openreel-lab/');
  const isOpenReelToolPath =
    _req.path === '/tools/openreel-lab' || _req.path.startsWith('/tools/openreel-lab/');
  const allowOpenReelCapture = isOpenReelLabPath || isOpenReelToolPath;

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', isOpenReelLabPath ? 'SAMEORIGIN' : 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Referrer Policy - don't leak URLs
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (permissive connect-src for corporate proxies)
  const host = getPublicOrigin();
  const isProd = process.env.NODE_ENV === 'production';
  const extraConnectSrc = (process.env.CSP_CONNECT_SRC_EXTRA || '').trim();
  const allowUnsafeEval = isUnsafeEvalEnabled(isProd);
  if (isProd && allowUnsafeEval && !unsafeEvalWarningLogged) {
    unsafeEvalWarningLogged = true;
    console.warn("[Security] CSP_ALLOW_UNSAFE_EVAL is enabled in production.");
  }
  const csp = buildContentSecurityPolicy({
    isProd,
    publicOrigin: host,
    extraConnectSrc,
    allowUnsafeEval,
  });

  let effectiveCsp = csp;
  if (isOpenReelLabPath) {
    // OpenReel requires dedicated worker support and external font hosts.
    effectiveCsp = effectiveCsp
      .replace(
        "frame-ancestors 'none'",
        "frame-ancestors 'self'",
      )
      .replace(
        "style-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      )
      .replace(
        "font-src 'self' data:",
        "font-src 'self' data: https://fonts.gstatic.com",
      );
    if (!/connect-src[^;]*\sdata:/.test(effectiveCsp)) {
      effectiveCsp = effectiveCsp.replace(
        /connect-src([^;]*);/,
        "connect-src$1 data:;",
      );
    }
    if (!effectiveCsp.includes("worker-src")) {
      effectiveCsp = `${effectiveCsp} worker-src 'self' blob:;`;
    }
    // Enable cross-origin isolation for full OpenReel capability (e.g. MT workers).
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }

  res.setHeader('Content-Security-Policy', effectiveCsp);
  // Permissions policy is strict by default and relaxed only for OpenReel routes.
  if (allowOpenReelCapture) {
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), camera=(self), payment=(), usb=(), microphone=(self), display-capture=(self), clipboard-read=(self), clipboard-write=(self)',
    );
  } else {
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), camera=(), payment=(), usb=(), microphone=(), display-capture=(), clipboard-read=(), clipboard-write=()',
    );
  }
  next();
});

// Disable Express fingerprinting
app.disable('x-powered-by');

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // DSGVO: Don't log response content for privacy-sensitive endpoints
      const sensitiveEndpoints = ["/api/transcribe", "/api/embed-subtitles", "/api/auth"];
      const isSensitive = sensitiveEndpoints.some(ep => path.startsWith(ep));

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !isSensitive) {
        const redacted = redactForLog(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(redacted)}`;
      }

      if (logLine.length > 500) {
        logLine = logLine.slice(0, 499) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // On-prem convenience: promote specific existing users to admin via env.
  bootstrapAdminsFromEnv();

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error("[Server] Unhandled error:", err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // Dynamic import to avoid loading vite in production
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3501', 10);
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    log(`serving on http://${host}:${port}`);
  });
})();
