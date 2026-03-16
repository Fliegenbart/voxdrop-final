import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { applySeoMeta, isKnownRoute, normalizePath, shouldNoIndex } from "./seo";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Cache policy:
  // - HTML must not be cached (prevents stale HTML referencing deleted hashed assets after deploy).
  // - Hashed assets can be cached aggressively.
  // - Everything else can be cached but revalidated.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }

        // Vite build assets are hashed => safe to cache long-term.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=0");
      },
    }),
  );

  const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

  // Canonicalize legacy tool URLs.
  app.get("/tools/pdfua-check", (_req, res) => {
    res.redirect(301, "/tools/formular-check");
  });

  // Canonicalize legacy/de-DE routes used by older marketing links.
  app.get("/anmelden", (_req, res) => {
    res.redirect(301, "/login");
  });
  app.get("/registrieren", (_req, res) => {
    res.redirect(301, "/register");
  });
  app.get("/einstellungen", (_req, res) => {
    res.redirect(301, "/settings");
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    const normalized = normalizePath(req.originalUrl);
    const knownRoute = isKnownRoute(normalized);

    if (shouldNoIndex(normalized) || !knownRoute) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    if (!knownRoute) {
      res.status(404);
    }

    const html = applySeoMeta(indexHtml, normalized);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=UTF-8");
    res.end(html);
  });
}
