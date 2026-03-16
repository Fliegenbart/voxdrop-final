import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfigExport from "../vite.config";
import { nanoid } from "nanoid";
import { applySeoMeta, isKnownRoute, normalizePath, shouldNoIndex } from "./seo";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // `vite.config.ts` uses `defineConfig((env) => ({ ... }))`, so the default export
  // is a function. Spreading a function into the Vite options results in `{}` and
  // Vite falls back to `process.cwd()` as root, which breaks `/src/main.tsx` in dev.
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const viteConfig =
    typeof viteConfigExport === "function"
      ? await viteConfigExport({ command: "serve", mode })
      : viteConfigExport;

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...(viteConfig as any),
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Wrap Vite middleware to skip API routes
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      return next();
    }
    vite.middlewares(req, res, next);
  });

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes - let Express handle them
    if (url.startsWith('/api')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      const normalized = normalizePath(req.originalUrl);
      const knownRoute = isKnownRoute(normalized);

      if (shouldNoIndex(normalized) || !knownRoute) {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
      }

      const html = applySeoMeta(page, normalized);
      res.status(knownRoute ? 200 : 404).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    const normalized = normalizePath(req.originalUrl);
    const knownRoute = isKnownRoute(normalized);

    if (shouldNoIndex(normalized) || !knownRoute) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    const html = applySeoMeta(indexHtml, normalized);
    res.status(knownRoute ? 200 : 404).set({ "Content-Type": "text/html" }).end(html);
  });
}
