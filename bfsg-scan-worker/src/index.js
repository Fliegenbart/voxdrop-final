import express from "express";
import axe from "axe-core";
import crypto from "crypto";
import dns from "dns/promises";
import { spawn, spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import pLimit from "p-limit";
import puppeteer from "puppeteer";

const PORT = Number(process.env.PORT || 3001);
const HARD_DISABLE_EXTERNAL_NETWORK = process.env.HARD_DISABLE_EXTERNAL_NETWORK === "true";
const MAX_CONCURRENT_SCANS = Number(process.env.MAX_CONCURRENT_SCANS || 2);
const SCAN_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 120_000);
const MAX_PDFS_PER_SCAN = Number(process.env.MAX_PDFS_PER_SCAN || 10);
const MAX_PDF_SIZE_MB = Number(process.env.MAX_PDF_SIZE_MB || 50);
const PDF_CONCURRENCY = Number(process.env.PDF_CONCURRENCY || 3);
const MAX_URL_LENGTH = Number(process.env.MAX_URL_LENGTH || 2048);
const MAX_DOM_BYTES = Math.max(1, Number(process.env.MAX_DOM_BYTES || 10_000_000));
const JOB_TTL_MS = Math.max(60_000, Number(process.env.JOB_TTL_MS || 24 * 60 * 60 * 1000));
const VERAPDF_VERSION_ARGS = ["--version"];
const DNS_LOOKUP_TIMEOUT_MS = 2500;
const PDF_DOWNLOAD_TIMEOUT_MS = 15_000;
const PDF_CHECK_TIMEOUT_MS = 30_000;
const URL_SCAN_TIMEOUT_MS = 30_000;
const URL_ERROR_MESSAGE = "URL ist ungültig oder nicht erlaubt";
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localhost.local"];
const DEFAULT_USER_AGENT = "voxdrop-bfsg-scan/1.0 (+https://voxdrop.live/bot)";

const WEB_CALLBACK_BASE_URL = process.env.BFSG_WEB_CALLBACK_BASE_URL || "http://web:5000";
const CALLBACK_KEY = process.env.BFSG_SCAN_CALLBACK_KEY || "";

const app = express();
app.use(express.json({ limit: "256kb" }));

const axeSource = axe?.source;

const jobs = new Map();
const globalLimit = pLimit(Math.max(1, Math.floor(MAX_CONCURRENT_SCANS)));
let isVeraPdfAvailableCache = null;
const JOB_CLEANUP_INTERVAL_MS = 60_000;

function cleanupJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (job?.updatedAt && Date.parse(job.updatedAt) < cutoff && (job.status === "completed" || job.status === "failed")) {
      jobs.delete(id);
    }
  }
}

setInterval(cleanupJobs, JOB_CLEANUP_INTERVAL_MS).unref();

function isVeraPdfAvailable() {
  if (isVeraPdfAvailableCache !== null) return isVeraPdfAvailableCache;
  try {
    const probe = spawnSync("verapdf", VERAPDF_VERSION_ARGS, { stdio: "ignore" });
    isVeraPdfAvailableCache = probe.status === 0;
  } catch {
    isVeraPdfAvailableCache = false;
  }
  return isVeraPdfAvailableCache;
}

function nowIso() {
  return new Date().toISOString();
}

function isPrivateIp(ip) {
  if (!ip) return true;
  const value = String(ip).toLowerCase();

  if (value === "::1") return true;
  if (value.startsWith("127.")) return true;
  if (value.startsWith("10.") || value.startsWith("192.168.")) return true;
  if (value.startsWith("169.254.")) return true;

  if (value.startsWith("172.")) {
    const octet = Number(value.split(".")[1]);
    if (octet >= 16 && octet <= 31) return true;
  }

  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("fe80")) return true;

  return false;
}

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))
  );
}

function normalizeScanUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) throw new Error("URL fehlt.");
  if (trimmed.length > MAX_URL_LENGTH) throw new Error(URL_ERROR_MESSAGE);

  const normalized = new URL(trimmed);
  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
    throw new Error(URL_ERROR_MESSAGE);
  }
  if (normalized.username || normalized.password) {
    throw new Error(URL_ERROR_MESSAGE);
  }
  if (isBlockedHost(normalized.hostname) || normalized.hostname.length > 253) {
    throw new Error(URL_ERROR_MESSAGE);
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

async function validateScanUrl(rawUrl) {
  const normalized = normalizeScanUrl(rawUrl);
  const url = new URL(normalized);

  const lookupResults = await Promise.race([
    dns.lookup(url.hostname, { all: true }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("DNS lookup timeout")), DNS_LOOKUP_TIMEOUT_MS)),
  ]);
  if (!Array.isArray(lookupResults) || lookupResults.length === 0) {
    throw new Error("URL nicht auflösbar");
  }
  if (lookupResults.some((r) => isPrivateIp(r.address))) {
    throw new Error("URL nicht erlaubt");
  }

  return normalized;
}

