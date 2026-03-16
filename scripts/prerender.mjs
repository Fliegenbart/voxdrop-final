import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist", "public");

if (process.env.SKIP_PRERENDER === "1") {
  console.log("[prerender] SKIP_PRERENDER=1, skipping.");
  process.exit(0);
}

if (!fs.existsSync(distDir)) {
  console.error(`[prerender] Missing dist directory: ${distDir}`);
  process.exit(1);
}

const baseHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");

const routes = [
  "/",
  "/video",
  "/preise",
  "/features",
  "/voxdrop-2030",
  "/behoerden",
  "/avatar",
  "/blog",
  "/blog/barrierefreiheit-ist-ux",
  "/blog/bfsg-2025-leitfaden",
  "/blog/fakten-zur-barrierefreiheit",
  "/blog/bfsg-kommunen-leitfaden",
  "/blog/bitv-checkliste",
  "/blog/barrierefreie-formulare",
  "/blog/digitale-teilhabe",
  "/blog/leichte-sprache-ki",
  "/blog/screenreader-test",
  "/blog/text-to-speech",
  "/tools/untertitel",
  "/tools/untertitel/videoschnitt",
  "/tools/voiceover",
  "/tools/pptx-to-pdf-smart",
  "/tools/pptx-podcast",
  "/tools/pptx-summary",
  "/tools/einfache-sprache",
  "/tools/kontrastchecker",
  "/tools/persona-check",
  "/tools/alt-text",
  "/tools/aria-checker",
  "/tools/web-pruefung",
  "/tools/formular-check",
  "/tools/filesharing",
  "/tools/url-shortener",
  "/tools/vpat-checker",
  "/tools/audiodeskription",
  "/tools/confluence",
  "/tools/live-transkription",
  "/datenschutz",
  "/impressum",
  "/avv",
  "/toms",
  "/subunternehmer",
  "/leistungsbeschreibung",
  "/sla",
  "/exit-konzept",
  "/c5-mapping",
  "/barrierefreiheit-erklaerung",
  // Hidden pages (not in navigation, not in sitemap)
  "/pitch",
];

const startServer = async () => {
  const app = express();
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=UTF-8");
    res.end(baseHtml);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    server.on("listening", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
    server.on("error", (err) => reject(err));
  });
};

const mockApiResponse = (url) => {
  if (url.includes("/api/auth/me")) {
    return { user: null, usage: null };
  }
  if (url.includes("/api/billing/plans")) {
    return {
      plans: [
        {
          id: "free",
          name: "Free",
          description: "Zum Ausprobieren und für kleine Aufgaben.",
          monthlyPriceEur: 0,
          includedCreditsPerMonth: 200,
          featureFlags: [
            "Basis-Tools (Checks & Textarbeit)",
            "Best-Effort Warteschlange",
            "Begrenzte Job-Größen (50 MB)",
          ],
          rateLimits: { priority: "standard", maxJobSizeMb: 50 },
        },
        {
          id: "pro",
          name: "Pro",
          description: "Für Einzelpersonen in Behörden oder Freelance-Projekten.",
          monthlyPriceEur: 99,
          includedCreditsPerMonth: 3000,
          featureFlags: [
            "Alle Kernfeatures",
            "PDF/UA, Podcasts, Untertitel",
            "Priorisierte Verarbeitung",
            "Dateien bis 500 MB",
          ],
          rateLimits: { priority: "priority", maxJobSizeMb: 500 },
        },
        {
          id: "premium",
          name: "Premium",
          description: "Volle Power für Teams und Vielnutzer.",
          monthlyPriceEur: 199,
          includedCreditsPerMonth: 15000,
          featureFlags: [
            "Alles aus Pro",
            "Insights-Dashboard",
            "Erweiterte Historie & Exporte",
            "Dateien bis 2 GB",
            "Priority-Support",
          ],
          rateLimits: { priority: "priority", maxJobSizeMb: 2000 },
        },
      ],
      creditPacks: [
        { id: "pack_5k", credits: 5000, priceEur: 99 },
        { id: "pack_25k", credits: 25000, priceEur: 399 },
        { id: "pack_150k", credits: 150000, priceEur: 1499 },
      ],
      creditCosts: [
        { key: "DOC_CHECK_PAGE", label: "Dokument-Check", unit: "Seite", credits: 1 },
        { key: "PDFUA_EXPORT_PAGE", label: "PDF/UA-Export", unit: "Seite", credits: 2 },
        { key: "PPT_SLIDE_ANALYZE", label: "PPT-Analyse", unit: "Slide", credits: 2 },
        { key: "ASR_MINUTE", label: "Transkription/Untertitel", unit: "Minute", credits: 10 },
        { key: "TTS_MINUTE", label: "Podcast/TTS", unit: "Minute", credits: 6 },
      ],
      rolloverPercent: 0,
    };
  }
  if (url.includes("/api/queue/position")) {
    return { position: null, estimatedWaitMinutes: 0, totalInQueue: 0 };
  }
  if (url.includes("/health")) {
    return { status: "healthy" };
  }
  return {};
};

let server;
let port;
try {
  ({ server, port } = await startServer());
} catch (err) {
  // In sandboxed environments binding a local port can be forbidden (EPERM/EACCES).
  // For local/CI builds we still want the build artifacts to succeed; prerendering is an optimization.
  const code = err?.code || "";
  if (code === "EPERM" || code === "EACCES") {
    console.warn(`[prerender] Cannot start local server (${code}). Skipping prerender.`);
    process.exit(0);
  }
  throw err;
}
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  for (const route of routes) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/")) {
        const body = JSON.stringify(mockApiResponse(url));
        request.respond({
          status: 200,
          contentType: "application/json",
          body,
        });
        return;
      }
      request.continue();
    });

    const target = `${baseUrl}${route}`;
    console.log(`[prerender] ${target}`);

    await page.goto(target, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector("body", { timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const html = await page.content();
    const outDir = route === "/" ? distDir : path.join(distDir, route);
    const outPath = route === "/" ? path.join(distDir, "index.html") : path.join(outDir, "index.html");

    await fsp.mkdir(outDir, { recursive: true });
    await fsp.writeFile(outPath, html, "utf-8");

    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log("[prerender] Done.");