function getPdfFilename(fileUrl) {
  try {
    const u = new URL(fileUrl);
    const name = path.basename(u.pathname || "");
    return name || "document.pdf";
  } catch {
    return "document.pdf";
  }
}

function collectPdfLinks(links, baseUrl) {
  const result = new Map();
  const parsedBase = new URL(baseUrl);

  for (const entry of Array.isArray(links) ? links : []) {
    if (!entry?.href) continue;

    let href = String(entry.href).trim();
    if (!href) continue;

    let absolute;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      continue;
    }

    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
    if (!isSameOrSubdomain(absolute.hostname, parsedBase.hostname)) continue;
    if (!absolute.pathname || !absolute.pathname.toLowerCase().endsWith(".pdf")) continue;

    result.set(absolute.toString(), {
      href: absolute.toString(),
      text: String(entry.text || "").trim(),
    });

    if (result.size >= Math.max(0, MAX_PDFS_PER_SCAN)) break;
  }

  return Array.from(result.values());
}

function setJob(jobId, patch) {
  const prev = jobs.get(jobId) || {
    id: jobId,
    status: "pending",
    percent: 0,
    message: "Wartet …",
    details: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const next = { ...prev, ...patch, updatedAt: nowIso() };
  jobs.set(jobId, next);
  if (next._emit) {
    next._emit(next);
  }
  return next;
}

function toSseEvent(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function callbackPersistResult(jobId, payload) {
  if (!CALLBACK_KEY) return;
  try {
    await fetch(`${WEB_CALLBACK_BASE_URL}/api/bfsg/scan/${encodeURIComponent(jobId)}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bfsg-scan-key": CALLBACK_KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // ignore callback failures; SSE is still the source of truth for the active client
  }
}

function isSameOrSubdomain(host, baseHost) {
  const h = host.toLowerCase();
  const b = baseHost.toLowerCase();
  return h === b || h.endsWith(`.${b}`);
}

async function downloadPdfToTmp(pdfUrl, maxBytes) {
  const resp = await fetch(pdfUrl, {
    redirect: "follow",
    headers: { "user-agent": DEFAULT_USER_AGENT },
    signal: AbortSignal.timeout(PDF_DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`PDF download failed: ${resp.status}`);

  const cl = Number(resp.headers.get("content-length") || 0);
  if (cl && cl > maxBytes) throw new Error("PDF too large");

  const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("application/pdf") && !contentType.includes("octet-stream")) {
    throw new Error("Keine PDF-Datei");
  }

  const stream = resp.body;
  if (!stream) throw new Error("PDF download failed");

  let downloaded = 0;
  const chunks = [];
  for await (const chunk of stream) {
    const size = Buffer.isBuffer(chunk) ? chunk.length : new Uint8Array(chunk).byteLength;
    downloaded += size;
    if (downloaded > maxBytes) throw new Error("PDF too large");
    chunks.push(Buffer.from(chunk));
  }

  const buf = Buffer.concat(chunks);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "voxdrop-bfsg-pdf-"));
  const filePath = path.join(tmpDir, getPdfFilename(pdfUrl));
  await fs.writeFile(filePath, buf);
  return { filePath, cleanup: async () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}) };
}

async function runVeraPdfUa1(pdfPath) {
  const args = ["--format", "json", "--flavour", "ua1", pdfPath];
  const proc = spawn("verapdf", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let timeoutHandle;

  proc.stdout.on("data", (d) => {
    stdout += d.toString("utf8");
  });
  proc.stderr.on("data", (d) => {
    stderr += d.toString("utf8");
  });

  const exitCode = await new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 1));
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, PDF_CHECK_TIMEOUT_MS);
  });

  clearTimeout(timeoutHandle);
  if (timedOut) {
    throw new Error("PDF-Check timeout");
  }
  try {
    const report = JSON.parse(stdout);
    if (exitCode !== 0) {
      report._meta = {
        ...(report._meta || {}),
        exitCode,
        stderr: String(stderr || "").slice(0, 500),
      };
    }
    return report;
  } catch {
    if (exitCode !== 0) {
      const details = String(stderr || "").trim() || `veraPDF exited with ${exitCode}`;
      throw new Error(details);
    }
    throw new Error("PDF-Check konnte nicht ausgewertet werden");
  }
}

function parseVeraPdfReport(report) {
  const validation = report?.report?.jobs?.[0]?.validationResult;
  const compliant = validation?.compliant === true;
  const passedRules = Number(validation?.details?.passedRules || 0);
  const failedRules = Number(validation?.details?.failedRules || 0);
  const ruleSummaries = Array.isArray(validation?.details?.ruleSummaries) ? validation.details.ruleSummaries : [];

  const errors = ruleSummaries
    .filter((r) => (r?.failedChecks || 0) > 0)
    .slice(0, 50)
    .map((r) => ({
      rule: r?.ruleId?.specification || "unknown",
      description: r?.description || r?.ruleId?.clause || "",
      clause: r?.ruleId?.clause || "",
      failedChecks: r?.failedChecks || 0,
    }));

  return { compliant, passedRules, failedRules, errors };
}

function mapAxeViolationsToFindings(violations) {
  const severityMap = {
    critical: "critical",
    serious: "major",
    moderate: "moderate",
    minor: "info",
  };
  return (violations || []).map((v, idx) => {
    const wcagTag = (v.tags || []).find((t) => String(t).startsWith("wcag")) || "";
    const wcagLevel = (v.tags || []).includes("wcag2aa") || (v.tags || []).includes("wcag21aa") ? "AA" : (v.tags || []).includes("wcag2aaa") || (v.tags || []).includes("wcag21aaa") ? "AAA" : "A";
    const voxdropCanFix = ["color-contrast", "image-alt", "document-title", "html-has-lang", "link-name", "label"].includes(v.id);
    const affectedElements = Array.isArray(v.nodes)
      ? v.nodes.slice(0, 3).map((n) => ({
          selector: Array.isArray(n.target) ? n.target.join(" > ") : "",
          html: String(n.html || "").slice(0, 200),
        }))
      : [];
    return {
      id: v.id,
      severity: severityMap[v.impact] || "moderate",
      wcag_criterion: v.helpUrl || wcagTag,
      wcag_level: wcagLevel,
      title: v.help || v.id,
      description: v.description || "",
      count: Array.isArray(v.nodes) ? v.nodes.length : 0,
      is_free: idx < 5,
      voxdrop_can_fix: voxdropCanFix,
      recommendation: v.helpUrl || undefined,
      affected_elements: affectedElements,
    };
  });
}

function calculateScore(axeResults, pdfResults, pageMeta) {
  const violations = axeResults?.violations || [];
  const passes = axeResults?.passes || [];
  const totalRules = violations.length + passes.length;
  const axeScore = totalRules > 0 ? (passes.length / totalRules) * 100 : 100;

  const hasPdfs = Array.isArray(pdfResults) && pdfResults.length > 0;
  const pdfScore = hasPdfs ? (pdfResults.filter((p) => p.isCompliant).length / pdfResults.length) * 100 : 100;

  let bpScore = 100;
  if (!pageMeta?.lang) bpScore -= 25;
  if (!pageMeta?.hasH1) bpScore -= 15;
  if (!pageMeta?.hasSkipLink) bpScore -= 10;
  if (!pageMeta?.title || String(pageMeta.title).trim().length < 3) bpScore -= 15;
  bpScore = Math.max(0, bpScore);

  const pdfWeight = hasPdfs ? 0.2 : 0;
  const axeWeight = hasPdfs ? 0.7 : 0.85;
  const bpWeight = hasPdfs ? 0.1 : 0.15;

  const score = Math.round(axeScore * axeWeight + pdfScore * pdfWeight + bpScore * bpWeight);
  return Math.max(0, Math.min(100, score));
}

async function doScan(jobId, urlStr) {
  const startedAt = Date.now();
  const normalizedUrl = await validateScanUrl(urlStr);
  if (HARD_DISABLE_EXTERNAL_NETWORK) {
    throw new Error("Externe Netzwerkzugriffe sind deaktiviert.");
  }

  setJob(jobId, {
    status: "running",
    percent: 2,
    message: "Seite wird geladen …",
    details: [
      "Seite wird geladen …",
      "Seitenstruktur wird analysiert …",
      "Barrierefreiheit wird geprüft (axe-core) …",
      "Farbkontraste und Textalternativen …",
      "PDF-Dokumente werden geprüft (veraPDF) …",
      "Ergebnis wird berechnet …",
    ],
  });

  let browser;
  let hardTimeoutHandle;
  const pdfWarnings = [];
  const hardTimeoutMs = Math.max(10_000, SCAN_TIMEOUT_MS);

  try {
    const hardTimeout = new Promise((_, reject) => {
      hardTimeoutHandle = setTimeout(() => reject(new Error("Scan timeout")), hardTimeoutMs);
    });

    await Promise.race([
      (async () => {
        browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(DEFAULT_USER_AGENT);
        page.setDefaultNavigationTimeout(URL_SCAN_TIMEOUT_MS);

        const url = new URL(normalizedUrl);
        await page.goto(normalizedUrl, { waitUntil: "networkidle2", timeout: URL_SCAN_TIMEOUT_MS });

        setJob(jobId, { percent: 15, message: "Seitenstruktur wird analysiert …" });

        const pageMeta = await page.evaluate(() => ({
          title: document.title,
          lang: document.documentElement.lang || null,
          hasH1: !!document.querySelector("h1"),
          hasSkipLink: !!document.querySelector('a[href="#content"], a[href="#main"], a[href="#inhalt"], .skip-link, .skip-navigation'),
          headingStructure: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
            .slice(0, 50)
            .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || "").trim().slice(0, 80) })),
          formCount: document.querySelectorAll("form").length,
          imageCount: document.querySelectorAll("img").length,
          videoCount: document.querySelectorAll('video, audio, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
        }));
        const domBytes = await page.evaluate(() => {
          const html = document.documentElement ? document.documentElement.outerHTML : "";
          return html.length;
        });
        if (domBytes > MAX_DOM_BYTES) {
          throw new Error(`Seiteninhalt zu groß für den automatischen Scan (${domBytes} > ${MAX_DOM_BYTES} Zeichen).`);
        }
        let screenshotBase64 = null;

        try {
          const screenshotBuffer = await page.screenshot({
            type: "jpeg",
            quality: 75,
            fullPage: false,
          });
          screenshotBase64 = screenshotBuffer.toString("base64");
        } catch {
          // Screenshot optional for this use case.
          screenshotBase64 = null;
        }

        setJob(jobId, { percent: 30, message: "Barrierefreiheit wird geprüft (axe-core) …" });
        await page.evaluate(axeSource);

        const axeResults = await page.evaluate(async () => {
          // eslint-disable-next-line no-undef
          return await axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
            },
            resultTypes: ["violations", "passes", "incomplete"],
          });
        });

        setJob(jobId, { percent: 45, message: "Farbkontraste und Textalternativen …" });

        setJob(jobId, { percent: 55, message: "PDF-Links werden erkannt …" });
        const pdfLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a[href]"));
          return links
            .map((a) => ({
              href: a.href,
              text: (a.textContent || "").trim(),
            }));
        });

        const maxBytes = Math.max(1, MAX_PDF_SIZE_MB) * 1024 * 1024;
        const filteredPdfLinks = collectPdfLinks(pdfLinks, normalizedUrl);

        const pdfLimit = pLimit(Math.max(1, Math.floor(PDF_CONCURRENCY)));
        const pdfResults = [];

        const canRunVeraPdf = isVeraPdfAvailable();
        if (filteredPdfLinks.length > 0 && !canRunVeraPdf) {
          pdfWarnings.push("PDF/UA-Validierung ist in dieser Umgebung nicht verfügbar (veraPDF nicht installiert oder nicht lauffähig).");
        }

        if (filteredPdfLinks.length > 0 && canRunVeraPdf) {
          setJob(jobId, { percent: 70, message: `PDF/UA Checks laufen (${filteredPdfLinks.length} PDFs) …` });
          const settled = await Promise.allSettled(
            filteredPdfLinks.map((l) =>
              pdfLimit(async () => {
                const { filePath, cleanup } = await downloadPdfToTmp(l.href, maxBytes);
                try {
                  const report = await runVeraPdfUa1(filePath);
                  const parsed = parseVeraPdfReport(report);
                  return {
                    filename: getPdfFilename(l.href),
                    url: l.href,
                    isCompliant: parsed.compliant,
                    totalChecks: parsed.passedRules + parsed.failedRules,
                    failedChecks: parsed.failedRules,
                    errors: parsed.errors,
                  };
                } finally {
                  await cleanup();
                }
              })
            )
          );
          for (const s of settled) {
            if (s.status === "fulfilled") {
              pdfResults.push(s.value);
              continue;
            }

            const reason = s.reason instanceof Error ? s.reason.message : String(s.reason || "PDF-Check fehlgeschlagen.");
            pdfWarnings.push(reason.startsWith("PDF-Check fehlgeschlagen") ? reason : `PDF-Check fehlgeschlagen: ${reason}`);
          }
        }

        setJob(jobId, { percent: 90, message: "Ergebnis wird berechnet …" });
        const findings = mapAxeViolationsToFindings(axeResults?.violations || []);

        const score = calculateScore(axeResults, pdfResults, pageMeta);

        const critical = findings.filter((f) => f.severity === "critical").length;
        const major = findings.filter((f) => f.severity === "major").length;
        const moderate = findings.filter((f) => f.severity === "moderate").length;
        const passed = Array.isArray(axeResults?.passes) ? axeResults.passes.length : 0;

        const scanResult = {
          url: normalizedUrl,
          scannedAt: nowIso(),
          score,
          screenshot: screenshotBase64,
          findings,
          compliance: {
            bfsg: score >= 90 ? "konform" : score >= 60 ? "teilweise" : "nicht-konform",
            wcag_aa: {
              passed,
              total: passed + findings.length,
              percentage: Math.round((passed / Math.max(1, passed + findings.length)) * 100),
            },
            pdf_ua: {
              scanned: pdfResults.length,
              compliant: pdfResults.filter((p) => p.isCompliant).length,
              non_compliant: pdfResults.filter((p) => !p.isCompliant).length,
              files: pdfResults,
              skipped: Math.max(0, (filteredPdfLinks || []).length - pdfResults.length),
              warnings: pdfWarnings,
            },
            bitv: "zusätzliche-prüfung-nötig",
          },
          risk: {
            critical,
            major,
            moderate,
            passed,
            maxFine: critical * 100000,
          },
          pageMeta,
          scanDuration: Date.now() - startedAt,
        };

        setJob(jobId, { status: "completed", percent: 100, message: "Fertig", result: scanResult });
        await callbackPersistResult(jobId, { status: "completed", score, result: scanResult });
      })(),
      hardTimeout,
    ]);
  } finally {
    if (hardTimeoutHandle) clearTimeout(hardTimeoutHandle);
    try {
      await browser?.close();
    } catch {
      // ignore
    }
  }
}

app.post("/scan", async (req, res) => {
  const scanId = String(req.body?.scanId || "").trim() || crypto.randomUUID();
  const rawUrl = String(req.body?.url || "").trim();
  if (!rawUrl) return res.status(400).json({ error: "url required" });
  if (HARD_DISABLE_EXTERNAL_NETWORK) {
    return res.status(503).json({ error: "Scanner ist deaktiviert.", message: "Externe Netzwerkzugriffe sind deaktiviert." });
  }

  let normalizedUrl;
  try {
    normalizedUrl = await validateScanUrl(rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL ungültig";
    return res.status(400).json({ error: "Ungültige URL", message });
  }

  const existing = jobs.get(scanId);
  if (existing && (existing.status === "running" || existing.status === "completed")) {
    return res.json({ scanId, status: existing.status });
  }

  setJob(scanId, { status: "pending", percent: 1, message: "In Warteschlange …" });
  globalLimit(async () => {
    try {
      await doScan(scanId, normalizedUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setJob(scanId, { status: "failed", percent: 100, message: "Fehler", error: msg });
      await callbackPersistResult(scanId, { status: "failed", error: msg });
    }
  }).catch(() => {});

  return res.json({ scanId, status: "pending" });
});

app.get("/scan/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  const job = jobs.get(id);
  if (!job) return res.status(404).json({ error: "Not found" });
  return res.json({ scanId: id, status: job.status, percent: job.percent, message: job.message, result: job.result, error: job.error });
});

app.get("/scan/:id/stream", (req, res) => {
  const id = String(req.params.id || "").trim();
  const job = jobs.get(id);
  if (!job) {
    res.status(404);
    res.setHeader("Content-Type", "text/event-stream");
    res.write(toSseEvent("error", { message: "Not found" }));
    res.end();
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const sendProgress = (j) => {
    res.write(toSseEvent("progress", { percent: j.percent, message: j.message, details: j.details || [] }));
    if (j.status === "completed") {
      res.write(toSseEvent("complete", { result: j.result }));
      res.end();
    } else if (j.status === "failed") {
      res.write(toSseEvent("scan-error", { message: j.error || "Fehler" }));
      res.write(toSseEvent("error", { message: j.error || "Fehler" }));
      res.end();
    }
  };

  // Attach emitter
  const prevEmit = job._emit;
  const emit = (j) => sendProgress(j);
  job._emit = emit;
  jobs.set(id, job);

  // Initial snapshot
  sendProgress(job);

  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    const current = jobs.get(id);
    if (current) {
      // Restore previous emitter (avoid leaking res handles)
      current._emit = prevEmit;
      jobs.set(id, current);
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[bfsg-scan-worker] listening on :${PORT}`);
});
