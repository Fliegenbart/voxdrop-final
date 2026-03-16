import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import net from "net";
import dns from "dns/promises";
import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import axios from "axios";
import FormData from "form-data";
import OpenAI from "openai";
import { fileTypeFromBuffer } from "file-type";
import { detectFileType } from "./utils/file-type";
import { getTmpDir, tmpPath } from "./utils/tmp";
import { safeExtensionFromOriginalName } from "./utils/safe-filename";
import { cleanupStaleJobInputsAndTmp, computeFileSha256, persistJobInputFile } from "./utils/job-inputs";
import { resolveStorageTarget } from "./utils/storage-target";
import { checkNvencAvailable as checkNvencAvailableRuntime } from "./utils/nvenc";
import { getPptxSlideCount } from "./utils/pptx";
import { getPublicBaseUrl } from "./utils/public-url";

// Auth imports
import authRoutes from "./auth/routes";
import { requireAuth, optionalAuth, checkUsageLimit, gpuRateLimit, requireMinPlan } from "./auth/middleware";
import { incrementUsage, createAuditLog, hashIP, createRecording, getUserRecordings, getWorkspaceRecordings, getRecordingByIdForUser, deleteRecordingForUser, deleteWorkspaceRecording, getOrCreateDefaultWorkspaceForUser, getWorkspaceById, ensureCreditWallet, reserveCredits, releaseCredits, spendCredits, addCredits, getAuditLogCountBetween } from "./db/queries";
import { DATA_DIR } from "./db/init";
import { USAGE_LIMITS } from "./auth/config";
import { CREDIT_COSTS, type PlanId, SUBSCRIPTION_PLAN_MAP } from "./billing/config";

// Job queue imports
import { registerJobRoutes } from "./routes/job-routes";
import { registerSessionRoutes } from "./routes/session-routes";
import { registerFileSharingRoutes } from "./routes/file-sharing-routes";
import { registerVoiceoverRoutes } from "./routes/voiceover-routes";
import avatarRoutes from "./routes/avatar-routes";
import workspaceRoutes from "./routes/workspace-routes";
import documentRoutes from "./routes/document-routes";
import { startVideoWorker, startChapterWorker, startTranscriptionWorker, startPDFUAWorker, startOllamaWorker, startPPTXWorker, startPodcastWorker, startEmbedSubtitlesWorker, isRedisAvailable, getPriorityForSubscription, transcriptionQueue, pdfuaQueue, podcastQueue, createJob, getJob, getJobForUserOrWorkspace, getJobsForUser, getJobsForWorkspace } from "./queue";
import pptxRoutes from "./routes/pptx-routes";
import pptxPdfSmartRoutes from "./routes/pptx-pdf-smart-routes";
import pptxSummaryPdfRoutes from "./routes/pptx-summary-pdf-routes";
import vpatRoutes from "./routes/vpat-routes";
import videoAiRoutes from "./routes/video-ai-routes";
import { registerBillingRoutes } from "./routes/billing-routes";
import { registerLemonSqueezyRoutes } from "./routes/lemonsqueezy-routes";
import bfsgRoutes from "./routes/bfsg-routes";
import chapterExportRoutes from "./routes/chapter-export-routes";

// Simple Language imports
import { analyzeText } from "./services/text-analysis";
import { UnsafeLlmRequestError, simplifyTextWithOllama, checkOllamaHealth, generateColorPalette } from "./services/ollama";
import { MAX_TEXT_LENGTH } from "./rules/simple-language-rules";

// Email imports
import { sendConversionCompleteEmail, sendPodcastCompleteEmail } from "./email/service";
import { reconcileStaleHeartbeatJobs, reconcileStuckSubtitleEmbedJobs } from "./queue/reconcile";

// Podcast service URL
const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || "http://localhost:8001";
const PODCAST_NOTIFICATION_TTL_MS = Number(process.env.PODCAST_NOTIFICATION_TTL_MS || 24 * 60 * 60 * 1000);
const PODCAST_STATUS_POLL_INTERVAL_MS = Number(process.env.PODCAST_STATUS_POLL_INTERVAL_MS || 15000);
const PODCAST_RETRY_ATTEMPTS = Math.max(1, Number(process.env.VOXDROP_PODCAST_RETRY_ATTEMPTS || 3));
const ENABLE_QUEUE_WORKERS = !['0', 'false', 'no', 'off'].includes(
  String(process.env.VOXDROP_ENABLE_WORKERS ?? 'true').trim().toLowerCase()
);

type PodcastPhaseCode =
  | "queued"
  | "extracting"
  | "analyzing"
  | "generating"
  | "synthesizing"
  | "assembling"
  | "retrying"
  | "completed"
  | "failed";

const PODCAST_PHASE_RANK: Record<PodcastPhaseCode, number> = {
  queued: 0,
  extracting: 10,
  analyzing: 20,
  generating: 30,
  synthesizing: 40,
  assembling: 50,
  retrying: 60,
  completed: 90,
  failed: 100,
};

function normalizePodcastPhaseCode(value: unknown): PodcastPhaseCode | null {
  const phase = String(value || "").trim().toLowerCase();
  if (!phase) return null;
  if (
    phase === "queued" ||
    phase === "extracting" ||
    phase === "analyzing" ||
    phase === "generating" ||
    phase === "synthesizing" ||
    phase === "assembling" ||
    phase === "retrying" ||
    phase === "completed" ||
    phase === "failed"
  ) {
    return phase as PodcastPhaseCode;
  }
  if (phase === "pending") return "queued";
  return null;
}

function defaultPodcastPhaseMessage(phaseCode: PodcastPhaseCode): string {
  switch (phaseCode) {
    case "queued":
      return "In Warteschlange...";
    case "extracting":
      return "Folien werden extrahiert...";
    case "analyzing":
      return "Bilder werden analysiert...";
    case "generating":
      return "Podcast-Skript wird erstellt...";
    case "synthesizing":
      return "Audio wird generiert...";
    case "assembling":
      return "Podcast wird finalisiert...";
    case "retrying":
      return "Erneuter Versuch wird vorbereitet...";
    case "completed":
      return "Fertig";
    case "failed":
      return "Fehler";
    default:
      return "Wird verarbeitet...";
  }
}

function mapLegacyPodcastStageToPhaseCode(stageRaw: unknown): PodcastPhaseCode {
  const stageText = String(stageRaw || "").toLowerCase();
  if (!stageText.trim()) return "extracting";
  if (stageText.includes("retry") || stageText.includes("erneut")) return "retrying";
  if (stageText.includes("bild") || stageText.includes("analyse")) return "analyzing";
  if (
    stageText.includes("skript") ||
    stageText.includes("präsentation") ||
    stageText.includes("generat") ||
    stageText.includes("beat") ||
    stageText.includes("processing")
  ) {
    return "generating";
  }
  if (
    stageText.includes("audio") ||
    stageText.includes("sprach") ||
    stageText.includes("tts") ||
    stageText.includes("synth")
  ) {
    return "synthesizing";
  }
  if (
    stageText.includes("fertig") ||
    stageText.includes("final") ||
    stageText.includes("assem") ||
    stageText.includes("merge")
  ) {
    return "assembling";
  }
  return "extracting";
}

function mapPodcastPhaseToStatus(phaseCode: PodcastPhaseCode): string {
  switch (phaseCode) {
    case "retrying":
      return "queued";
    default:
      return phaseCode;
  }
}

function normalizePodcastTimings(raw: unknown): { packMs: number; scriptMs: number; ttsMs: number; totalMs: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const toMs = (entry: unknown) => {
    const parsed = Number(entry);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  };
  const timings = {
    packMs: toMs(value.packMs),
    scriptMs: toMs(value.scriptMs),
    ttsMs: toMs(value.ttsMs),
    totalMs: toMs(value.totalMs),
  };
  if (timings.packMs || timings.scriptMs || timings.ttsMs || timings.totalMs) {
    return timings;
  }
  return null;
}

// Store podcast notification emails (jobId -> { email, filename, notified, createdAt })
const podcastNotifications = new Map<string, { email: string; filename: string; notified: boolean; createdAt: number }>();
let podcastNotificationPollerRunning = false;

function normalizePodcastPronunciationRules(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return trimmed;
    const normalized = parsed
      .map((entry: any) => ({
        original: String(entry?.original ?? "").trim(),
        spoken: String(entry?.spoken ?? "").trim(),
      }))
      .filter((entry) => entry.original.length > 0 && entry.spoken.length > 0)
      .sort((a, b) => {
        const byOriginal = a.original.localeCompare(b.original, "de");
        if (byOriginal !== 0) return byOriginal;
        return a.spoken.localeCompare(b.spoken, "de");
      });
    return normalized.length > 0 ? JSON.stringify(normalized) : "";
  } catch {
    return trimmed;
  }
}

function buildPodcastDedupKey(params: {
  fileSha256: string;
  style: string;
  speakerStyle: string;
  ttsEngine?: string;
  ttsPreset?: string;
  pronunciationRulesNormalized?: string;
  storageScope: "user" | "workspace";
  workspaceId?: string | null;
  projectId?: string | null;
}): string {
  const payload = {
    v: 1,
    fileSha256: params.fileSha256,
    style: params.style,
    speakerStyle: params.speakerStyle,
    ttsEngine: params.ttsEngine || "",
    ttsPreset: params.ttsPreset || "",
    pronunciationRulesNormalized: params.pronunciationRulesNormalized || "",
    storageScope: params.storageScope,
    workspaceId: params.workspaceId || "",
    projectId: params.projectId || "",
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function extractJobDedupKey(inputData: string | null): string | null {
  if (!inputData) return null;
  try {
    const parsed = JSON.parse(inputData) as { dedupKey?: unknown };
    return typeof parsed?.dedupKey === "string" && parsed.dedupKey.length > 0 ? parsed.dedupKey : null;
  } catch {
    return null;
  }
}

setInterval(async () => {
  if (podcastNotificationPollerRunning || podcastNotifications.size === 0) {
    return;
  }

  podcastNotificationPollerRunning = true;
  const now = Date.now();

  try {
    for (const [jobId, notification] of podcastNotifications.entries()) {
      if (notification.notified) continue;
      if (now - notification.createdAt > PODCAST_NOTIFICATION_TTL_MS) {
        podcastNotifications.delete(jobId);
        continue;
      }

      try {
        const response = await fetch(`${PODCAST_SERVICE_URL}/status/${jobId}`, {
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          continue;
        }

        const status = await response.json();
        if (status.status !== "completed" && status.status !== "failed") {
          continue;
        }

        notification.notified = true;
        podcastNotifications.set(jobId, notification);

        sendPodcastCompleteEmail(
          notification.email,
          notification.filename,
          jobId,
          status.status === "completed",
          status.duration_seconds,
          status.chapters?.length
        ).then(result => {
          if (result.success) {
            console.log(`[Podcast] Email notification sent for job ${jobId}`);
          } else {
            console.error(`[Podcast] Failed to send email for job ${jobId}:`, result.error);
          }
          setTimeout(() => podcastNotifications.delete(jobId), 60000);
        });
      } catch (error) {
        console.error("[Podcast] Notification poller error:", error);
      }
    }
  } finally {
    podcastNotificationPollerRunning = false;
  }
}, PODCAST_STATUS_POLL_INTERVAL_MS);

// Persona service URL
const PERSONA_SERVICE_URL = process.env.PERSONA_SERVICE_URL || "http://localhost:8002";

// ===========================================
// FILE VALIDATION
// ===========================================

// Allowed MIME types for audio/video uploads
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/mpga',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/ogg',
  'audio/vorbis',
  'audio/flac',
  'audio/x-flac'
]);

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/mpeg',
  'video/quicktime'
]);

const ALLOWED_FONT_TYPES = new Set([
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/x-font-ttf',
  'application/x-font-otf'
]);

const ALLOWED_PPTX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/zip' // PPTX files are detected as zip
]);

const ALLOWED_PDF_TYPES = new Set([
  'application/pdf',
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/zip' // Office files are detected as zip
]);

// Validate file using magic bytes
async function validateFileType(
  filePath: string,
  allowedTypes: Set<string>,
  declaredMimeType?: string
): Promise<{ valid: boolean; detectedType: string | undefined; error?: string }> {
  try {
    const fileType = await detectFileType(filePath);

    if (!fileType) {
      // Some text-based formats may not have magic bytes (e.g., SRT)
      // Allow if declared type is acceptable
      if (declaredMimeType && (declaredMimeType === 'text/plain' || declaredMimeType === 'application/x-subrip')) {
        return { valid: true, detectedType: declaredMimeType };
      }
      return { valid: false, detectedType: undefined, error: 'Could not determine file type' };
    }

    // Check if detected type is allowed
    if (!allowedTypes.has(fileType.mime)) {
      return {
        valid: false,
        detectedType: fileType.mime,
        error: `File type ${fileType.mime} is not allowed`
      };
    }

    // Warn if declared type doesn't match detected type (but still allow)
    if (declaredMimeType && declaredMimeType !== fileType.mime) {
      console.warn(`[Security] MIME type mismatch: declared=${declaredMimeType}, detected=${fileType.mime}`);
    }

    return { valid: true, detectedType: fileType.mime };
  } catch (error) {
    return { valid: false, detectedType: undefined, error: String(error) };
  }
}

// Set FFmpeg path - prefer system ffmpeg (for GPU support), fallback to ffmpeg-static
try {
  // Check if system ffmpeg is available
  execSync("which ffmpeg", { encoding: "utf-8" });
  console.log("Using system FFmpeg (GPU support enabled)");
} catch {
  // System ffmpeg not found, use ffmpeg-static
  if (ffmpegInstaller.path) {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    console.log("Using ffmpeg-static (no GPU support)");
  }
}

// Check if NVIDIA GPU encoding (NVENC) is available
let nvencAvailable: boolean | null = null;

function checkNvencAvailable(): boolean {
  if (nvencAvailable !== null) return nvencAvailable;

  // Runtime check: ffmpeg can list NVENC encoders even when the container can't access the GPU.
  nvencAvailable = checkNvencAvailableRuntime("[Server]");

  return nvencAvailable;
}

// Get video encoding options (GPU or CPU)
function getVideoEncodingOptions(quality: "fast" | "balanced" | "quality" = "balanced"): string[] {
  const useGpu = checkNvencAvailable();

  if (useGpu) {
    // NVIDIA NVENC options
    const presets: Record<string, string> = {
      fast: "p1",      // Fastest
      balanced: "p4",  // Good balance
      quality: "p7"    // Best quality
    };
    return [
      "-c:v h264_nvenc",
      `-preset ${presets[quality]}`,
      "-rc vbr",           // Variable bitrate
      "-cq 23",            // Quality level (like CRF)
      "-b:v 0",            // Let encoder decide bitrate
    ];
  } else {
    // CPU libx264 options
    const presets: Record<string, string> = {
      fast: "veryfast",
      balanced: "fast",
      quality: "slow"
    };
    return [
      "-c:v libx264",
      `-preset ${presets[quality]}`,
      "-crf 23",
    ];
  }
}

const AUDIO_ENHANCE_FILTER = "highpass=f=80,lowpass=f=12000,loudnorm=I=-16:TP=-1.5:LRA=11";

function getHardcodedAudioOptions(enhanceAudio: boolean): string[] {
  if (enhanceAudio) {
    return [
      "-c:a aac",
      "-b:a 192k",
      `-af ${AUDIO_ENHANCE_FILTER}`,
    ];
  }
  return [
    "-c:a aac",
    "-b:a 128k",
  ];
}

function getSoftAudioOptions(enhanceAudio: boolean): string[] {
  if (enhanceAudio) {
    return [
      "-c:a aac",
      "-b:a 192k",
      `-af ${AUDIO_ENHANCE_FILTER}`,
    ];
  }
  return ["-c:a copy"];
}

// Whisper service URL (local microservice for GDPR compliance)
const WHISPER_SERVICE_URL = process.env.WHISPER_SERVICE_URL || "http://localhost:8000";

// OpenAI client for cloud Whisper API (non-GDPR mode)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOW_OPENAI_WHISPER = process.env.ALLOW_OPENAI_WHISPER === "true";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Determine which transcription mode to use
const HARD_DISABLE_EXTERNAL_NETWORK = process.env.HARD_DISABLE_EXTERNAL_NETWORK === 'true';
const USE_OPENAI_WHISPER = !HARD_DISABLE_EXTERNAL_NETWORK && !!OPENAI_API_KEY && ALLOW_OPENAI_WHISPER;
console.log(`Whisper mode: ${USE_OPENAI_WHISPER ? "OpenAI API (Cloud)" : "Local Whisper Service (GDPR-compliant)"}`);

// Convert seconds to SRT timestamp format
function secondsToSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

// Generate SRT from OpenAI segments
function generateSrtFromSegments(segments: Array<{ start: number; end: number; text: string }>): string {
  return segments.map((seg, i) =>
    `${i + 1}\n${secondsToSrtTime(seg.start)} --> ${secondsToSrtTime(seg.end)}\n${seg.text.trim()}`
  ).join("\n\n") + "\n";
}

// Configure multer for temp file uploads
const upload = multer({
  dest: getTmpDir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max for large video files
});

// Cleanup temp files after use
function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Error cleaning up file:", filePath, err);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const isPrivateIp = (ip: string): boolean => {
    if (net.isIP(ip) === 0) return true;
    if (ip === "127.0.0.1" || ip === "::1") return true;
    if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
    if (ip.startsWith("172.")) {
      const octet = Number(ip.split(".")[1]);
      if (octet >= 16 && octet <= 31) return true;
    }
    if (ip.startsWith("169.254.")) return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // Unique local
    if (ip.startsWith("fe80")) return true; // Link-local IPv6
    return false;
  };

  // SEO-friendly redirects for legacy tool URLs
  app.get("/tools/pptx-pdf", (_req, res) => {
    res.redirect(301, "/tools/pptx-to-pdf-smart");
  });

  app.get("/tools/reports", (_req, res) => {
    res.redirect(301, "/tools/vpat-checker");
  });


  // Auth routes
  app.use("/api/auth", authRoutes);

  // Blog (public) + Admin blog editor (admin-only)

  // Workspace + projects + members
  app.use("/api/workspaces", workspaceRoutes);
  // Documents listing (workspace or private)
  app.use("/api/documents", documentRoutes);

  // Job queue routes (async video/transcription processing)
  registerJobRoutes(app, requireAuth);

  // Session routes (video editor file storage)
  registerSessionRoutes(app);

  // File sharing routes (accessible file upload/download)
  registerFileSharingRoutes(app);

  // Billing + credits (plans, usage, reservations)
  registerBillingRoutes(app, requireAuth);

  // LemonSqueezy checkout & webhooks
  registerLemonSqueezyRoutes(app, requireAuth);

  // Voice-over routes (text-to-speech generation)
  registerVoiceoverRoutes(app);

  // BFSG Kompass routes (scope check + quick scan API)
  app.use("/api/bfsg", bfsgRoutes);

  // Chapter export routes (government subtitle flow with chunk recovery)
  app.use("/api/chapter-export", chapterExportRoutes);

  // Avatar routes (speaking avatar generation)
  app.use("/api/avatar", optionalAuth, avatarRoutes);

  // PPTX Summary routes (accessibility summaries with LLM)
  app.use("/api/pptx-summary", optionalAuth, pptxRoutes);

  // VPAT / EN 301 549 / BITV 2.0 Compliance routes
  app.use("/api/vpat", vpatRoutes);

  // Video AI helpers (chapters, etc.)
  app.use("/api/video-ai", videoAiRoutes);
  // Backward-compatible alias for older clients using /api/videotool.
  app.use("/api/videotool", optionalAuth, videoAiRoutes);

  // Public health checks for PPTX tools (avoid auth gating UI availability)
  const PPTX_SERVICE_URL = process.env.PPTX_SERVICE_URL || "http://pptx-service:8003";
  const PDFUA_HEALTH_URL = process.env.PDFUA_SERVICE_URL || "http://pdfua-service:8000";

  app.get("/api/pptx-to-pdf/health", async (_req, res) => {
    try {
      const response = await fetch(`${PPTX_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return res.status(503).json({ status: "unhealthy", error: "PPTX service unavailable" });
      }
      const health = await response.json();
      return res.json({ status: "healthy", service: health });
    } catch (error: any) {
      return res.status(503).json({ status: "unhealthy", error: error.message });
    }
  });

  app.get("/api/pptx-summary-pdf/health", async (_req, res) => {
    try {
      const response = await fetch(`${PDFUA_HEALTH_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return res.status(503).json({ status: "unhealthy", error: "PDF/UA service unavailable" });
      }
      const health = await response.json();
      return res.json({ status: "healthy", service: health });
    } catch (error: any) {
      return res.status(503).json({ status: "unhealthy", error: error.message });
    }
  });

  // PPTX to PDF Smart routes (context-aware alt-texts + PDF conversion)
  // Premium-only: PPTX to PDF conversion requires subscription
  app.use("/api/pptx-to-pdf", requireAuth, requireMinPlan('pro'), pptxPdfSmartRoutes);
  app.use("/api/pptx-summary-pdf", requireAuth, requireMinPlan('pro'), pptxSummaryPdfRoutes);

  // Start workers only on instances that are designated as queue workers.
  if (!ENABLE_QUEUE_WORKERS) {
    console.log("[Queue] Worker startup disabled (VOXDROP_ENABLE_WORKERS=false)");
  } else if (await isRedisAvailable()) {
    startVideoWorker();
    console.log("[Queue] Video worker started");
    startChapterWorker();
    console.log("[Queue] Chapter worker started");
    startTranscriptionWorker();
    console.log("[Queue] Transcription worker started");
    startPDFUAWorker();
    console.log("[Queue] PDFUA worker started");
    startOllamaWorker();
    console.log("[Queue] Ollama worker started");
    startPPTXWorker();
    console.log("[Queue] PPTX Summary worker started");
    startPodcastWorker();
    console.log("[Queue] Podcast worker started");
    startEmbedSubtitlesWorker();
    console.log("[Queue] Subtitle embed worker started");

    // Best-effort reconciliation for out-of-sync jobs (e.g. BullMQ stalled failures),
    // to prevent indefinite "loading" states in the UI.
    reconcileStuckSubtitleEmbedJobs({ olderThanMinutes: 10 }).catch((err) => {
      console.error("[Queue] Failed to reconcile subtitle-embed jobs:", err);
    });
    reconcileStaleHeartbeatJobs({ staleAfterMinutes: 10 }).catch((err) => {
      console.error("[Queue] Failed to reconcile stale heartbeat jobs:", err);
    });
    const initialCleanup = cleanupStaleJobInputsAndTmp({ olderThanHours: 48 });
    if (initialCleanup.removedJobInputDirs > 0 || initialCleanup.removedTmpDirs > 0) {
      console.log(`[Queue] Initial cleanup: removed ${initialCleanup.removedJobInputDirs} job-input dirs and ${initialCleanup.removedTmpDirs} tmp dirs`);
    }

    // Keep reconciling periodically; this is cheap and avoids "perma-active" jobs after deploys/restarts.
    setInterval(() => {
      reconcileStuckSubtitleEmbedJobs({ olderThanMinutes: 10 }).catch((err) => {
        console.error("[Queue] Failed to reconcile subtitle-embed jobs:", err);
      });
      reconcileStaleHeartbeatJobs({ staleAfterMinutes: 10 }).catch((err) => {
        console.error("[Queue] Failed to reconcile stale heartbeat jobs:", err);
      });
    }, 2 * 60 * 1000);

    setInterval(() => {
      const cleaned = cleanupStaleJobInputsAndTmp({ olderThanHours: 48 });
      if (cleaned.removedJobInputDirs > 0 || cleaned.removedTmpDirs > 0) {
        console.log(`[Queue] Cleanup: removed ${cleaned.removedJobInputDirs} job-input dirs and ${cleaned.removedTmpDirs} tmp dirs`);
      }
    }, 60 * 60 * 1000);
  } else {
    console.warn("[Queue] Redis not available - async jobs disabled");
  }

  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    const gpu = {
      nvenc: checkNvencAvailable(),
      encoding: checkNvencAvailable() ? "GPU (NVENC)" : "CPU (libx264)"
    };

    if (USE_OPENAI_WHISPER) {
      // OpenAI mode - no need to check local Whisper service
      res.json({
        status: "ok",
        whisper: {
          status: "ok",
          mode: "openai",
          model: "whisper-1",
          gdprCompliant: false
        },
        gpu
      });
    } else {
      // Local Whisper mode - check service health
      try {
        const whisperHealth = await fetch(`${WHISPER_SERVICE_URL}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        const whisperStatus = await whisperHealth.json();

        res.json({
          status: "ok",
          whisper: {
            ...whisperStatus,
            mode: "local",
            gdprCompliant: true
          },
          gpu
        });
      } catch (error) {
        res.json({
          status: "ok",
          whisper: {
            status: "unavailable",
            mode: "local",
            gdprCompliant: true
          },
          gpu
        });
      }
    }
  });

  // Proxy endpoint for fetching external URLs (used by ARIA checker)
  app.get(
    "/api/proxy",
    requireAuth,
    gpuRateLimit('web_proxy', {
      free: clampInt(Number(process.env.WEB_PROXY_RATE_LIMIT_FREE || 2), 1, 50, 2),
      pro: clampInt(Number(process.env.WEB_PROXY_RATE_LIMIT_PRO || 5), 1, 200, 5),
      premium: clampInt(Number(process.env.WEB_PROXY_RATE_LIMIT_PREMIUM || 8), 1, 500, 8),
      team: clampInt(Number(process.env.WEB_PROXY_RATE_LIMIT_TEAM || 10), 1, 1000, 10),
    }),
    async (req, res) => {
    const proxyEnabled = process.env.PROXY_ENABLED !== 'false';
    if (HARD_DISABLE_EXTERNAL_NETWORK || !proxyEnabled) {
      return res.status(404).json({ error: "Not found" });
    }

    const urlParam = req.query.url;
    if (typeof urlParam !== "string" || urlParam.trim().length === 0) {
      return res.status(400).json({ error: "URL parameter required" });
    }
    const url = urlParam.trim();

    const ipHash = hashIP(req.ip || 'unknown');

    const MAX_PROXY_REDIRECTS = Number(process.env.PROXY_MAX_REDIRECTS || 5);

    const validateExternalUrlOrThrow = async (u: URL) => {
      if (!["http:", "https:"].includes(u.protocol)) {
        throw new Error("Invalid protocol");
      }
      if (u.username || u.password) {
        throw new Error("Credentials not allowed");
      }
      // Block obvious local hostnames early.
      const hostLower = u.hostname.toLowerCase();
      if (hostLower === "localhost" || hostLower.endsWith(".localhost")) {
        throw new Error("URL not allowed");
      }

      const lookupResults = await dns.lookup(u.hostname, { all: true });
      if (lookupResults.length === 0 || lookupResults.some(result => isPrivateIp(result.address))) {
        throw new Error("URL not allowed");
      }
    };

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      await validateExternalUrlOrThrow(parsedUrl);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    try {
      const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
      const planId = workspace.plan_id as PlanId;
      const credits = CREDIT_COSTS.WEB_CHECK_URL.credits;
      const wallet = ensureCreditWallet(workspace.id, planId);
      if (credits > 0 && wallet.balance < credits) {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }

      // Free users: limit web-check proxy fetches to 5/day.
      if (planId === 'free') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todaysCount = getAuditLogCountBetween({
          userId: req.user!.id,
          action: 'web_check',
          status: 'success',
          startDate: startOfDay,
        });
        if (todaysCount >= 5) {
          return res.status(429).json({
            error: 'Limit erreicht',
            message: 'Free-Limit erreicht (5 Web-Pruefungen pro Tag).',
            requiresUpgrade: true,
          });
        }
      }

      let currentUrl = parsedUrl;
      let response: globalThis.Response | null = null;

      const maxRedirects = Math.max(0, Math.floor(MAX_PROXY_REDIRECTS));
      for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
        await validateExternalUrlOrThrow(currentUrl);

        response = await fetch(currentUrl.toString(), {
          headers: {
            "User-Agent": "VoxDrop ARIA Checker/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "manual",
          signal: AbortSignal.timeout(15000), // 15 second timeout (each request)
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          try { (response as any).body?.cancel?.(); } catch {}
          if (!location) {
            return res.status(502).json({ error: "Redirect without Location header" });
          }
          const nextUrl = new URL(location, currentUrl);
          currentUrl = nextUrl;
          continue;
        }

        break;
      }

      if (!response) {
        return res.status(500).json({ error: "Failed to fetch URL" });
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        return res.status(400).json({ error: "Too many redirects" });
      }

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Failed to fetch URL: ${response.status} ${response.statusText}`
        });
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        return res.status(400).json({ error: "URL must return HTML content" });
      }

      const MAX_PROXY_HTML_BYTES = Number(process.env.PROXY_MAX_HTML_BYTES || 2 * 1024 * 1024); // 2MB
      const body = response.body;
      if (!body) {
        return res.status(502).json({ error: "Empty response body" });
      }
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_PROXY_HTML_BYTES) {
          try { await reader.cancel(); } catch {}
          return res.status(413).json({ error: "HTML response too large" });
        }
        chunks.push(value);
      }
      const html = Buffer.concat(chunks).toString('utf-8');

      // Spend credits only after a successful fetch.
      if (credits > 0) {
        spendCredits(workspace.id, credits, null, {
          costKey: 'WEB_CHECK_URL',
          url: currentUrl.toString(),
        });
      }

      createAuditLog(req.user!.id, 'web_check', 'success', '/api/proxy', { url: currentUrl.toString() }, ipHash, workspace.id);
      // Treat external HTML as untrusted: return as plain text so it cannot execute in the browser.
      res.type("text/plain").send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === 'insufficient_credits') {
        return res.status(402).json({ error: 'Nicht genug Credits' });
      }
      if (message === 'URL not allowed' || message === 'Invalid protocol' || message === 'Credentials not allowed') {
        return res.status(400).json({ error: message });
      }
      createAuditLog(req.user!.id, 'web_check', 'failure', '/api/proxy', { url, error: message }, ipHash);
      res.status(500).json({ error: `Failed to fetch URL: ${message}` });
    }
    }
  );

  // Dashboard statistics endpoint (extended with impact metrics & achievements)
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const subscription = req.user!.subscription as keyof typeof USAGE_LIMITS;
      const limits = USAGE_LIMITS[subscription] || USAGE_LIMITS.free;

      const { getExtendedDashboardStats } = await import('./db/queries');
      const stats = getExtendedDashboardStats(userId, limits);
      res.json(stats);
    } catch (error) {
      console.error("[Dashboard] Stats error:", error);
      res.status(500).json({ error: "Fehler beim Laden der Dashboard-Daten" });
    }
  });

  // ===========================================
  // USER RECORDINGS (24h Storage)
  // ===========================================

  // Recordings storage directory
  const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  const RECORDINGS_CHUNKS_DIR = path.join(DATA_DIR, 'recordings-chunks');
  if (!fs.existsSync(RECORDINGS_CHUNKS_DIR)) {
    fs.mkdirSync(RECORDINGS_CHUNKS_DIR, { recursive: true });
  }

  const RECORDINGS_CHUNK_MAX_AGE_MS =
    Number(process.env.RECORDINGS_CHUNK_MAX_AGE_HOURS || 24) * 60 * 60 * 1000;

  const sanitizeChunkId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '');

  const cleanupRecordingChunks = () => {
    try {
      const now = Date.now();
      const entries = fs.readdirSync(RECORDINGS_CHUNKS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(RECORDINGS_CHUNKS_DIR, entry.name);
        try {
          const stats = fs.statSync(dirPath);
          if (now - stats.mtimeMs > RECORDINGS_CHUNK_MAX_AGE_MS) {
            fs.rmSync(dirPath, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup failures
        }
      }
    } catch {
      // Ignore cleanup failures
    }
  };

  setInterval(cleanupRecordingChunks, 60 * 60 * 1000);
  cleanupRecordingChunks();

  const recordingsUpload = multer({
    dest: getTmpDir(),
    limits: { fileSize: 3 * 1024 * 1024 * 1024 }, // 3GB for long screen recordings
  });

  const recordingsChunkUpload = multer({
    dest: getTmpDir(),
    limits: { fileSize: 512 * 1024 * 1024 },
  });

  const mergeRecordingChunks = async (chunkDir: string, outputPath: string) => {
    const chunkFiles = fs.readdirSync(chunkDir)
      .filter(name => name.startsWith('chunk-') && name.endsWith('.webm'))
      .sort((a, b) => {
        const aIndex = Number(a.replace('chunk-', '').replace('.webm', ''));
        const bIndex = Number(b.replace('chunk-', '').replace('.webm', ''));
        return aIndex - bIndex;
      });

    if (chunkFiles.length === 0) {
      throw new Error('no_chunks');
    }

    const listPath = path.join(chunkDir, 'concat.txt');
    const listContent = chunkFiles
      .map(file => `file '${path.join(chunkDir, file).replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(listPath, listContent);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  };

  // Legacy: upload chunks and merge into a single recording on the server.
  // Kept for backwards compatibility, but not used by the current ScreenRecorder implementation.
  app.post("/api/recordings/chunk-merge", requireAuth, recordingsChunkUpload.single('file'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const file = req.file;
      const { sessionId, chunkIndex, isFinal } = req.body;

      if (!file || !sessionId || typeof chunkIndex === 'undefined') {
        return res.status(400).json({ error: 'Missing chunk data' });
      }

      const safeSessionId = sanitizeChunkId(String(sessionId));
      if (!safeSessionId) {
        return res.status(400).json({ error: 'Invalid sessionId' });
      }

      const index = Number.parseInt(String(chunkIndex), 10);
      if (!Number.isFinite(index) || index < 0) {
        return res.status(400).json({ error: 'Invalid chunkIndex' });
      }

      const chunkDir = path.join(RECORDINGS_CHUNKS_DIR, `${userId}-${safeSessionId}`);
      if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir, { recursive: true });
      }

      const chunkPath = path.join(chunkDir, `chunk-${index}.webm`);
      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(file.path);
      } else {
        fs.renameSync(file.path, chunkPath);
      }

      const chunkId = `${safeSessionId}-${index}`;

      if (String(isFinal).toLowerCase() !== 'true') {
        return res.json({ success: true, chunkId });
      }

      const outputTemp = tmpPath(`recording_${safeSessionId}.webm`);
      await mergeRecordingChunks(chunkDir, outputTemp);

      const storageTarget = resolveStorageTarget(req.user!, {
        scope: req.body.storageScope,
        workspaceId: req.body.workspaceId,
        projectId: req.body.projectId,
      });

      const baseDir = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? path.join(RECORDINGS_DIR, `workspace-${storageTarget.workspaceId}`)
        : path.join(RECORDINGS_DIR, userId.toString());
      const projectDir = storageTarget.scope === 'workspace'
        ? (storageTarget.projectId || 'root')
        : 'root';
      const targetDir = path.join(baseDir, projectDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const recordingId = crypto.randomUUID();
      const filename = `${recordingId}.webm`;
      const filePath = path.join(targetDir, filename);
      fs.renameSync(outputTemp, filePath);

      const stats = fs.statSync(filePath);

      let duration: number | undefined;
      try {
        duration = await new Promise<number>((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err || !metadata.format.duration) {
              resolve(0);
            } else {
              resolve(metadata.format.duration);
            }
          });
        });
      } catch {
        duration = undefined;
      }

      const recording = createRecording(
        userId,
        recordingId,
        filename,
        `aufnahme-${Date.now()}.webm`,
        filePath,
        stats.size,
        'video/webm',
        duration,
        storageTarget.scope,
        storageTarget.workspaceId || null,
        storageTarget.projectId || null
      );

      createAuditLog(userId, 'recording_upload_chunked', 'success', recording.id, null, hashIP(req.ip || ''));

      try {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      res.json({
        success: true,
        chunkId,
        recording: {
          id: recording.id,
          originalName: recording.original_name,
          size: recording.file_size,
          duration: recording.duration_seconds,
          createdAt: recording.created_at,
          expiresAt: recording.expires_at,
        }
      });
    } catch (error) {
      console.error("[Recordings] Chunk upload error:", error);
      const message = (error as Error).message;
      if (message === 'workspace_forbidden' || message === 'project_forbidden') {
        return res.status(403).json({ error: "Kein Zugriff auf den Workspace/Ordner" });
      }
      res.status(500).json({ error: "Fehler beim Speichern der Aufnahme" });
    }
  });

  // Upload a recording (after transcription)
  app.post("/api/recordings", requireAuth, recordingsUpload.single('file'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const file = req.file;
      const ipHash = hashIP(req.ip || '');

      if (!file) {
        createAuditLog(userId, 'recording_upload', 'failure', '/api/recordings', {
          reason: 'missing_file'
        }, ipHash);
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }

      // Validate file type (magic bytes + declared MIME fallback)
      const allowedTypes = new Set([...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES]);
      const declaredMime = (file.mimetype || '').split(';')[0].trim();
      const validation = await validateFileType(file.path, allowedTypes, declaredMime);
      if (!validation.valid) {
        const allowDeclared = declaredMime && allowedTypes.has(declaredMime);
        if (!validation.detectedType && allowDeclared) {
          console.warn('[Recordings] Magic bytes missing; allowing declared MIME.', {
            userId,
            declaredMime,
            originalName: file.originalname,
            size: file.size
          });
        } else {
          try { fs.unlinkSync(file.path); } catch {}
          createAuditLog(userId, 'recording_upload', 'failure', '/api/recordings', {
            reason: 'invalid_type',
            declaredMime,
            detectedMime: validation.detectedType,
            error: validation.error,
            originalName: file.originalname,
            size: file.size
          }, ipHash);
          return res.status(400).json({ error: "Ungültiger Dateityp" });
        }
      }

      const storageTarget = resolveStorageTarget(req.user!, {
        scope: req.body.storageScope,
        workspaceId: req.body.workspaceId,
        projectId: req.body.projectId,
      });

      const baseDir = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? path.join(RECORDINGS_DIR, `workspace-${storageTarget.workspaceId}`)
        : path.join(RECORDINGS_DIR, userId.toString());
      const projectDir = storageTarget.scope === 'workspace'
        ? (storageTarget.projectId || 'root')
        : 'root';
      const targetDir = path.join(baseDir, projectDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Generate unique filename
      const recordingId = crypto.randomUUID();
      const ext = safeExtensionFromOriginalName(file.originalname) || '.webm';
      const filename = `${recordingId}${ext}`;
      const filePath = path.join(targetDir, filename);

      // Move file to recordings directory
      fs.renameSync(file.path, filePath);

      // Get duration if it's a video
      let duration: number | undefined;
      try {
        duration = await new Promise<number>((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err || !metadata.format.duration) {
              resolve(0);
            } else {
              resolve(metadata.format.duration);
            }
          });
        });
      } catch {
        duration = undefined;
      }

      // Create database entry
      const recording = createRecording(
        userId,
        recordingId,
        filename,
        file.originalname,
        filePath,
        file.size,
        file.mimetype,
        duration,
        storageTarget.scope,
        storageTarget.workspaceId || null,
        storageTarget.projectId || null
      );

      // Audit log
      createAuditLog(userId, 'recording_upload', 'success', recording.id, null, hashIP(req.ip || ''));

      res.json({
        success: true,
        recording: {
          id: recording.id,
          originalName: recording.original_name,
          size: recording.file_size,
          duration: recording.duration_seconds,
          createdAt: recording.created_at,
          expiresAt: recording.expires_at
        }
      });
    } catch (error) {
      console.error("[Recordings] Upload error:", error);
      const message = (error as Error).message;
      if (message === 'workspace_forbidden' || message === 'project_forbidden') {
        return res.status(403).json({ error: "Kein Zugriff auf den Workspace/Ordner" });
      }
      res.status(500).json({ error: "Fehler beim Speichern der Aufnahme" });
    }
  });

  // List user's recordings
  app.get("/api/recordings", requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const scope = req.query.scope === 'workspace' ? 'workspace' : 'user';
      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;

      let recordings = [];
      if (scope === 'workspace') {
        if (!workspaceId) {
          return res.status(400).json({ error: "workspaceId fehlt" });
        }
        recordings = getWorkspaceRecordings(workspaceId, projectId);
      } else {
        recordings = getUserRecordings(userId);
      }

      res.json({
        recordings: recordings.map(r => ({
          id: r.id,
          originalName: r.original_name,
          size: r.file_size,
          mimeType: r.mime_type,
          duration: r.duration_seconds,
          createdAt: r.created_at,
          expiresAt: r.expires_at
        }))
      });
    } catch (error) {
      console.error("[Recordings] List error:", error);
      res.status(500).json({ error: "Fehler beim Laden der Aufnahmen" });
    }
  });

  // Download a recording
  app.get("/api/recordings/:id/download", requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const recordingId = req.params.id;

      const recording = getRecordingByIdForUser(recordingId, userId);
      if (!recording) {
        return res.status(404).json({ error: "Aufnahme nicht gefunden" });
      }

      if (!fs.existsSync(recording.file_path)) {
        return res.status(404).json({ error: "Datei nicht gefunden" });
      }

      res.download(recording.file_path, recording.original_name);
    } catch (error) {
      console.error("[Recordings] Download error:", error);
      res.status(500).json({ error: "Fehler beim Herunterladen" });
    }
  });

  // Delete a recording
  app.delete("/api/recordings/:id", requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const recordingId = req.params.id;

      const recording = getRecordingByIdForUser(recordingId, userId);
      if (!recording) {
        return res.status(404).json({ error: "Aufnahme nicht gefunden" });
      }

      // Delete file
      if (fs.existsSync(recording.file_path)) {
        fs.unlinkSync(recording.file_path);
      }

      // Delete database entry
      if (recording.storage_scope === 'workspace' && recording.workspace_id) {
        deleteWorkspaceRecording(recordingId, recording.workspace_id);
      } else {
        deleteRecordingForUser(recordingId, userId);
      }

      // Audit log
      createAuditLog(userId, 'recording_delete', 'success', recordingId, null, hashIP(req.ip || ''));

      res.json({ success: true });
    } catch (error) {
      console.error("[Recordings] Delete error:", error);
      res.status(500).json({ error: "Fehler beim Löschen" });
    }
  });

  // Chunked recording upload - for large files that need to be split (e.g., due to proxy limits)
  const CHUNKS_DIR = path.join(DATA_DIR, 'recording-chunks');
  if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
  }

  const RECORDINGS_CHUNK_RAW_LIMIT_BYTES =
    Math.max(5, Math.min(256, Number(process.env.RECORDINGS_CHUNK_RAW_LIMIT_MB || 128))) * 1024 * 1024;

  const cleanupChunkSessions = () => {
    try {
      const now = Date.now();
      const entries = fs.readdirSync(CHUNKS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(CHUNKS_DIR, entry.name);
        try {
          const stats = fs.statSync(entryPath);
          if (now - stats.mtimeMs > RECORDINGS_CHUNK_MAX_AGE_MS) {
            if (entry.isDirectory()) {
              fs.rmSync(entryPath, { recursive: true, force: true });
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
              fs.unlinkSync(entryPath);
            }
          }
        } catch {
          // Ignore cleanup failures
        }
      }
    } catch {
      // Ignore cleanup failures
    }
  };

  setInterval(cleanupChunkSessions, 60 * 60 * 1000);
  cleanupChunkSessions();

  interface ChunkMetadata {
    sessionId: string;
    userId: number;
    chunks: Array<{
      chunkIndex: number;
      chunkId: string;
      filename: string;
      startTime: number;
      endTime: number;
      size: number;
      uploadedAt: string;
    }>;
    storageScope: string;
    workspaceId?: string;
    projectId?: string;
    createdAt: string;
    completedAt?: string;
  }

  function getChunkSessionPath(sessionId: string): string {
    return path.join(CHUNKS_DIR, `${sessionId}.json`);
  }

  function loadChunkSession(sessionId: string): ChunkMetadata | null {
    const sessionPath = getChunkSessionPath(sessionId);
    if (!fs.existsSync(sessionPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  function saveChunkSession(session: ChunkMetadata): void {
    const sessionPath = getChunkSessionPath(session.sessionId);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }

  const chunkSessionLocks = new Map<string, Promise<void>>();

  const withChunkSessionLock = async <T,>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
    const prev = chunkSessionLocks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const curr = new Promise<void>((resolve) => {
      release = resolve;
    });
    chunkSessionLocks.set(sessionId, curr);

    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
      if (chunkSessionLocks.get(sessionId) === curr) {
        chunkSessionLocks.delete(sessionId);
      }
    }
  };

  const extensionFromContentType = (contentType: string | undefined): string => {
    const ct = (contentType || '').split(';')[0].trim().toLowerCase();
    if (ct === 'video/mp4') return '.mp4';
    if (ct === 'audio/mpeg') return '.mp3';
    if (ct === 'audio/wav' || ct === 'audio/x-wav') return '.wav';
    // Default: our ScreenRecorder uploads WebM.
    return '.webm';
  };

  const mimeTypeFromExtension = (ext: string): string => {
    const normalized = ext.toLowerCase();
    if (normalized === '.mp4') return 'video/mp4';
    if (normalized === '.mp3') return 'audio/mpeg';
    if (normalized === '.wav') return 'audio/wav';
    return 'video/webm';
  };

  const mergeChunkPaths = async (chunkPaths: string[], outputPath: string) => {
    const listPath = tmpPath(`recording_chunks_${Date.now()}.txt`);
    const listContent = chunkPaths
      .map((chunkPath) => `file '${chunkPath.replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(listPath, listContent);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(listPath)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c copy'])
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(outputPath);
      });
    } finally {
      try { fs.unlinkSync(listPath); } catch {}
    }
  };

  // Proxy-friendly raw chunk upload endpoint (no multipart boundaries, explicit media type).
  app.post(
    "/api/recordings/chunk-raw",
    requireAuth,
    express.raw({ type: () => true, limit: RECORDINGS_CHUNK_RAW_LIMIT_BYTES }),
    async (req, res) => {
      const userId = req.user!.id;
      const ipHash = hashIP(req.ip || '');

      const q = (value: unknown) => (typeof value === 'string' ? value : (Array.isArray(value) ? value[0] : ''));

      const sessionIdRaw = q(req.query.sessionId);
      const chunkIndexRaw = q(req.query.chunkIndex);
      const startTimeRaw = q(req.query.startTime);
      const endTimeRaw = q(req.query.endTime);
      const isFinalRaw = q(req.query.isFinal);
      const storageScope = q(req.query.storageScope) || 'user';
      const workspaceId = q(req.query.workspaceId) || undefined;
      const projectId = q(req.query.projectId) || undefined;

      if (!sessionIdRaw || chunkIndexRaw === '') {
        return res.status(400).json({ error: "sessionId und chunkIndex sind erforderlich" });
      }

      const safeSessionId = sanitizeChunkId(String(sessionIdRaw));
      if (!safeSessionId) {
        return res.status(400).json({ error: 'Invalid sessionId' });
      }

      const chunkIdx = Number.parseInt(String(chunkIndexRaw), 10);
      if (!Number.isFinite(chunkIdx) || chunkIdx < 0) {
        return res.status(400).json({ error: 'Invalid chunkIndex' });
      }

      const startTimeSec = Number.parseFloat(String(startTimeRaw)) || 0;
      const endTimeSec = Number.parseFloat(String(endTimeRaw)) || 0;
      const isFinal = String(isFinalRaw).toLowerCase() === 'true';

      // Write body to a temp file first so we can validate it like the multipart endpoint.
      const declaredMime = (req.headers['content-type'] as string | undefined)?.split(';')[0].trim() || '';
      const ext = extensionFromContentType(declaredMime);
      const tmpFilePath = tmpPath(`recording_chunk_${safeSessionId}_${chunkIdx}_${Date.now()}${ext}`);

      try {
        const body = req.body as Buffer | undefined;
        if (!body || !Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ error: "Keine Daten empfangen" });
        }

        fs.writeFileSync(tmpFilePath, body);

        // Validate file type
        const allowedTypes = new Set([...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES]);
        const validation = await validateFileType(tmpFilePath, allowedTypes, declaredMime);
        if (!validation.valid) {
          const allowDeclared = declaredMime && allowedTypes.has(declaredMime);
          if (!allowDeclared) {
            try { fs.unlinkSync(tmpFilePath); } catch {}
            createAuditLog(userId, 'chunk_upload', 'failure', '/api/recordings/chunk-raw', {
              reason: 'invalid_type',
              declaredMime,
              detectedMime: validation.detectedType
            }, ipHash);
            return res.status(400).json({ error: "Ungültiger Dateityp" });
          }
        }

        const result = await withChunkSessionLock(safeSessionId, async () => {
          // Load existing session metadata first to validate ownership before touching any files.
          let session = loadChunkSession(safeSessionId);
          if (session && session.userId !== userId) {
            // Session collision (extremely unlikely): don't leak and don't write files.
            throw new Error('session_forbidden');
          }

          // Create session directory if needed
          const sessionDir = path.join(CHUNKS_DIR, safeSessionId);
          if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
          }

          // Move temp file into the session folder
          const chunkFilename = `chunk-${chunkIdx}${ext}`;
          const chunkPath = path.join(sessionDir, chunkFilename);
          try { fs.unlinkSync(chunkPath); } catch {}
          fs.renameSync(tmpFilePath, chunkPath);

          const chunkId = crypto.randomUUID();

          // Create session metadata if needed
          if (!session) {
            session = {
              sessionId: safeSessionId,
              userId,
              chunks: [],
              storageScope,
              workspaceId,
              projectId,
              createdAt: new Date().toISOString(),
            };
          }

          // Upsert chunk info by index (avoid duplicates on retries)
          session.chunks = session.chunks.filter(c => c.chunkIndex !== chunkIdx);
          session.chunks.push({
            chunkIndex: chunkIdx,
            chunkId,
            filename: chunkFilename,
            startTime: startTimeSec,
            endTime: endTimeSec,
            size: body.length,
            uploadedAt: new Date().toISOString(),
          });

          session.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

          if (isFinal) {
            session.completedAt = new Date().toISOString();
          }

          saveChunkSession(session);

          createAuditLog(userId, 'chunk_upload', 'success', chunkId, {
            sessionId: safeSessionId,
            chunkIndex: chunkIdx,
            size: body.length,
            isFinal,
            uploadType: 'raw',
          }, ipHash);

          return {
            chunkId,
            sessionId: safeSessionId,
            chunkIndex: chunkIdx,
            totalChunks: session.chunks.length,
            isComplete: !!session.completedAt,
          };
        });

        res.json({ success: true, ...result });
      } catch (error) {
        const message = (error as Error)?.message || 'unknown';
        if (message === 'session_forbidden') {
          return res.status(403).json({ error: "Kein Zugriff auf diese Session" });
        }
        console.error("[Chunks] Raw upload error:", error);
        try { fs.unlinkSync(tmpFilePath); } catch {}
        res.status(500).json({ error: "Fehler beim Chunk-Upload" });
      }
    }
  );

  app.post("/api/recordings/chunk", requireAuth, recordingsUpload.single('file'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const file = req.file;
      const ipHash = hashIP(req.ip || '');

      if (!file) {
        createAuditLog(userId, 'chunk_upload', 'failure', '/api/recordings/chunk', {
          reason: 'missing_file'
        }, ipHash);
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }

      const { sessionId, chunkIndex, startTime, endTime, isFinal, storageScope, workspaceId, projectId } = req.body;

      if (!sessionId || chunkIndex === undefined) {
        try { fs.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: "sessionId und chunkIndex sind erforderlich" });
      }

      const safeSessionId = sanitizeChunkId(String(sessionId));
      if (!safeSessionId) {
        try { fs.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: 'Invalid sessionId' });
      }

      const chunkIdx = Number.parseInt(String(chunkIndex), 10);
      if (!Number.isFinite(chunkIdx) || chunkIdx < 0) {
        try { fs.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: 'Invalid chunkIndex' });
      }
      const startTimeSec = parseFloat(startTime) || 0;
      const endTimeSec = parseFloat(endTime) || 0;

      // Validate file type
      const allowedTypes = new Set([...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES]);
      const declaredMime = (file.mimetype || '').split(';')[0].trim();
      const validation = await validateFileType(file.path, allowedTypes, declaredMime);
      if (!validation.valid) {
        const allowDeclared = declaredMime && allowedTypes.has(declaredMime);
        if (!allowDeclared) {
          try { fs.unlinkSync(file.path); } catch {}
          createAuditLog(userId, 'chunk_upload', 'failure', '/api/recordings/chunk', {
            reason: 'invalid_type',
            declaredMime,
            detectedMime: validation.detectedType
          }, ipHash);
          return res.status(400).json({ error: "Ungültiger Dateityp" });
        }
      }

      const result = await withChunkSessionLock(safeSessionId, async () => {
        // Load existing session metadata first to validate ownership before touching any files.
        let session = loadChunkSession(safeSessionId);
        if (session && session.userId !== userId) {
          throw new Error('session_forbidden');
        }

        // Create session directory if needed
        const sessionDir = path.join(CHUNKS_DIR, safeSessionId);
        if (!fs.existsSync(sessionDir)) {
          fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Generate chunk ID and move file
        const chunkId = crypto.randomUUID();
        const ext = safeExtensionFromOriginalName(file.originalname) || '.webm';
        const chunkFilename = `chunk-${chunkIdx}${ext}`;
        const chunkPath = path.join(sessionDir, chunkFilename);
        try { fs.unlinkSync(chunkPath); } catch {}
        fs.renameSync(file.path, chunkPath);

        // Create session metadata if needed
        if (!session) {
          session = {
            sessionId: safeSessionId,
            userId,
            chunks: [],
            storageScope: storageScope || 'user',
            workspaceId: workspaceId || undefined,
            projectId: projectId || undefined,
            createdAt: new Date().toISOString(),
          };
        }

        // Upsert chunk info by index (avoid duplicates on retries)
        session.chunks = session.chunks.filter(c => c.chunkIndex !== chunkIdx);
        session.chunks.push({
          chunkIndex: chunkIdx,
          chunkId,
          filename: chunkFilename,
          startTime: startTimeSec,
          endTime: endTimeSec,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });

        // Sort chunks by index
        session.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        // Mark as completed if this is the final chunk
        if (isFinal === 'true' || isFinal === true) {
          session.completedAt = new Date().toISOString();
        }

        saveChunkSession(session);

        console.log(`[Chunks] Chunk ${chunkIdx} uploaded for session ${safeSessionId} (${(file.size / 1024 / 1024).toFixed(1)}MB, final=${isFinal})`);

        createAuditLog(userId, 'chunk_upload', 'success', chunkId, {
          sessionId: safeSessionId,
          chunkIndex: chunkIdx,
          size: file.size,
          isFinal
        }, ipHash);

        return {
          chunkId,
          sessionId: safeSessionId,
          chunkIndex: chunkIdx,
          totalChunks: session.chunks.length,
          isComplete: !!session.completedAt,
        };
      });

      res.json({ success: true, ...result });
    } catch (error) {
      const message = (error as Error)?.message || 'unknown';
      if (message === 'session_forbidden') {
        try {
          const uploaded = (req as any).file?.path as string | undefined;
          if (uploaded) fs.unlinkSync(uploaded);
        } catch {
          // ignore
        }
        return res.status(403).json({ error: "Kein Zugriff auf diese Session" });
      }
      console.error("[Chunks] Upload error:", error);
      res.status(500).json({ error: "Fehler beim Chunk-Upload" });
    }
  });

  // Get chunk session status
  app.get("/api/recordings/chunk/:sessionId", requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const safeSessionId = sanitizeChunkId(String(req.params.sessionId || ''));
      if (!safeSessionId) {
        return res.status(400).json({ error: "Ungültige Session-ID" });
      }

      const session = loadChunkSession(safeSessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session nicht gefunden" });
      }

      res.json({
        sessionId: session.sessionId,
        totalChunks: session.chunks.length,
        chunks: session.chunks.map(c => ({
          chunkIndex: c.chunkIndex,
          chunkId: c.chunkId,
          startTime: c.startTime,
          endTime: c.endTime,
          size: c.size,
        })),
        isComplete: !!session.completedAt,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      });
    } catch (error) {
      console.error("[Chunks] Status error:", error);
      res.status(500).json({ error: "Fehler beim Laden der Session" });
    }
  });

  // Merge uploaded chunks into a stored recording and create the DB entry.
  app.post("/api/recordings/chunk/:sessionId/save", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const safeSessionId = sanitizeChunkId(String(req.params.sessionId || ''));
    if (!safeSessionId) {
      return res.status(400).json({ error: "Ungültige Session-ID" });
    }

    let tempOutputPath: string | null = null;
    try {
      const result = await withChunkSessionLock(safeSessionId, async () => {
        const session = loadChunkSession(safeSessionId);
        if (!session || session.userId !== userId) {
          throw new Error('session_not_found');
        }
        if (!session.completedAt) {
          throw new Error('session_incomplete');
        }
        if (session.chunks.length === 0) {
          throw new Error('no_chunks');
        }

        const sortedChunks = [...session.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
        const chunksWithPaths = sortedChunks.map((chunk) => ({
          chunk,
          chunkPath: path.join(CHUNKS_DIR, safeSessionId, chunk.filename),
        }));
        const missingChunk = chunksWithPaths.find(({ chunkPath }) => !fs.existsSync(chunkPath));
        if (missingChunk) {
          throw new Error('missing_chunk_file');
        }

        const outputExt = path.extname(chunksWithPaths[0].chunk.filename) || '.webm';
        tempOutputPath = tmpPath(`recording_chunked_${safeSessionId}_${Date.now()}${outputExt}`);
        await mergeChunkPaths(chunksWithPaths.map(({ chunkPath }) => chunkPath), tempOutputPath);

        const storageTarget = resolveStorageTarget(req.user!, {
          scope: session.storageScope,
          workspaceId: session.workspaceId,
          projectId: session.projectId,
        });

        const baseDir = storageTarget.scope === 'workspace' && storageTarget.workspaceId
          ? path.join(RECORDINGS_DIR, `workspace-${storageTarget.workspaceId}`)
          : path.join(RECORDINGS_DIR, userId.toString());
        const projectDir = storageTarget.scope === 'workspace'
          ? (storageTarget.projectId || 'root')
          : 'root';
        const targetDir = path.join(baseDir, projectDir);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const recordingId = crypto.randomUUID();
        const filename = `${recordingId}${outputExt}`;
        const filePath = path.join(targetDir, filename);
        fs.renameSync(tempOutputPath, filePath);
        tempOutputPath = null;

        const stats = fs.statSync(filePath);

        let duration: number | undefined;
        try {
          duration = await new Promise<number>((resolve) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
              if (err || !metadata.format.duration) {
                resolve(0);
              } else {
                resolve(metadata.format.duration);
              }
            });
          });
        } catch {
          duration = undefined;
        }

        const originalName = `aufnahme-${Date.now()}${outputExt}`;
        const recording = createRecording(
          userId,
          recordingId,
          filename,
          originalName,
          filePath,
          stats.size,
          mimeTypeFromExtension(outputExt),
          duration,
          storageTarget.scope,
          storageTarget.workspaceId || null,
          storageTarget.projectId || null
        );

        createAuditLog(userId, 'recording_upload_chunked', 'success', recording.id, {
          sessionId: safeSessionId,
          chunks: chunksWithPaths.length,
          size: stats.size,
        }, hashIP(req.ip || ''));

        try {
          fs.rmSync(path.join(CHUNKS_DIR, safeSessionId), { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
        try {
          fs.unlinkSync(getChunkSessionPath(safeSessionId));
        } catch {
          // Ignore cleanup errors
        }

        return {
          id: recording.id,
          originalName: recording.original_name,
          size: recording.file_size,
          duration: recording.duration_seconds,
          createdAt: recording.created_at,
          expiresAt: recording.expires_at,
        };
      });

      return res.json({ success: true, recording: result });
    } catch (error) {
      if (tempOutputPath) {
        try { fs.unlinkSync(tempOutputPath); } catch {}
      }
      const message = (error as Error).message;
      if (message === 'session_not_found') {
        return res.status(404).json({ error: "Session nicht gefunden" });
      }
      if (message === 'session_incomplete') {
        return res.status(409).json({ error: "Upload noch nicht abgeschlossen" });
      }
      if (message === 'no_chunks') {
        return res.status(400).json({ error: "Keine Chunks vorhanden" });
      }
      if (message === 'missing_chunk_file') {
        return res.status(409).json({ error: "Chunk-Dateien unvollständig" });
      }
      if (message === 'workspace_forbidden' || message === 'project_forbidden') {
        return res.status(403).json({ error: "Kein Zugriff auf den Workspace/Ordner" });
      }
      console.error("[Chunks] Save error:", error);
      return res.status(500).json({ error: "Fehler beim Speichern der Aufnahme" });
    }
  });

  // Merge chunks and create transcription job
  app.post("/api/recordings/chunk/:sessionId/transcribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const safeSessionId = sanitizeChunkId(String(req.params.sessionId || ''));
      if (!safeSessionId) {
        return res.status(400).json({ error: "Ungültige Session-ID" });
      }
      const { language, notifyEmail } = req.body;
      const ipHash = hashIP(req.ip || '');

      const session = loadChunkSession(safeSessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: "Session nicht gefunden" });
      }

      if (session.chunks.length === 0) {
        return res.status(400).json({ error: "Keine Chunks vorhanden" });
      }

      // Create transcription jobs for each chunk (parallel processing).
      // NOTE: This is currently not wired into the UI flow, but we keep it correct & safe.
      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        return res.status(503).json({ error: "Job-Warteschlange nicht verfügbar" });
      }

      const storageTarget = resolveStorageTarget(req.user!, {
        scope: session.storageScope,
        workspaceId: session.workspaceId,
        projectId: session.projectId,
      });

      const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(req.user!)
        : getOrCreateDefaultWorkspaceForUser(req.user!);

      const planId = workspace.plan_id as PlanId;
      const wallet = ensureCreditWallet(workspace.id, planId);

      const safeNotifyEmail = typeof notifyEmail === 'string' && notifyEmail.includes('@')
        ? notifyEmail
        : undefined;

      const priority = getPriorityForSubscription(req.user?.subscription || 'free');

      const chunksWithPaths = session.chunks
        .map((chunk) => ({
          chunk,
          chunkPath: path.join(CHUNKS_DIR, safeSessionId, chunk.filename),
        }))
        .filter(({ chunkPath }) => fs.existsSync(chunkPath));

      if (chunksWithPaths.length === 0) {
        return res.status(400).json({ error: "Keine Chunk-Dateien gefunden" });
      }

      const durationsSeconds = chunksWithPaths.map(({ chunk }) => Math.max(0, (chunk.endTime || 0) - (chunk.startTime || 0)));
      const totalDurationSeconds = durationsSeconds.reduce((sum, v) => sum + v, 0);
      const totalMinutes = Math.max(1, Math.ceil(totalDurationSeconds / 60));
      const totalCredits = totalMinutes * CREDIT_COSTS.ASR_MINUTE.credits;

      if (totalCredits > 0 && wallet.balance < totalCredits) {
        return res.status(402).json({ error: "Nicht genug Credits" });
      }

      const allocateMinutes = (durations: number[], total: number) => {
        const count = durations.length;
        if (count === 0) return [];
        const sumSeconds = durations.reduce((s, v) => s + v, 0);
        if (!Number.isFinite(sumSeconds) || sumSeconds <= 0) {
          const fallback = new Array(count).fill(0);
          fallback[0] = total;
          return fallback;
        }

        const exact = durations.map((sec) => (sec / sumSeconds) * total);
        const minutes = exact.map((v) => Math.floor(v));
        let remaining = total - minutes.reduce((s, v) => s + v, 0);
        const remainders = exact
          .map((v, i) => ({ i, r: v - minutes[i] }))
          .sort((a, b) => b.r - a.r);
        for (let k = 0; k < remainders.length && remaining > 0; k++) {
          minutes[remainders[k].i] += 1;
          remaining -= 1;
        }
        return minutes;
      };

      const minutesAllocation = allocateMinutes(durationsSeconds, totalMinutes);
      const { nanoid } = await import('nanoid');

      const jobIds: string[] = [];
      const reservedCredits: Array<{ jobId: string; credits: number }> = [];

      try {
        for (let i = 0; i < chunksWithPaths.length; i++) {
          const { chunk, chunkPath } = chunksWithPaths[i];
          const minutes = minutesAllocation[i] || 0;
          const estimatedCredits = Math.max(0, Math.floor(minutes * CREDIT_COSTS.ASR_MINUTE.credits));
          const jobId = `transcription_${nanoid(12)}`;
          const originalName = `chunk-${chunk.chunkIndex}.webm`;
          const mimeType = "video/webm";
          const chunkDurationSeconds = Math.max(0, (chunk.endTime || 0) - (chunk.startTime || 0));

	          if (estimatedCredits > 0) {
	            reserveCredits(workspace.id, estimatedCredits, jobId, {
	              costKey: 'ASR_MINUTE',
	              minutes,
	              durationSeconds: chunkDurationSeconds,
	              sessionId: safeSessionId,
	              chunkIndex: chunk.chunkIndex,
	            });
	            reservedCredits.push({ jobId, credits: estimatedCredits });
	          }

          createJob({
            id: jobId,
            queue: 'transcription',
            userId: req.userId!,
            storageScope: storageTarget.scope,
            workspaceId: workspace.id,
            projectId: storageTarget.projectId || null,
            jobType: 'ASR_MINUTE',
            estimatedCredits,
            priority,
            inputData: {
              originalName,
              mimeType,
              language: language || 'auto',
              notifyEmail: safeNotifyEmail || null,
              durationSeconds: chunkDurationSeconds,
	              minutes,
	              chunkInfo: {
	                sessionId: safeSessionId,
	                chunkIndex: chunk.chunkIndex,
	                startTime: chunk.startTime,
	                endTime: chunk.endTime,
	              },
            },
            expiresInHours: 24,
          });

          await transcriptionQueue.add(
            'transcribe',
            {
              jobId,
              userId: req.userId!,
              inputFilePath: chunkPath,
              originalName,
              mimeType,
              notifyEmail: safeNotifyEmail,
              storageScope: storageTarget.scope,
              workspaceId: workspace.id,
              projectId: storageTarget.projectId || null,
            },
            { jobId, priority }
          );

          jobIds.push(jobId);
        }
      } catch (error) {
        for (const entry of reservedCredits) {
          try { releaseCredits(workspace.id, entry.credits, entry.jobId, { status: 'enqueue_failed' }); } catch {}
        }
        throw error;
      }

	      createAuditLog(userId, 'chunk_transcription', 'success', safeSessionId, {
	        chunkCount: session.chunks.length,
	        jobIds,
	      }, ipHash);

	      console.log(`[Chunks] Created ${jobIds.length} transcription jobs for session ${safeSessionId}`);

	      res.json({
	        success: true,
	        sessionId: safeSessionId,
	        jobIds,
	        chunkCount: session.chunks.length,
	      });
    } catch (error) {
      console.error("[Chunks] Transcription error:", error);
      res.status(500).json({ error: "Fehler beim Starten der Transkription" });
    }
  });

  // Queue status endpoint - returns waiting jobs and estimated wait time
  app.get("/api/queue/status", async (_req, res) => {
    try {
      const { getQueueStats } = await import('./queue');

      const [transcription, pdfua, ollama, video, podcast, pptxSummary, subtitleEmbed] = await Promise.all([
        getQueueStats('transcription'),
        getQueueStats('pdfua'),
        getQueueStats('ollama'),
        getQueueStats('video'),
        getQueueStats('podcast'),
        getQueueStats('pptx-summary'),
        getQueueStats('subtitle-embed'),
      ]);

      res.json({
        transcription: {
          ...transcription,
          estimatedWaitMinutes: Math.ceil(transcription.estimatedWaitSeconds / 60),
        },
        pdfua: {
          ...pdfua,
          estimatedWaitMinutes: Math.ceil(pdfua.estimatedWaitSeconds / 60),
        },
        ollama: {
          ...ollama,
          estimatedWaitMinutes: Math.ceil(ollama.estimatedWaitSeconds / 60),
        },
        video: {
          ...video,
          estimatedWaitMinutes: Math.ceil(video.estimatedWaitSeconds / 60),
        },
        podcast: {
          ...podcast,
          estimatedWaitMinutes: Math.ceil(podcast.estimatedWaitSeconds / 60),
        },
        "pptx-summary": {
          ...pptxSummary,
          estimatedWaitMinutes: Math.ceil(pptxSummary.estimatedWaitSeconds / 60),
        },
        "subtitle-embed": {
          ...subtitleEmbed,
          estimatedWaitMinutes: Math.ceil(subtitleEmbed.estimatedWaitSeconds / 60),
        },
      });
    } catch (error) {
      // Redis not available - return empty stats
      res.json({
        transcription: { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
        pdfua: { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
        ollama: { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
        video: { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
        podcast: { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
        "pptx-summary": { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
        "subtitle-embed": { waiting: 0, active: 0, estimatedWaitMinutes: 0 },
      });
    }
  });

  // Get position of a specific job in a queue
  app.get("/api/queue/position/:queueName/:jobId", requireAuth, async (req, res) => {
    // Polled frequently. Avoid conditional 304 responses (breaks fetch().json()).
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("ETag", String(Date.now()));
    try {
      const { queueName, jobId } = req.params;
      const { getJobPosition, getQueueStats } = await import('./queue');

      const [position, stats] = await Promise.all([
        getJobPosition(queueName, jobId),
        getQueueStats(queueName),
      ]);

      const estimateWaitMinutes = (pos: number) => (
        pos > 0 && (stats.waiting + stats.active) > 0
          ? Math.ceil((pos * stats.estimatedWaitSeconds / Math.max(1, stats.waiting + stats.active)))
          : 0
      );

      if (position === null) {
        const userId = req.userId;
        const jobRecord = typeof userId === "number" ? getJobForUserOrWorkspace(jobId, userId) : null;

        if (jobRecord && jobRecord.queue === queueName) {
          if (jobRecord.status === "completed" || jobRecord.status === "failed") {
            return res.json({
              position: -1,
              isProcessing: false,
              isDone: true,
              totalWaiting: stats.waiting,
              estimatedWaitMinutes: 0,
            });
          }

          if (jobRecord.status === "active") {
            return res.json({
              position: 0,
              isProcessing: true,
              isDone: false,
              totalWaiting: stats.waiting,
              estimatedWaitMinutes: 0,
            });
          }

          // Pending job exists in the DB but not (yet) visible in Bull.
          const pendingPosition = stats.waiting > 0 ? stats.waiting : 1;
          return res.json({
            position: pendingPosition,
            isProcessing: false,
            isDone: false,
            totalWaiting: stats.waiting,
            estimatedWaitMinutes: estimateWaitMinutes(pendingPosition),
          });
        }

        return res.status(404).json({ error: "Job nicht gefunden" });
      }

      res.json({
        position,
        isProcessing: position === 0,
        isDone: position === -1,
        totalWaiting: stats.waiting,
        estimatedWaitMinutes: estimateWaitMinutes(position),
      });
    } catch (error) {
      res.status(500).json({ error: "Queue-Status nicht verfügbar" });
    }
  });

  // Helper function to extract and compress audio for OpenAI (max 25MB)
  const extractAudioForOpenAI = (inputPath: string, outputPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('mp3')
        .audioCodec('libmp3lame')
        .audioBitrate('64k')  // Low bitrate for speech (still good quality)
        .audioChannels(1)     // Mono for speech
        .audioFrequency(16000) // 16kHz is optimal for Whisper
        .on('start', (cmd) => console.log('[FFmpeg] Extracting audio:', cmd))
        .on('end', () => {
          console.log('[FFmpeg] Audio extraction complete');
          resolve();
        })
        .on('error', (err) => {
          console.error('[FFmpeg] Audio extraction failed:', err);
          reject(err);
        })
        .save(outputPath);
    });
  };

  // Transcribe audio file
  // Uses OpenAI API if OPENAI_API_KEY is set, otherwise uses local Whisper service
  // SECURITY: Requires authentication (no anonymous access)
  // RATE LIMITED: GPU-intensive operation
  app.post("/api/transcribe", requireAuth, gpuRateLimit('transcribe'), checkUsageLimit('transcriptions'), upload.single("audio"), async (req, res) => {
    const audioFile = req.file;
    const ipHash = hashIP(req.ip || 'unknown');

    if (!audioFile) {
      return res.status(400).json({ error: "Audio file is required" });
    }

    // Track files to cleanup
    const filesToCleanup: string[] = [audioFile.path];

    try {
      const cloudConsentRaw = String((req as any)?.body?.cloudConsent ?? '').trim().toLowerCase();
      const cloudConsent = cloudConsentRaw === 'true' || cloudConsentRaw === '1' || cloudConsentRaw === 'yes' || cloudConsentRaw === 'on';
      if (USE_OPENAI_WHISPER && !cloudConsent) {
        filesToCleanup.forEach((f) => cleanupFile(f));
        return res.status(400).json({
          error: 'cloud_consent_required',
          message: 'Cloud-Verarbeitung ist aktiviert. Bitte stimmen Sie der Verarbeitung Ihrer Audiodaten durch OpenAI (USA) zu.',
        });
      }

      // SECURITY: Validate file type using magic bytes
      const allowedTypes = new Set([...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES]);
      const validation = await validateFileType(audioFile.path, allowedTypes, audioFile.mimetype);

      if (!validation.valid) {
        createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/transcribe', {
          reason: 'invalid_file_type',
          declaredType: audioFile.mimetype,
          detectedType: validation.detectedType,
          error: validation.error
        }, ipHash);

        cleanupFile(audioFile.path);
        return res.status(400).json({
          error: 'Invalid file type',
          details: validation.error
        });
      }
      let result: { text: string; duration: number; language: string; srt: string };

      if (USE_OPENAI_WHISPER && openai) {
        // ========== OpenAI Whisper API (Cloud) ==========
        const MAX_SIZE = 25 * 1024 * 1024; // 25MB OpenAI limit
        let fileToTranscribe = audioFile.path;
        let mimeType = audioFile.mimetype;
        let fileSize = audioFile.size;

        console.log(`[OpenAI] Received: ${audioFile.originalname} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB), mimetype: ${audioFile.mimetype}`);

        // If file is too large or is a video, extract and compress audio
        if (audioFile.size > MAX_SIZE || audioFile.mimetype.startsWith('video/')) {
          console.log(`[OpenAI] File too large or video - extracting audio...`);
          const extractedPath = `${audioFile.path}_extracted.mp3`;
          await extractAudioForOpenAI(audioFile.path, extractedPath);

          fileToTranscribe = extractedPath;
          mimeType = 'audio/mpeg';
          fileSize = fs.statSync(extractedPath).size;
          filesToCleanup.push(extractedPath);

          console.log(`[OpenAI] Extracted audio: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

          // Check if still too large
          if (fileSize > MAX_SIZE) {
            throw new Error(`Datei ist zu groß für die Transkription (${(fileSize / 1024 / 1024).toFixed(0)}MB). Maximum: 25MB. Bitte kürzen Sie das Audio.`);
          }
        }

        // Determine file extension from mimetype
        const mimeToExt: Record<string, string> = {
          'audio/webm': '.webm',
          'video/webm': '.webm',
          'audio/mp3': '.mp3',
          'audio/mpeg': '.mp3',
          'audio/mpga': '.mp3',
          'audio/wav': '.wav',
          'audio/x-wav': '.wav',
          'audio/wave': '.wav',
          'audio/mp4': '.m4a',
          'audio/m4a': '.m4a',
          'audio/x-m4a': '.m4a',
          'audio/aac': '.m4a',
          'audio/x-aac': '.m4a',
          'audio/ogg': '.ogg',
          'audio/vorbis': '.ogg',
          'audio/flac': '.flac',
          'audio/x-flac': '.flac',
          'video/mp4': '.mp4',
          'video/mpeg': '.mp4',
        };
        const ext = mimeToExt[mimeType] || '.mp3';
        const fileName = `audio${ext}`;

        // Read file and create a File object with correct name
        const fileBuffer = fs.readFileSync(fileToTranscribe);
        const file = new File([fileBuffer], fileName, { type: mimeType });

        console.log(`[OpenAI] Sending as: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

        // Call OpenAI Whisper API with verbose_json for timestamps
        const transcription = await openai.audio.transcriptions.create({
          file: file,
          model: "whisper-1",
          response_format: "verbose_json",
          timestamp_granularities: ["segment"],
        });

        // Extract data from response
        const text = transcription.text;
        const language = transcription.language || "de";
        const duration = transcription.duration || 0;
        const segments = (transcription as any).segments || [];

        // Generate SRT from segments
        const srt = segments.length > 0
          ? generateSrtFromSegments(segments)
          : `1\n00:00:00,000 --> 00:00:${Math.floor(duration).toString().padStart(2, "0")},000\n${text}\n`;

        result = { text, duration, language, srt };

        console.log(`[OpenAI] Transcription complete: ${text.length} chars, language: ${language}`);

      } else {
        // ========== Local Whisper Service (GDPR-compliant) ==========
        const formData = new FormData();
        formData.append("audio", fs.createReadStream(audioFile.path), {
          filename: audioFile.originalname || path.basename(audioFile.path),
          contentType: audioFile.mimetype || "application/octet-stream",
        });

        console.log(`[Local Whisper] Transcribing: ${audioFile.originalname} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)`);

        const response = await axios.post(
          `${WHISPER_SERVICE_URL}/transcribe`,
          formData,
          {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 600000,
            validateStatus: () => true,
          }
        );

        if (response.status < 200 || response.status >= 300) {
          const errorText = typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
          throw new Error(`Whisper service error: ${response.status} - ${errorText.slice(0, 2000)}`);
        }

        const localResult = response.data;
        result = {
          text: localResult.text,
          duration: localResult.duration,
          language: localResult.language,
          srt: localResult.srt,
        };

        console.log(`[Local Whisper] Transcription complete: ${result.text.length} chars, language: ${result.language}`);
      }

      // Cleanup all temp files
      filesToCleanup.forEach(f => cleanupFile(f));

      // Track usage (user is guaranteed to be authenticated)
      try {
        incrementUsage(req.user!.id, 'transcriptions');
      } catch (err) {
        console.error('[Usage] Failed to track transcription:', err);
      }

      res.json({
        text: result.text,
        duration: result.duration,
        language: result.language,
        srt: result.srt,
        mode: USE_OPENAI_WHISPER ? "openai" : "local",
      });

    } catch (error) {
      // Cleanup all temp files
      filesToCleanup.forEach(f => cleanupFile(f));
      console.error("Error transcribing audio:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: USE_OPENAI_WHISPER
          ? "OpenAI API error: " + errorMessage
          : isConnectionError
            ? "Whisper service unavailable. Please ensure the whisper-service container is running."
            : "Failed to transcribe audio",
        details: errorMessage
      });
    }
  });

  // Embed subtitles into video using FFmpeg (with GPU acceleration for encoding if available)
  // Supports both hardcoded (burned-in) and soft subtitles
  // Optionally accepts a custom font file for hardcoded subtitles
  // SECURITY: Requires authentication (no anonymous access)
  app.post(
    "/api/embed-subtitles",
    requireAuth,
    gpuRateLimit('embed_subtitles', {
      free: clampInt(Number(process.env.EMBED_SUBTITLES_RATE_LIMIT_FREE || 1), 1, 20, 1),
      pro: clampInt(Number(process.env.EMBED_SUBTITLES_RATE_LIMIT_PRO || 2), 1, 100, 2),
      premium: clampInt(Number(process.env.EMBED_SUBTITLES_RATE_LIMIT_PREMIUM || 4), 1, 200, 4),
      team: clampInt(Number(process.env.EMBED_SUBTITLES_RATE_LIMIT_TEAM || 6), 1, 500, 6),
    }),
    checkUsageLimit('videos'),
    upload.fields([
    { name: "video", maxCount: 1 },
    { name: "srt", maxCount: 1 },
    { name: "font", maxCount: 1 }
  ]),
    async (req, res) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const videoFile = files?.video?.[0];
    const srtFile = files?.srt?.[0];
    const fontFile = files?.font?.[0];
    const subtitleType = String(req.body.type || "hardcoded") === "soft" ? "soft" : "hardcoded"; // "hardcoded" or "soft"
    const enhanceAudio = ["true", "1", "yes", "on"].includes(
      String(req.body.enhanceAudio ?? "").toLowerCase()
    );
    const ipHash = hashIP(req.ip || 'unknown');

    if (!videoFile || !srtFile) {
      if (videoFile) cleanupFile(videoFile.path);
      if (srtFile) cleanupFile(srtFile.path);
      if (fontFile) cleanupFile(fontFile.path);
      return res.status(400).json({ error: "Both video and SRT files are required" });
    }

    // SECURITY: Validate video file type
    const videoValidation = await validateFileType(videoFile.path, ALLOWED_VIDEO_TYPES, videoFile.mimetype);
    if (!videoValidation.valid) {
      createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/embed-subtitles', {
        reason: 'invalid_video_type',
        detectedType: videoValidation.detectedType
      }, ipHash);
      cleanupFile(videoFile.path);
      cleanupFile(srtFile.path);
      if (fontFile) cleanupFile(fontFile.path);
      return res.status(400).json({ error: 'Invalid video file type' });
    }

    // Validate font file if provided
    if (fontFile) {
      const fontValidation = await validateFileType(fontFile.path, ALLOWED_FONT_TYPES, fontFile.mimetype);
      if (!fontValidation.valid) {
        createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/embed-subtitles', {
          reason: 'invalid_font_type',
          detectedType: fontValidation.detectedType
        }, ipHash);
        cleanupFile(videoFile.path);
        cleanupFile(srtFile.path);
        cleanupFile(fontFile.path);
        return res.status(400).json({ error: 'Invalid font file type' });
      }
    }

    // Rename SRT file to have proper extension (FFmpeg needs it)
    const srtPath = srtFile.path + ".srt";
    fs.renameSync(srtFile.path, srtPath);

    // Handle custom font file
    let fontPath: string | null = null;
    if (fontFile && subtitleType === "hardcoded") {
      // Get original extension
      const fontExt = safeExtensionFromOriginalName(fontFile.originalname) || ".ttf";
      fontPath = fontFile.path + fontExt;
      fs.renameSync(fontFile.path, fontPath);
    }

    // Check if video is WebM - FFmpeg subtitle filter has issues with WebM
    // Convert to MP4 first if needed
    let videoInputPath = videoFile.path;
    let convertedMp4Path: string | null = null;
    const isWebM = videoFile.mimetype === 'video/webm' ||
                   videoFile.originalname?.toLowerCase().endsWith('.webm') ||
                   videoValidation.detectedType === 'video/webm';

    if (isWebM) {
      console.log('[Embed] WebM detected, converting to MP4 first...');
      convertedMp4Path = tmpPath(`converted_${Date.now()}.mp4`);
      const conversionUseGpu = checkNvencAvailable();
      const conversionOptions = getVideoEncodingOptions("fast");

      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoFile.path)
            .outputOptions([
              ...conversionOptions,
              "-c:a aac",
              "-b:a 128k"
            ])
            .output(convertedMp4Path!)
            .on("start", (cmd) => {
              console.log(`[Embed] WebM→MP4 conversion started (${conversionUseGpu ? 'GPU' : 'CPU'}):`, cmd);
            })
            .on("progress", (progress) => {
              console.log(`[Embed] WebM→MP4 conversion: ${progress.percent?.toFixed(1) || 0}% done`);
            })
            .on("end", () => {
              console.log('[Embed] WebM→MP4 conversion complete');
              resolve();
            })
            .on("error", (err) => {
              console.error('[Embed] WebM→MP4 conversion error:', err);
              reject(err);
            })
            .run();
        });
        videoInputPath = convertedMp4Path;
      } catch (conversionError) {
        cleanupFile(videoFile.path);
        cleanupFile(srtPath);
        if (fontPath) cleanupFile(fontPath);
        if (convertedMp4Path) cleanupFile(convertedMp4Path);
        console.error('[Embed] WebM conversion failed:', conversionError);
        return res.status(500).json({
          error: "Failed to convert WebM to MP4",
          details: conversionError instanceof Error ? conversionError.message : "Unknown error"
        });
      }
    }

    // Create output file path
    const outputPath = tmpPath(`output_${Date.now()}.mp4`);
    const useGpu = checkNvencAvailable();

    try {
      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(videoInputPath);

        if (subtitleType === "hardcoded") {
          // Burn subtitles into video (permanent, can't be turned off)
          // Note: Subtitle filter runs on CPU, but encoding can use GPU

          // Get styling options from request (with safe defaults + validation)
          const isHexColor = (value: unknown): value is string =>
            typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

          const fontSize = clampInt(Number(req.body.fontSize), 12, 96, 24);
          const fontColor = isHexColor(req.body.fontColor) ? req.body.fontColor : "#FFFFFF";
          const backgroundColor = isHexColor(req.body.backgroundColor) ? req.body.backgroundColor : "#000000";
          const backgroundOpacity = clampInt(Number(req.body.backgroundOpacity), 0, 100, 80);

          // Convert hex colors to FFmpeg ASS format (&HAABBGGRR)
          // ASS uses BGR order with alpha prefix
          // Alpha: 00 = fully opaque, FF = fully transparent
          const hexToAss = (hex: string, transparency: number = 0): string => {
            const clean = hex.replace('#', '');
            const r = clean.substring(0, 2);
            const g = clean.substring(2, 4);
            const b = clean.substring(4, 6);
            // transparency: 0 = opaque (00), 100 = transparent (FF)
            const alphaHex = Math.round(transparency * 2.55).toString(16).padStart(2, '0').toUpperCase();
            return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
          };

          const primaryColour = hexToAss(fontColor, 0); // Fully opaque text
          const backColour = hexToAss(backgroundColor, 100 - backgroundOpacity);
          const outlineColour = hexToAss(backgroundColor, 0); // Fully opaque outline

          // Build force_style options
          // BorderStyle=4 means opaque box behind text (for background)
          // BorderStyle=1 means outline only
          const borderStyle = backgroundOpacity > 0 ? 4 : 1;
          let forceStyle = `FontSize=${fontSize},PrimaryColour=${primaryColour},BackColour=${backColour},OutlineColour=${outlineColour},BorderStyle=${borderStyle},Outline=2,Shadow=0,MarginV=30`;

          // Get encoding options (GPU or CPU)
          const encodingOptions = getVideoEncodingOptions("balanced");

          // Use custom font if provided, otherwise use Arial
          if (fontPath) {
            // For custom fonts, we need to specify the font file path
            const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
            command = command
              .outputOptions([
                `-vf subtitles='${escapedSrtPath}':fontsdir='${path.dirname(fontPath)}':force_style='FontName=${path.basename(fontPath, path.extname(fontPath))},${forceStyle}'`,
                ...encodingOptions,
                ...getHardcodedAudioOptions(enhanceAudio)
              ]);
          } else {
            forceStyle = "FontName=Arial," + forceStyle;
            command = command
              .outputOptions([
                `-vf subtitles='${srtPath.replace(/'/g, "'\\''")}':force_style='${forceStyle}'`,
                ...encodingOptions,
                ...getHardcodedAudioOptions(enhanceAudio)
              ]);
          }
        } else {
          // Soft subtitles (can be toggled on/off by viewer)
          command = command
            .input(srtPath)
            .outputOptions([
              "-c:v copy",
              ...getSoftAudioOptions(enhanceAudio),
              "-c:s mov_text",
              "-metadata:s:s:0 language=eng"
            ]);
        }

        const encodingMode = subtitleType === "hardcoded" ? (useGpu ? "GPU" : "CPU") : "copy";
        command
          .output(outputPath)
          .on("start", (cmd) => {
            console.log(`FFmpeg started (${encodingMode}):`, cmd);
          })
          .on("progress", (progress) => {
            console.log(`Processing (${encodingMode}):`, progress.percent?.toFixed(1) || 0, "% done");
          })
          .on("end", () => {
            console.log(`FFmpeg processing finished (${encodingMode})`);
            resolve();
          })
          .on("error", (err) => {
            console.error("FFmpeg error:", err);
            reject(err);
          })
          .run();
      });

      // Track usage (user is guaranteed to be authenticated)
      try {
        incrementUsage(req.user!.id, 'videos');
      } catch (err) {
        console.error('[Usage] Failed to track video:', err);
      }

      // Send the output file
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="video_with_subtitles.mp4"`);

      const readStream = fs.createReadStream(outputPath);
      readStream.pipe(res);

      readStream.on("end", () => {
        // Cleanup all temp files
        cleanupFile(videoFile.path);
        cleanupFile(srtPath);
        cleanupFile(outputPath);
        if (fontPath) cleanupFile(fontPath);
        if (convertedMp4Path) cleanupFile(convertedMp4Path);
      });

      readStream.on("error", (err) => {
        console.error("Error streaming output:", err);
        cleanupFile(videoFile.path);
        cleanupFile(srtPath);
        cleanupFile(outputPath);
        if (fontPath) cleanupFile(fontPath);
        if (convertedMp4Path) cleanupFile(convertedMp4Path);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream output video" });
        }
      });

    } catch (error) {
      cleanupFile(videoFile.path);
      cleanupFile(srtPath);
      cleanupFile(outputPath);
      if (fontPath) cleanupFile(fontPath);
      if (convertedMp4Path) cleanupFile(convertedMp4Path);
      console.error("Error embedding subtitles:", error);
      res.status(500).json({
        error: "Failed to embed subtitles",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
    }
  );

  // Convert WebM to MP4 using FFmpeg (with GPU acceleration if available)
  // For screen recordings that need to be in a more compatible format
  // SECURITY: Requires authentication (no anonymous access)
  app.post(
    "/api/convert-to-mp4",
    requireAuth,
    gpuRateLimit('video_convert', {
      free: clampInt(Number(process.env.VIDEO_CONVERT_RATE_LIMIT_FREE || 1), 1, 20, 1),
      pro: clampInt(Number(process.env.VIDEO_CONVERT_RATE_LIMIT_PRO || 2), 1, 100, 2),
      premium: clampInt(Number(process.env.VIDEO_CONVERT_RATE_LIMIT_PREMIUM || 3), 1, 200, 3),
      team: clampInt(Number(process.env.VIDEO_CONVERT_RATE_LIMIT_TEAM || 4), 1, 500, 4),
    }),
    upload.single("video"),
    async (req, res) => {
    // Set 10 minute timeout for large video conversions
    req.setTimeout(600000);
    res.setTimeout(600000);

    const videoFile = req.file;
    const ipHash = hashIP(req.ip || 'unknown');

    if (!videoFile) {
      return res.status(400).json({ error: "Video file is required" });
    }

    // SECURITY: Validate video file type
    const videoValidation = await validateFileType(videoFile.path, ALLOWED_VIDEO_TYPES, videoFile.mimetype);
    if (!videoValidation.valid) {
      createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/convert-to-mp4', {
        reason: 'invalid_video_type',
        detectedType: videoValidation.detectedType
      }, ipHash);
      cleanupFile(videoFile.path);
      return res.status(400).json({ error: 'Invalid video file type' });
    }

    const outputPath = tmpPath(`converted_${Date.now()}.mp4`);
    const useGpu = checkNvencAvailable();

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoFile.path)
          .outputOptions([
            ...getVideoEncodingOptions("fast"),  // GPU or CPU encoding
            "-c:a aac",          // AAC audio codec
            "-b:a 128k",         // Audio bitrate
            "-movflags +faststart"  // Enable streaming
          ])
          .output(outputPath)
          .on("start", (cmd) => {
            console.log(`FFmpeg convert started (${useGpu ? "GPU" : "CPU"}):`, cmd);
          })
          .on("progress", (progress) => {
            console.log(`Converting (${useGpu ? "GPU" : "CPU"}):`, progress.percent?.toFixed(1) || 0, "% done");
          })
          .on("end", () => {
            console.log(`Conversion finished (${useGpu ? "GPU" : "CPU"})`);
            resolve();
          })
          .on("error", (err) => {
            console.error("FFmpeg convert error:", err);
            reject(err);
          })
          .run();
      });

      // Send the output file
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="aufnahme_${Date.now()}.mp4"`);

      const readStream = fs.createReadStream(outputPath);
      readStream.pipe(res);

      readStream.on("end", () => {
        cleanupFile(videoFile.path);
        cleanupFile(outputPath);
      });

      readStream.on("error", (err) => {
        console.error("Error streaming converted video:", err);
        cleanupFile(videoFile.path);
        cleanupFile(outputPath);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream converted video" });
        }
      });

    } catch (error) {
      cleanupFile(videoFile.path);
      cleanupFile(outputPath);
      console.error("Error converting video:", error);
      res.status(500).json({
        error: "Failed to convert video",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
    }
  );

  // ===========================================
  // SIMPLE LANGUAGE (Einfache Sprache) TOOL
  // ===========================================

  // Analyze and/or simplify text for accessibility
  // Mode: "analyze" (free), "simplify" (premium), "both" (premium)
  // SECURITY: Requires authentication
  // RATE LIMITED: GPU-intensive operation (Ollama)
  app.post("/api/simplify-text", requireAuth, gpuRateLimit('simplify'), async (req, res) => {
    const { text, mode = "analyze" } = req.body;
    const ipHash = hashIP(req.ip || 'unknown');

    // Validate input
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text ist erforderlich" });
    }

    if (!["analyze", "simplify", "both"].includes(mode)) {
      return res.status(400).json({ error: "Ungültiger Modus. Erlaubt: analyze, simplify, both" });
    }

    const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
    // Prefer user subscription tier (kept up-to-date by billing webhooks).
    // Fall back to workspace plan_id for legacy/on-prem setups.
    const planId = (SUBSCRIPTION_PLAN_MAP[String(req.user?.subscription || 'free')] || (workspace.plan_id as PlanId) || 'free') as PlanId;
    const isPaidPlan = planId !== 'free';
    const needsSimplify = mode === "simplify" || mode === "both";

    // Text limits:
    // - Free: keep a conservative char cap (analysis only; simplify is demo-limited separately).
    // - Paid: allow up to 10,000 words (per request requirement).
    // Always enforce an absolute char cap to avoid pathological inputs (e.g., no whitespace).
    const PREMIUM_MAX_WORDS = 10_000;
    const PREMIUM_MAX_CHARS = 300_000;
    const countWords = (value: string): number => {
      const m = value.trim().match(/\S+/g);
      return m ? m.length : 0;
    };
    const wordCount = countWords(text);

    if (text.length > PREMIUM_MAX_CHARS) {
      return res.status(400).json({
        error: `Text ist zu lang. Maximum: ${PREMIUM_MAX_CHARS.toLocaleString('de-DE')} Zeichen`,
        maxChars: PREMIUM_MAX_CHARS,
      });
    }

    if (!isPaidPlan && text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        error: `Text ist zu lang. Maximum: ${MAX_TEXT_LENGTH.toLocaleString('de-DE')} Zeichen`,
        maxLength: MAX_TEXT_LENGTH,
      });
    }

    if (isPaidPlan && wordCount > PREMIUM_MAX_WORDS) {
      return res.status(400).json({
        error: `Text ist zu lang. Maximum: ${PREMIUM_MAX_WORDS.toLocaleString('de-DE')} Wörter`,
        maxWords: PREMIUM_MAX_WORDS,
        wordCount,
      });
    }

    // Check if user can use simplify mode
    if (needsSimplify && planId === 'free' && text.length > 500) {
      return res.status(403).json({
        error: "Upgrade erforderlich",
        message: "Free-Demo: max. 500 Zeichen. Upgrade auf Pro für lange Texte.",
        requiredMinPlan: "pro",
      });
    }

    try {
      let analysis = null;
      let simplified = null;
      let personaChecks = null;
      let creditsUsed = 0;
      let pendingSimplifyCharge: { credits: number; quantity: number } | null = null;

      if (needsSimplify) {
        const wallet = ensureCreditWallet(workspace.id, planId);
        const quantity = Math.max(1, Math.ceil(text.length / 1000));
        const credits = quantity * CREDIT_COSTS.SIMPLE_LANG_1K.credits;
        if (credits > 0 && wallet.balance < credits) {
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        pendingSimplifyCharge = credits > 0 ? { credits, quantity } : null;
      }

      // Always analyze if mode is "analyze" or "both"
      if (mode === "analyze" || mode === "both") {
        analysis = analyzeText(text);
        console.log(`[SimplifyText] Analysis complete: score=${analysis.score}, issues=${analysis.issues.length}`);

        // Get persona assessments from persona-service
        try {
          const personaServiceUrl = process.env.PERSONA_SERVICE_URL || 'http://localhost:8002';
          const personaResponse = await fetch(`${personaServiceUrl}/assess-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stats: {
                ...analysis.stats,
                flesch_score: analysis.score // Use the overall score as flesch approximation
              },
              issues: analysis.issues
            }),
            signal: AbortSignal.timeout(5000) // 5s timeout
          });

          if (personaResponse.ok) {
            const personaData = await personaResponse.json();
            personaChecks = personaData.personaChecks;
            console.log(`[SimplifyText] Persona assessment complete: ${personaChecks?.length || 0} personas checked`);
          } else {
            console.warn(`[SimplifyText] Persona service returned ${personaResponse.status}`);
          }
        } catch (personaError) {
          // Don't fail the whole request if persona service is down
          console.warn(`[SimplifyText] Persona service unavailable:`, personaError);
        }
      }

      // Simplify with LLM if mode is "simplify" or "both"
      if (needsSimplify) {
        // Check Ollama health first
        const ollamaHealth = await checkOllamaHealth();
        if (!ollamaHealth.available) {
          console.error(`[SimplifyText] Ollama not available: ${ollamaHealth.error}`);
          return res.status(503).json({
            error: "KI-Service nicht verfügbar",
            message: "Der Textverarbeitungs-Service ist vorübergehend nicht erreichbar. Bitte versuchen Sie es später erneut.",
            details: ollamaHealth.error
          });
        }

        if (!ollamaHealth.model) {
          console.error(`[SimplifyText] Ollama model not loaded: ${ollamaHealth.error}`);
          return res.status(503).json({
            error: "KI-Modell nicht geladen",
            message: "Das Sprachmodell wird gerade geladen. Bitte versuchen Sie es in einigen Minuten erneut.",
            details: ollamaHealth.error
          });
        }

        if (pendingSimplifyCharge && pendingSimplifyCharge.credits > 0) {
          spendCredits(workspace.id, pendingSimplifyCharge.credits, null, {
            costKey: 'SIMPLE_LANG_1K',
            quantity: pendingSimplifyCharge.quantity,
            mode,
            textLength: text.length,
          });
          creditsUsed = pendingSimplifyCharge.credits;
          pendingSimplifyCharge = null;
        }

        console.log(`[SimplifyText] Calling Ollama for simplification (${text.length} chars)...`);
        simplified = await simplifyTextWithOllama(text);
        console.log(`[SimplifyText] Simplification complete: ${simplified.length} chars output`);

        // Create audit log for premium feature usage
        createAuditLog(req.userId!, 'simplify_text', 'success', '/api/simplify-text', {
          inputLength: text.length,
          outputLength: simplified.length,
          mode
        }, ipHash);
      }

      res.json({
        analysis,
        simplified,
        personaChecks,
        mode,
        creditsUsed,
      });

    } catch (error) {
      console.error("[SimplifyText] Error:", error);

      createAuditLog(req.userId!, 'simplify_text', 'failure', '/api/simplify-text', {
        error: error instanceof Error ? error.message : 'Unknown error',
        mode
      }, ipHash);

      if (error instanceof UnsafeLlmRequestError) {
        return res.status(400).json({
          error: "Text aus Sicherheitsgründen abgelehnt",
          message: error.message,
        });
      }

      res.status(500).json({
        error: "Fehler bei der Textverarbeitung",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  });

  // Health check for Ollama LLM service
  app.get("/api/simplify-text/health", async (_req, res) => {
    const health = await checkOllamaHealth();
    res.json({
      status: health.available ? "ok" : "unavailable",
      model: health.model,
      error: health.error
    });
  });

  // ===========================================
  // ALT-TEXT GENERATOR (Vision AI)
  // ===========================================

  // Allowed image types for alt-text generation
  const ALLOWED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/bmp'
  ]);

  // Generate accessible alt-text for images using Vision AI
  // SECURITY: Requires authentication
  // RATE LIMITED: GPU-intensive operation (Vision Model)
  app.post("/api/generate-alt-text",
    requireAuth,
    requireMinPlan('pro'),
    gpuRateLimit('pptx'), // Reuse pptx rate limit for vision tasks
    upload.array("images", 5), // Max 5 images
    async (req, res) => {
      const ipHash = hashIP(req.ip || 'unknown');
      const files = req.files as Express.Multer.File[];

      // Validate files
      if (!files || files.length === 0) {
        return res.status(400).json({
          error: "Keine Bilder hochgeladen",
          message: "Bitte laden Sie mindestens ein Bild hoch."
        });
      }

      // Validate options
      const length = (req.body.length as 'short' | 'standard' | 'detailed') || 'standard';
      const context = req.body.context as string | undefined;

      if (!['short', 'standard', 'detailed'].includes(length)) {
        return res.status(400).json({
          error: "Ungültige Länge",
          message: "Erlaubte Werte: short, standard, detailed"
        });
      }

      try {
        const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
        const planId = workspace.plan_id as PlanId;
        const wallet = ensureCreditWallet(workspace.id, planId);
        const quantity = Math.max(1, files.length);
        const credits = quantity * CREDIT_COSTS.ALT_TEXT_IMAGE.credits;
        if (credits > 0 && wallet.balance < credits) {
          // Cleanup uploaded files
          for (const file of files) {
            try { fs.unlinkSync(file.path); } catch {}
          }
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        if (credits > 0) {
          spendCredits(workspace.id, credits, null, {
            costKey: 'ALT_TEXT_IMAGE',
            quantity,
            length,
            hasContext: !!context?.trim(),
          });
        }
      } catch (error: any) {
        // Cleanup uploaded files
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
        const message = (error as Error)?.message || String(error);
        const status = message === 'insufficient_credits' ? 402 : 500;
        return res.status(status).json({ error: message === 'insufficient_credits' ? 'Nicht genug Credits' : message });
      }

      const results: Array<{
        filename: string;
        altText: string;
        characterCount: number;
        error?: string;
      }> = [];

      // Import generateAltText function
      const { generateAltText } = await import('./services/ollama');

      // Process each image
      for (const file of files) {
        try {
          // Validate file type using magic bytes
          const validation = await validateFileType(file.path, ALLOWED_IMAGE_TYPES, file.mimetype);

          if (!validation.valid) {
            results.push({
              filename: file.originalname,
              altText: '',
              characterCount: 0,
              error: `Ungültiger Dateityp: ${validation.detectedType || 'unbekannt'}`
            });
            continue;
          }

          // Check file size (max 10MB)
          if (file.size > 10 * 1024 * 1024) {
            results.push({
              filename: file.originalname,
              altText: '',
              characterCount: 0,
              error: 'Datei zu groß (max. 10 MB)'
            });
            continue;
          }

          // Read image buffer
          const imageBuffer = fs.readFileSync(file.path);

          // Generate alt-text (always German)
          const result = await generateAltText(imageBuffer, {
            length,
            context
          });

          results.push({
            filename: file.originalname,
            altText: result.altText,
            characterCount: result.characterCount
          });

          // Log success
          createAuditLog(
            req.user!.id,
            'alt_text_generate',
            'success',
            file.originalname,
            { length, characterCount: result.characterCount },
            ipHash
          );

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
          results.push({
            filename: file.originalname,
            altText: '',
            characterCount: 0,
            error: errorMessage
          });

          createAuditLog(
            req.user!.id,
            'alt_text_generate',
            'failure',
            file.originalname,
            { error: errorMessage },
            ipHash
          );
        } finally {
          // Cleanup uploaded file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }

      // Return results
      res.json({
        results,
        totalProcessed: results.length,
        successful: results.filter(r => !r.error).length
      });
    }
  );

  // ===========================================
  // AI COLOR PALETTE GENERATOR
  // ===========================================

  // Generate accessible color palette with AI
  // Uses Ollama LLM to create WCAG-compliant color combinations
  app.post("/api/generate-palette", async (req, res) => {
    const { description } = req.body;

    // Validate input
    if (!description || typeof description !== "string") {
      return res.status(400).json({
        error: "Beschreibung erforderlich",
        message: "Bitte geben Sie eine Beschreibung für die gewünschte Farbpalette ein."
      });
    }

    if (description.length < 5) {
      return res.status(400).json({
        error: "Beschreibung zu kurz",
        message: "Bitte geben Sie eine ausführlichere Beschreibung ein (mind. 5 Zeichen)."
      });
    }

    if (description.length > 500) {
      return res.status(400).json({
        error: "Beschreibung zu lang",
        message: "Die Beschreibung darf maximal 500 Zeichen lang sein."
      });
    }

    try {
      // Check Ollama health first
      const health = await checkOllamaHealth();
      if (!health.available) {
        return res.status(503).json({
          error: "KI-Service nicht verfügbar",
          message: "Der Paletten-Generator ist vorübergehend nicht erreichbar. Bitte versuchen Sie es später erneut."
        });
      }

      console.log(`[Palette] Generating palette for: "${description.substring(0, 50)}..."`);

      const palette = await generateColorPalette(description);

      console.log(`[Palette] Generated: ${palette.name} with ${palette.colors.length} colors`);

      return res.json({ palette });

    } catch (error) {
      console.error("[Palette] Generation error:", error);

      return res.status(500).json({
        error: "Generierung fehlgeschlagen",
        message: error instanceof Error ? error.message : "Unbekannter Fehler bei der Paletten-Generierung"
      });
    }
  });

  // ===========================================
  // POWERPOINT TO PODCAST API
  // ===========================================

  // Convert PPTX to Podcast
  // Proxies request to the podcast-pptx microservice
  // SECURITY: Requires authentication and premium subscription
  app.post("/api/podcast/convert", requireAuth, requireMinPlan('pro'), gpuRateLimit('podcast'), upload.single("file"), async (req, res) => {
    const pptxFile = req.file;
    const ipHash = hashIP(req.ip || 'unknown');
    let persistedPodcastInputPath: string | null = null;

    if (!pptxFile) {
      return res.status(400).json({ error: "PowerPoint-Datei ist erforderlich" });
    }

    try {
      // Validate file type - PPTX files are detected as ZIP
      const fileBuffer = fs.readFileSync(pptxFile.path);
      const fileType = await fileTypeFromBuffer(fileBuffer);

      // Allow ZIP (which is what PPTX gets detected as) and declared PPTX types
      const isValidPptx =
        (fileType && ALLOWED_PPTX_TYPES.has(fileType.mime)) ||
        pptxFile.originalname.toLowerCase().endsWith('.pptx') ||
        pptxFile.originalname.toLowerCase().endsWith('.ppt');

      if (!isValidPptx) {
        createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/podcast/convert', {
          reason: 'invalid_file_type',
          declaredType: pptxFile.mimetype,
          detectedType: fileType?.mime
        }, ipHash);
        cleanupFile(pptxFile.path);
        return res.status(400).json({
          error: "Ungültiger Dateityp",
          details: "Bitte laden Sie eine PowerPoint-Datei (.pptx) hoch."
        });
      }

      // Get style parameter (dialog or monolog)
      const style = req.query.style === "monolog" ? "monolog" : "dialog";

      // Get speaker style parameter (sachlich, lebendig, lustig, locker)
      const speakerStyleParam = req.query.speakerStyle as string || "sachlich";
      const validSpeakerStyles = ["sachlich", "lebendig", "lustig", "locker"];
      const speakerStyle = validSpeakerStyles.includes(speakerStyleParam) ? speakerStyleParam : "sachlich";

      // Optional TTS engine selection
      const ttsEngineParam = typeof req.query.ttsEngine === "string" ? req.query.ttsEngine : undefined;
      const validTtsEngines = ["xtts", "qwen3tts", "piper"];
      const ttsEngine = ttsEngineParam && validTtsEngines.includes(ttsEngineParam) ? ttsEngineParam : undefined;
      if (ttsEngineParam && !ttsEngine) {
        cleanupFile(pptxFile.path);
        return res.status(400).json({ error: "Ungültige TTS-Engine" });
      }

      // Optional Qwen TTS preset
      const ttsPresetParam = typeof req.query.ttsPreset === "string" ? req.query.ttsPreset : undefined;
      const validTtsPresets = ["klar", "lebendig", "dynamisch"];
      const ttsPreset = ttsPresetParam
        ? (validTtsPresets.includes(ttsPresetParam) ? ttsPresetParam : undefined)
        : "lebendig";
      if (ttsPresetParam && !ttsPreset) {
        cleanupFile(pptxFile.path);
        return res.status(400).json({ error: "Ungültiges TTS-Preset" });
      }

      // Get pronunciation rules if provided
      const pronunciationRules = req.body?.pronunciationRules;
      const pronunciationRulesNormalized = normalizePodcastPronunciationRules(pronunciationRules);

      // Get and validate notification email if provided
      const notifyEmailRaw = typeof req.body?.notifyEmail === 'string'
        ? req.body.notifyEmail.trim().toLowerCase()
        : '';
      const notifyEmail = notifyEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmailRaw)
        ? notifyEmailRaw
        : undefined;
      if (notifyEmailRaw && !notifyEmail) {
        cleanupFile(pptxFile.path);
        return res.status(400).json({ error: "Ungültige E-Mail-Adresse für Benachrichtigung" });
      }

      // Queue job if Redis is available
      const redisAvailable = await isRedisAvailable();
      if (redisAvailable) {
        const storageTarget = resolveStorageTarget(req.user!, {
          scope: req.body.storageScope,
          workspaceId: req.body.workspaceId,
          projectId: req.body.projectId,
        });

        const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
          ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(req.user!)
          : getOrCreateDefaultWorkspaceForUser(req.user!);
        const planId = workspace.plan_id as PlanId;
        const fileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        const dedupKey = buildPodcastDedupKey({
          fileSha256,
          style,
          speakerStyle,
          ttsEngine,
          ttsPreset,
          pronunciationRulesNormalized,
          storageScope: storageTarget.scope,
          workspaceId: storageTarget.scope === "workspace" ? workspace.id : null,
          projectId: storageTarget.projectId || null,
        });

        const runningJobs = storageTarget.scope === "workspace"
          ? getJobsForWorkspace(workspace.id, 200)
          : getJobsForUser(req.userId!, 200);
        const duplicate = runningJobs.find((candidate) => {
          if (candidate.queue !== "podcast") return false;
          if (candidate.status !== "pending" && candidate.status !== "active") return false;
          return extractJobDedupKey(candidate.input_data) === dedupKey;
        });
        if (duplicate) {
          cleanupFile(pptxFile.path);
          createAuditLog(req.userId!, 'podcast_convert', 'success', '/api/podcast/convert', {
            filename: pptxFile.originalname,
            duplicateOf: duplicate.id,
            deduplicated: true,
          }, ipHash);
          return res.status(409).json({
            error: "Ein identischer Podcast-Job läuft bereits",
            message: "Wir verwenden den bereits laufenden Job.",
            jobId: duplicate.id,
            status: duplicate.status === "pending" ? "queued" : "processing",
            deduplicated: true,
          });
        }

        const { nanoid } = await import('nanoid');
        const jobId = `podcast_${nanoid(12)}`;
        const priority = getPriorityForSubscription(req.user?.subscription || 'free');
        const inputExt = safeExtensionFromOriginalName(pptxFile.originalname) || '.pptx';
        const stagedInputPath = `${pptxFile.path}${inputExt}`;
        fs.renameSync(pptxFile.path, stagedInputPath);
        const persistedInputPath = persistJobInputFile({
          kind: 'podcast',
          jobId,
          sourcePath: stagedInputPath,
          originalName: pptxFile.originalname,
          defaultExt: inputExt,
        });
        persistedPodcastInputPath = persistedInputPath;
        const inputChecksum = computeFileSha256(persistedInputPath);

        const slideCount = await getPptxSlideCount(persistedInputPath);
        const estimatedMinutes = Math.max(1, Math.ceil(slideCount * 0.5));
        const estimatedCredits = estimatedMinutes * CREDIT_COSTS.PODCAST_MINUTE.credits;
        const wallet = ensureCreditWallet(workspace.id, planId);
        if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
          cleanupFile(persistedInputPath);
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        if (estimatedCredits > 0) {
          reserveCredits(workspace.id, estimatedCredits, jobId, {
            costKey: 'PODCAST_MINUTE',
            slideCount,
            estimatedMinutes,
          });
        }

        createJob({
          id: jobId,
          queue: 'podcast',
          userId: req.userId!,
          storageScope: storageTarget.scope,
          workspaceId: workspace.id,
          projectId: storageTarget.projectId || null,
          jobType: 'PODCAST_MINUTE',
          estimatedCredits,
          priority,
          inputData: {
            originalName: pptxFile.originalname,
            style,
            speakerStyle,
            ttsEngine,
            ttsPreset,
            notifyEmail,
            slideCount,
            estimatedMinutes,
            dedupKey,
            fileSha256,
            inputPath: persistedInputPath,
            inputChecksum,
          },
          inputPath: persistedInputPath,
          inputChecksum,
          expiresInHours: 24,
        });

        try {
          await podcastQueue.add('convert', {
            jobId,
            userId: req.userId!,
            inputFilePath: persistedInputPath,
            inputChecksum,
            originalName: pptxFile.originalname,
            style,
            speakerStyle,
            ttsEngine,
            ttsPreset,
            pronunciationRules,
            notifyEmail,
            storageScope: storageTarget.scope,
            workspaceId: workspace.id,
            projectId: storageTarget.projectId || null,
          }, {
            jobId,
            priority,
            attempts: PODCAST_RETRY_ATTEMPTS,
            backoff: { type: 'tiered' },
          });
        } catch (error) {
          if (estimatedCredits > 0) {
            try { releaseCredits(workspace.id, estimatedCredits, jobId, { status: 'enqueue_failed' }); } catch {}
          }
          cleanupFile(persistedInputPath);
          throw error;
        }

        createAuditLog(req.userId!, 'podcast_convert', 'success', '/api/podcast/convert', {
          filename: pptxFile.originalname,
          jobId
        }, ipHash);

        return res.json({
          jobId,
          status: "queued",
          message: "Job in Warteschlange. Sie werden benachrichtigt, sobald der Podcast fertig ist."
        });
      }

      // Forward the file to the podcast service (sync when queue is unavailable)
      {
        const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
        const planId = workspace.plan_id as PlanId;
        const slideCount = await getPptxSlideCount(pptxFile.path);
        const estimatedMinutes = Math.max(1, Math.ceil(slideCount * 0.5));
        const estimatedCredits = estimatedMinutes * CREDIT_COSTS.PODCAST_MINUTE.credits;
        const wallet = ensureCreditWallet(workspace.id, planId);
        if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
          cleanupFile(pptxFile.path);
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        if (estimatedCredits > 0) {
          spendCredits(workspace.id, estimatedCredits, null, {
            costKey: 'PODCAST_MINUTE',
            slideCount,
            estimatedMinutes,
            mode: 'direct',
          });
        }
      }

      const formData = new FormData();
      formData.append("file", fs.createReadStream(pptxFile.path), {
        filename: pptxFile.originalname || path.basename(pptxFile.path),
        contentType: pptxFile.mimetype || "application/octet-stream",
      });
      if (pronunciationRules) {
        formData.append("pronunciationRules", pronunciationRules);
      }

      console.log(
        `[Podcast] Forwarding PPTX to podcast service: ${pptxFile.originalname} ` +
        `(style: ${style}, speakerStyle: ${speakerStyle}, ttsEngine: ${ttsEngine || "default"}, ttsPreset: ${ttsPreset || "default"})`
      );

      const ttsEngineQuery = ttsEngine ? `&ttsEngine=${encodeURIComponent(ttsEngine)}` : "";
      const ttsPresetQuery = ttsPreset ? `&ttsPreset=${encodeURIComponent(ttsPreset)}` : "";
      const response = await axios.post(
        `${PODCAST_SERVICE_URL}/convert?style=${style}&speakerStyle=${speakerStyle}${ttsEngineQuery}${ttsPresetQuery}`,
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000,
          validateStatus: () => true,
        }
      );

      if (response.status < 200 || response.status >= 300) {
        const errorText = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        throw new Error(`Podcast service error: ${response.status} - ${errorText}`);
      }

      const result = response.data;

      // Store email notification if provided
      if (notifyEmail && typeof notifyEmail === 'string' && notifyEmail.includes('@')) {
        podcastNotifications.set(result.job_id, {
          email: notifyEmail,
          filename: pptxFile.originalname,
          notified: false,
          createdAt: Date.now()
        });
        console.log(`[Podcast] Email notification registered for job ${result.job_id}: ${notifyEmail}`);
      }

      // Create audit log
      createAuditLog(req.userId!, 'podcast_convert', 'success', '/api/podcast/convert', {
        filename: pptxFile.originalname,
        jobId: result.job_id
      }, ipHash);

      // Cleanup temp file
      cleanupFile(pptxFile.path);

      res.json({
        jobId: result.job_id,
        status: "pending",
        message: "Konvertierung gestartet"
      });

    } catch (error) {
      // If queue path persisted the input, clean it up on handler-level failures.
      if (persistedPodcastInputPath) cleanupFile(persistedPodcastInputPath);
      cleanupFile(pptxFile.path);
      console.error("[Podcast] Conversion error:", error);

      createAuditLog(req.userId!, 'podcast_convert', 'failure', '/api/podcast/convert', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage === 'workspace_forbidden' || errorMessage === 'project_forbidden') {
        return res.status(403).json({ error: "Kein Zugriff auf den Workspace/Ordner" });
      }
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: isConnectionError
          ? "Podcast-Service nicht verfügbar. Bitte versuchen Sie es später erneut."
          : "Konvertierung fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // Get podcast conversion status
  // SECURITY: Requires authentication
  app.get("/api/podcast/status/:jobId", requireAuth, async (req, res) => {
    // Polled frequently. Avoid conditional 304 responses (breaks fetch().json()).
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("ETag", String(Date.now()));
    const { jobId } = req.params;

    try {
      const anyJob = getJob(jobId);
      if (anyJob && anyJob.queue === 'podcast') {
        const queuedJob = req.userId ? getJobForUserOrWorkspace(jobId, req.userId) : null;
        if (!queuedJob) {
          return res.status(404).json({ error: "Job nicht gefunden" });
        }
        let resultData: Record<string, any> | null = null;
        if (queuedJob.result_data) {
          try {
            resultData = JSON.parse(queuedJob.result_data);
          } catch {
            resultData = null;
          }
        }

        let phaseCode = normalizePodcastPhaseCode(queuedJob.phase);
        if (!phaseCode) {
          if (queuedJob.status === "completed") {
            phaseCode = "completed";
          } else if (queuedJob.status === "failed") {
            phaseCode = "failed";
          } else if (queuedJob.status === "pending") {
            phaseCode = "queued";
          } else {
            phaseCode = mapLegacyPodcastStageToPhaseCode(queuedJob.progress_stage);
          }
        }

        if (queuedJob.status === "failed") phaseCode = "failed";
        if (queuedJob.status === "completed") phaseCode = "completed";
        if (queuedJob.status === "pending" && phaseCode !== "retrying") phaseCode = "queued";

        const phaseRank = PODCAST_PHASE_RANK[phaseCode];
        const phaseMessage = String(queuedJob.progress_stage || "").trim() || defaultPodcastPhaseMessage(phaseCode);
        const pipelinePath =
          resultData?.pipelinePath === "legacy"
            ? "legacy"
            : resultData?.pipelinePath === "pack"
              ? "pack"
              : null;
        const timings = normalizePodcastTimings(resultData?.timings);
        const mappedStatus =
          queuedJob.status === "failed"
            ? "failed"
            : queuedJob.status === "completed"
              ? "completed"
              : mapPodcastPhaseToStatus(phaseCode);

        const { getJobPosition, getQueueStats } = await import('./queue');
        const [position, stats] = await Promise.all([
          getJobPosition('podcast', jobId),
          getQueueStats('podcast'),
        ]);

        const totalInQueue = stats.waiting + stats.active;
        const estimatedWaitMinutes = position && position > 0
          ? Math.ceil((position * stats.estimatedWaitSeconds / Math.max(1, totalInQueue)) / 60)
          : 0;

        return res.json({
          status: mappedStatus,
          phase: phaseCode,
          phaseCode,
          phaseMessage,
          phaseRank,
          progress: queuedJob.progress_percent || 0,
          currentStage: phaseMessage,
          pipelinePath,
          timings,
          chapters: resultData?.chapters || [],
          durationSeconds: resultData?.durationSeconds,
          downloadUrl: queuedJob.status === 'completed' ? `/api/podcast/download/${jobId}` : null,
          error: queuedJob.error_message,
          errorCode: queuedJob.error_code,
          retryCount: queuedJob.retry_count || queuedJob.attempts || 0,
          gpuWaitMs: queuedJob.gpu_wait_ms || 0,
          lastHeartbeatAt: queuedJob.last_heartbeat_at,
          queue: {
            position,
            totalInQueue,
            estimatedWaitMinutes,
          },
        });
      }

      const response = await fetch(`${PODCAST_SERVICE_URL}/status/${jobId}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Job nicht gefunden" });
        }
        throw new Error(`Status check failed: ${response.status}`);
      }

      const status = await response.json();

      // Send email notification if job is completed or failed and not yet notified
      const notification = podcastNotifications.get(jobId);
      if (notification && !notification.notified && (status.status === "completed" || status.status === "failed")) {
        notification.notified = true;
        podcastNotifications.set(jobId, notification);

        // Send email asynchronously (don't block the response)
        sendPodcastCompleteEmail(
          notification.email,
          notification.filename,
          jobId,
          status.status === "completed",
          status.duration_seconds,
          status.chapters?.length
        ).then(result => {
          if (result.success) {
            console.log(`[Podcast] Email notification sent for job ${jobId}`);
          } else {
            console.error(`[Podcast] Failed to send email for job ${jobId}:`, result.error);
          }
          // Clean up after sending (or attempting to send)
          setTimeout(() => podcastNotifications.delete(jobId), 60000);
        });
      }

      // Map podcast-pptx status to frontend format
      let phaseCode = normalizePodcastPhaseCode(status.phaseCode || status.phase_code || status.status);
      if (!phaseCode) {
        phaseCode = mapLegacyPodcastStageToPhaseCode(status.phaseMessage || status.phase_message || status.current_stage || "");
      }
      if (status.status === "failed") phaseCode = "failed";
      if (status.status === "completed") phaseCode = "completed";
      if (status.status === "pending") phaseCode = "queued";
      const phaseRank = PODCAST_PHASE_RANK[phaseCode];
      const phaseMessage =
        String(status.phaseMessage || status.phase_message || status.current_stage || "").trim() ||
        defaultPodcastPhaseMessage(phaseCode);
      const pipelinePath =
        status.pipelinePath === "legacy" || status.pipeline_path === "legacy"
          ? "legacy"
          : status.pipelinePath === "pack" || status.pipeline_path === "pack"
            ? "pack"
            : null;
      const timings = normalizePodcastTimings(status.timings);

      res.json({
        status: mapPodcastPhaseToStatus(phaseCode),
        phase: phaseCode,
        phaseCode,
        phaseMessage,
        phaseRank,
        progress: status.progress || 0,
        currentStage: phaseMessage,
        pipelinePath,
        timings,
        chapters: status.chapters || [],
        durationSeconds: status.duration_seconds || status.durationSeconds,
        downloadUrl: phaseCode === "completed" ? `/api/podcast/download/${jobId}` : null,
        error: status.error,
        errorCode: status.error_code || status.errorCode || null,
        retryCount: Number(status.retry_count || status.retryCount || 0) || 0,
        gpuWaitMs: Number(status.gpu_wait_ms || status.gpuWaitMs || 0) || 0,
        lastHeartbeatAt: status.last_heartbeat_at || status.lastHeartbeatAt || null,
      });

    } catch (error) {
      console.error("[Podcast] Status check error:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: isConnectionError
          ? "Podcast-Service nicht verfügbar"
          : "Status-Abfrage fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // Download completed podcast
  // SECURITY: Requires authentication
  app.get("/api/podcast/download/:jobId", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      let serviceJobId = jobId;
      const anyJob = getJob(jobId);
      if (anyJob && anyJob.queue === 'podcast') {
        const queuedJob = req.userId ? getJobForUserOrWorkspace(jobId, req.userId) : null;
        if (!queuedJob) {
          return res.status(404).json({ error: "Podcast nicht gefunden" });
        }
        if (queuedJob.status !== 'completed') {
          return res.status(400).json({ error: "Podcast noch nicht fertig" });
        }
        const resultData = queuedJob.result_data ? JSON.parse(queuedJob.result_data) : null;
        serviceJobId = resultData?.serviceJobId;
        if (!serviceJobId) {
          return res.status(404).json({ error: "Podcast nicht gefunden" });
        }
      }

      const response = await fetch(`${PODCAST_SERVICE_URL}/download/${serviceJobId}`, {
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Podcast nicht gefunden" });
        }
        throw new Error(`Download failed: ${response.status}`);
      }

      // Get content type and filename from response headers
      const contentType = response.headers.get("content-type") || "audio/mp4";
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `podcast_${jobId}.m4b`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Create audit log
      createAuditLog(req.userId!, 'podcast_download', 'success', '/api/podcast/download', {
        jobId,
        filename
      }, ipHash);

      // Stream the file to the client
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      // Stream the response
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };

      await pump();

    } catch (error) {
      console.error("[Podcast] Download error:", error);

      createAuditLog(req.userId!, 'podcast_download', 'failure', '/api/podcast/download', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      if (!res.headersSent) {
        res.status(500).json({
          error: isConnectionError
            ? "Podcast-Service nicht verfügbar"
            : "Download fehlgeschlagen",
          details: errorMessage
        });
      }
    }
  });

  // Health check for podcast service
  app.get("/api/podcast/health", async (_req, res) => {
    try {
      const response = await fetch(`${PODCAST_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const health = await response.json();
      res.json({
        status: "ok",
        service: health
      });
    } catch (error) {
      res.json({
        status: "unavailable",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ===========================================
  // PERSONA-CHECK API (Accessibility Persona Matcher)
  // ===========================================

  // Upload and analyze document against personas
  // SECURITY: Requires authentication
  app.post("/api/persona/analyze", requireAuth, requireMinPlan('pro'), gpuRateLimit('persona'), upload.single("file"), async (req, res) => {
    const docFile = req.file;
    const ipHash = hashIP(req.ip || 'unknown');

    if (!docFile) {
      return res.status(400).json({ error: "Dokument ist erforderlich" });
    }

    const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
    const planId = workspace.plan_id as PlanId;
    const credits = CREDIT_COSTS.PERSONA_CHECK.credits;
    let creditsSpent = false;

    try {
      // Validate file type
      const fileBuffer = fs.readFileSync(docFile.path);
      const fileType = await fileTypeFromBuffer(fileBuffer);

      // Check if file is a valid document type
      const ext = docFile.originalname.toLowerCase().split('.').pop();
      const validExtensions = ['pdf', 'pptx', 'ppt', 'docx', 'doc'];

      const isValidDoc =
        (fileType && ALLOWED_DOCUMENT_TYPES.has(fileType.mime)) ||
        (ext && validExtensions.includes(ext));

      if (!isValidDoc) {
        createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/persona/analyze', {
          reason: 'invalid_file_type',
          declaredType: docFile.mimetype,
          detectedType: fileType?.mime
        }, ipHash);
        cleanupFile(docFile.path);
        return res.status(400).json({
          error: "Ungültiger Dateityp",
          details: "Unterstützte Formate: PDF, PPTX, DOCX"
        });
      }

      if (credits > 0) {
        const wallet = ensureCreditWallet(workspace.id, planId);
        if (wallet.balance < credits) {
          cleanupFile(docFile.path);
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        spendCredits(workspace.id, credits, null, {
          costKey: 'PERSONA_CHECK',
          filename: docFile.originalname,
        });
        creditsSpent = true;
      }

      // Forward the file to the persona service
      const formData = new FormData();
      formData.append("file", fs.createReadStream(docFile.path), {
        filename: docFile.originalname || path.basename(docFile.path),
        contentType: docFile.mimetype || "application/octet-stream",
      });

      console.log(`[Persona] Forwarding document to persona service: ${docFile.originalname}`);

      const response = await axios.post(
        `${PERSONA_SERVICE_URL}/analyze`,
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000,
          validateStatus: () => true,
        }
      );

      if (response.status < 200 || response.status >= 300) {
        const errorText = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        throw new Error(`Persona service error: ${response.status} - ${errorText}`);
      }

      const result = response.data;

      // Create audit log
      createAuditLog(req.userId!, 'persona_analyze', 'success', '/api/persona/analyze', {
        filename: docFile.originalname,
        jobId: result.job_id
      }, ipHash);

      // Cleanup temp file
      cleanupFile(docFile.path);

      res.json(result);

    } catch (error) {
      cleanupFile(docFile.path);
      console.error("[Persona] Analysis error:", error);

      createAuditLog(req.userId!, 'persona_analyze', 'failure', '/api/persona/analyze', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      if (creditsSpent && credits > 0) {
        try {
          addCredits(workspace.id, credits, 'ADJUST', {
            refundFor: 'persona_analyze',
            error: errorMessage,
          });
        } catch {}
      }

      res.status(500).json({
        error: isConnectionError
          ? "Persona-Service nicht verfügbar. Bitte versuchen Sie es später erneut."
          : "Analyse fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // Get persona analysis status
  // SECURITY: Requires authentication
  app.get("/api/persona/status/:jobId", requireAuth, async (req, res) => {
    const { jobId } = req.params;

    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/status/${jobId}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Job nicht gefunden" });
        }
        throw new Error(`Status check failed: ${response.status}`);
      }

      const status = await response.json();
      res.json(status);

    } catch (error) {
      console.error("[Persona] Status check error:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: isConnectionError
          ? "Persona-Service nicht verfügbar"
          : "Status-Abfrage fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // Get completed persona report
  // SECURITY: Requires authentication
  app.get("/api/persona/report/:jobId", requireAuth, async (req, res) => {
    const { jobId } = req.params;

    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/report/${jobId}`, {
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Report nicht gefunden" });
        }
        if (response.status === 400) {
          const data = await response.json();
          return res.status(400).json(data);
        }
        throw new Error(`Report fetch failed: ${response.status}`);
      }

      const report = await response.json();
      res.json(report);

    } catch (error) {
      console.error("[Persona] Report fetch error:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: isConnectionError
          ? "Persona-Service nicht verfügbar"
          : "Report-Abruf fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // Health check for persona service
  app.get("/api/persona/health", async (_req, res) => {
    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const health = await response.json();
      res.json({
        status: "ok",
        service: health
      });
    } catch (error) {
      res.json({
        status: "unavailable",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get available tests for custom personas
  app.get("/api/persona/available-tests", async (_req, res) => {
    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/available-tests`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch available tests: ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[Persona] Available tests error:", error);
      res.status(500).json({
        error: "Fehler beim Laden der verfügbaren Tests",
        tests: []
      });
    }
  });

  // List custom personas
  app.get("/api/persona/custom-personas", async (_req, res) => {
    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/custom-personas`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch custom personas: ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[Persona] Custom personas list error:", error);
      res.json({ count: 0, personas: [] });
    }
  });

  // Create custom persona
  app.post("/api/persona/custom-personas", requireAuth, async (req, res) => {
    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/custom-personas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[Persona] Custom persona create error:", error);
      res.status(500).json({
        error: "Fehler beim Erstellen der Persona"
      });
    }
  });

  // Delete custom persona
  app.delete("/api/persona/custom-personas/:personaId", requireAuth, async (req, res) => {
    const { personaId } = req.params;
    try {
      const response = await fetch(`${PERSONA_SERVICE_URL}/custom-personas/${personaId}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Persona nicht gefunden" });
        }
        throw new Error(`Failed to delete persona: ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[Persona] Custom persona delete error:", error);
      res.status(500).json({
        error: "Fehler beim Löschen der Persona"
      });
    }
  });

  // Optimize text for a specific persona
  // SECURITY: Requires authentication
  app.post("/api/persona/optimize-text", requireAuth, gpuRateLimit('persona'), async (req, res) => {
    const { text, persona_id } = req.body;
    const ipHash = hashIP(req.ip || 'unknown');

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({ error: "Text muss mindestens 10 Zeichen lang sein" });
    }

    if (!persona_id || typeof persona_id !== 'string') {
      return res.status(400).json({ error: "Persona-ID ist erforderlich" });
    }

    try {
      console.log(`[Persona] Optimizing text for persona: ${persona_id}`);

      const response = await fetch(`${PERSONA_SERVICE_URL}/optimize-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, persona_id }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Persona service error: ${response.status}`);
      }

      const data = await response.json();

      createAuditLog(req.userId!, 'persona_optimize_text', 'success', '/api/persona/optimize-text', {
        persona_id,
        inputLength: text.length,
        outputLength: data.optimized_text?.length || 0,
      }, ipHash);

      res.json(data);

    } catch (error) {
      console.error("[Persona] Text optimization error:", error);

      createAuditLog(req.userId!, 'persona_optimize_text', 'failure', '/api/persona/optimize-text', {
        persona_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: isConnectionError
          ? "Persona-Service nicht verfügbar"
          : "Textoptimierung fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // Fix critical issues in PPTX for a specific persona
  // SECURITY: Requires authentication
  app.post("/api/persona/fix-critical", requireAuth, gpuRateLimit('persona'), upload.single("file"), async (req, res) => {
    const file = req.file;
    const personaId = req.body.persona_id;
    const jobId = req.body.job_id;
    const ipHash = hashIP(req.ip || 'unknown');

    if (!file) {
      return res.status(400).json({ error: "Datei erforderlich" });
    }

    // Validate file type - only PPTX allowed for fixing
    const ext = (safeExtensionFromOriginalName(file.originalname) || '').toLowerCase();
    if (ext !== ".pptx" && ext !== ".ppt") {
      return res.status(400).json({
        error: "Nur PowerPoint-Dateien unterstützt",
        details: `Erhaltene Datei: ${ext}`
      });
    }

    if (!personaId || typeof personaId !== 'string') {
      return res.status(400).json({ error: "Persona-ID erforderlich" });
    }

    const validPersonas = ["ingrid", "mehmet", "fatima", "thomas", "aisha", "sandra", "viktor"];
    if (!validPersonas.includes(personaId)) {
      return res.status(400).json({
        error: "Ungültige Persona-ID",
        validPersonas
      });
    }

	    try {
	      console.log(`[Persona] Fixing critical issues for persona: ${personaId}`);

	      // Create FormData for the persona service
	      const formData = new FormData();
	      formData.append("file", fs.createReadStream(file.path), {
	        filename: file.originalname || path.basename(file.path),
	        contentType: file.mimetype || "application/octet-stream",
	      });
	      formData.append("persona_id", personaId);
	      if (jobId) {
	        formData.append("job_id", String(jobId));
	      }

	      const response = await axios.post(
	        `${PERSONA_SERVICE_URL}/fix-critical`,
	        formData,
	        {
	          headers: formData.getHeaders(),
	          responseType: "arraybuffer",
	          maxBodyLength: Infinity,
	          maxContentLength: Infinity,
	          timeout: 120000,
	          validateStatus: () => true,
	        }
	      );

	      if (response.status < 200 || response.status >= 300) {
	        let details = "";
	        try {
	          const text = Buffer.from(response.data).toString("utf8");
	          details = text;
	          try {
	            const parsed = JSON.parse(text);
	            details = parsed?.detail || parsed?.error || details;
	          } catch {
	            // Not JSON; keep text
	          }
	        } catch {
	          // Ignore parse/decode errors
	        }
	        throw new Error(details || `Persona service error: ${response.status}`);
	      }

	      const buffer = Buffer.from(response.data);

	      createAuditLog(req.userId!, 'persona_fix_critical', 'success', '/api/persona/fix-critical', {
	        persona_id: personaId,
	        filename: file.originalname,
	        outputSize: buffer.length,
	      }, ipHash);

	      cleanupFile(file.path);

	      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
	      res.setHeader("Content-Disposition", `attachment; filename="${file.originalname.replace(/\.pptx?$/i, `_${personaId}_korrigiert.pptx`)}"`);
	      res.send(buffer);

	    } catch (error) {
	      cleanupFile(file.path);
	      console.error("[Persona] Fix critical error:", error);

      createAuditLog(req.userId!, 'persona_fix_critical', 'failure', '/api/persona/fix-critical', {
        persona_id: personaId,
        filename: file.originalname,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isConnectionError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed");

      res.status(500).json({
        error: isConnectionError
          ? "Persona-Service nicht verfügbar"
          : "PPTX-Korrektur fehlgeschlagen",
        details: errorMessage
      });
    }
  });

  // ===========================================
  // CHAPTER DETECTION
  // ===========================================

  // Detect chapters in SRT content using AI
  app.post(
    "/api/chapters/detect",
    requireAuth,
    gpuRateLimit('chapters_detect', {
      free: clampInt(Number(process.env.CHAPTERS_DETECT_RATE_LIMIT_FREE || 3), 1, 60, 3),
      pro: clampInt(Number(process.env.CHAPTERS_DETECT_RATE_LIMIT_PRO || 10), 1, 200, 10),
      premium: clampInt(Number(process.env.CHAPTERS_DETECT_RATE_LIMIT_PREMIUM || 20), 1, 500, 20),
      team: clampInt(Number(process.env.CHAPTERS_DETECT_RATE_LIMIT_TEAM || 30), 1, 1000, 30),
    }),
    async (req, res) => {
    const { srtContent } = req.body;
    const ipHash = hashIP(req.ip || 'unknown');

    if (!srtContent || typeof srtContent !== 'string' || srtContent.trim().length < 10) {
      return res.status(400).json({ error: "SRT content is required" });
    }

    try {
      createAuditLog(req.userId!, 'chapter_detection_attempt', 'success', '/api/chapters/detect', {
        srtLength: srtContent.length
      }, ipHash);

      const response = await fetch(`${PERSONA_SERVICE_URL}/analyze-chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srt: srtContent }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Persona service error: ${response.status}`);
      }

      const data = await response.json();

      createAuditLog(req.userId!, 'chapter_detection', 'success', '/api/chapters/detect', {
        chaptersDetected: data.count
      }, ipHash);

      res.json({
        chapters: data.chapters,
        count: data.count
      });

    } catch (error) {
      console.error("[Chapters] Detection error:", error);
      createAuditLog(req.userId!, 'chapter_detection', 'failure', '/api/chapters/detect', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      res.status(500).json({
        error: "Chapter detection failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
    }
  );

  // ===========================================
  // PPTX TO PDF/UA CONVERSION
  // ===========================================

  const PDFUA_SERVICE_URL = process.env.PDFUA_SERVICE_URL || "http://pdfua-service:8000";

  // Store job notification preferences (in-memory, cleaned up after 24h)
  const jobNotifications = new Map<string, { email: string; filename: string; notified: boolean; createdAt: number }>();

  // Cleanup old entries every hour
  setInterval(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [jobId, data] of jobNotifications.entries()) {
      if (data.createdAt < dayAgo) {
        jobNotifications.delete(jobId);
      }
    }
  }, 60 * 60 * 1000);

  // Health check for PDF/UA service
  app.get("/api/convert-pptx/health", async (_req, res) => {
    try {
      const response = await fetch(`${PDFUA_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return res.status(503).json({
          status: "unavailable",
          message: "PDF/UA service not responding"
        });
      }

      const health = await response.json();
      return res.json({
        status: "ok",
        pdfua_service: health
      });

    } catch (error) {
      return res.status(503).json({
        status: "unavailable",
        message: "PDF/UA service connection failed"
      });
    }
  });

  // Upload and convert PPTX to PDF/UA
  // SECURITY: Requires authentication
  // RATE LIMITED: GPU-intensive operation (Qwen VLM)
  // Uses BullMQ queue for job management
  app.post("/api/convert-pptx", requireAuth, requireMinPlan('pro'), gpuRateLimit('pptx'), upload.single("file"), async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!req.file.originalname.toLowerCase().endsWith(".pptx")) {
        return res.status(400).json({ error: "Only PPTX files are supported" });
      }

      const pptxValidation = await validateFileType(req.file.path, ALLOWED_PPTX_TYPES, req.file.mimetype);
      if (!pptxValidation.valid) {
        createAuditLog(req.userId!, 'file_upload_rejected', 'failure', '/api/convert-pptx', {
          reason: 'invalid_file_type',
          declaredType: req.file.mimetype,
          detectedType: pptxValidation.detectedType,
          error: pptxValidation.error
        }, ipHash);
        cleanupFile(req.file.path);
        return res.status(400).json({
          error: 'Ungültiger Dateityp',
          details: pptxValidation.error
        });
      }

      console.log(`[PPTX] Queuing conversion: ${req.file.originalname} (${req.file.size} bytes)`);

      // Sanitize filename: replace spaces and special chars
      const sanitizedFilename = req.file.originalname
        .replace(/\s+/g, '_')
        .replace(/[^\w\-_.]/g, '');

      // Generate job ID
      const { nanoid } = await import('nanoid');
      const jobId = `pdfua_${nanoid(12)}`;

      // Get email notification preference
      const notifyEmail = req.body?.notifyEmail;
      const storageTarget = resolveStorageTarget(req.user!, {
        scope: req.body.storageScope,
        workspaceId: req.body.workspaceId,
        projectId: req.body.projectId,
      });

      const workspace = storageTarget.scope === 'workspace' && storageTarget.workspaceId
        ? getWorkspaceById(storageTarget.workspaceId) || getOrCreateDefaultWorkspaceForUser(req.user!)
        : getOrCreateDefaultWorkspaceForUser(req.user!);
      const planId = workspace.plan_id as PlanId;
      const slideCount = await getPptxSlideCount(req.file.path);
      const estimatedCredits = slideCount * CREDIT_COSTS.PDFUA_SMART_SLIDE.credits;

      // Check if Redis/queue is available
      const redisAvailable = await isRedisAvailable();

      if (redisAvailable) {
        const wallet = ensureCreditWallet(workspace.id, planId);
        if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
          cleanupFile(req.file.path);
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        if (estimatedCredits > 0) {
          reserveCredits(workspace.id, estimatedCredits, jobId, {
            costKey: 'PDFUA_SMART_SLIDE',
            slideCount,
          });
        }

        // Create job in our job-store (for tracking)
        createJob({
          id: jobId,
          queue: 'pdfua',
          userId: req.userId!,
          storageScope: storageTarget.scope,
          workspaceId: workspace.id,
          projectId: storageTarget.projectId || null,
          jobType: 'PDFUA_SMART_SLIDE',
          estimatedCredits,
          priority: 2,
          inputData: {
            originalName: req.file.originalname,
            sanitizedName: sanitizedFilename,
            fileSize: req.file.size,
            notifyEmail,
            slideCount,
          },
          expiresInHours: 48,
        });

        // Add to BullMQ queue for async processing
        try {
          await pdfuaQueue.add('convert', {
            jobId,
            userId: req.userId!,
            inputFilePath: req.file.path, // Worker will read from here
            originalName: sanitizedFilename,
            notifyEmail,
            storageScope: storageTarget.scope,
            workspaceId: workspace.id,
            projectId: storageTarget.projectId || null,
          }, {
            jobId, // Use same ID for BullMQ job
            priority: 2,
          });
        } catch (error) {
          if (estimatedCredits > 0) {
            try { releaseCredits(workspace.id, estimatedCredits, jobId, { status: 'enqueue_failed' }); } catch {}
          }
          cleanupFile(req.file.path);
          throw error;
        }

        console.log(`[PPTX] Job queued: ${jobId}`);

        createAuditLog(req.userId!, 'pptx_convert', 'success', '/api/convert-pptx', {
          filename: req.file.originalname,
          jobId
        }, ipHash);

        // Return job info for frontend polling
        return res.json({
          job_id: jobId,
          status: 'queued',
          message: 'Job added to queue. Check status at /api/convert-pptx/jobs/:jobId'
        });

      } else {
        // Fallback: Direct call to pdfua-service (no queue)
        console.log(`[PPTX] Redis unavailable, using direct call`);

        const wallet = ensureCreditWallet(workspace.id, planId);
        if (estimatedCredits > 0 && wallet.balance < estimatedCredits) {
          cleanupFile(req.file.path);
          return res.status(402).json({ error: "Nicht genug Credits" });
        }
        if (estimatedCredits > 0) {
          spendCredits(workspace.id, estimatedCredits, null, {
            costKey: 'PDFUA_SMART_SLIDE',
            slideCount,
            mode: 'direct',
          });
        }

        const axios = (await import('axios')).default;
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append("file", fs.createReadStream(req.file.path), {
          filename: sanitizedFilename,
          contentType: req.file.mimetype,
        });

        const response = await axios.post(`${PDFUA_SERVICE_URL}/convert`, formData, {
          headers: formData.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const result = response.data;

        // Store notification preference if email provided
        if (notifyEmail && result.job_id) {
          jobNotifications.set(result.job_id, {
            email: notifyEmail,
            filename: req.file.originalname,
            notified: false,
            createdAt: Date.now()
          });
        }

        createAuditLog(req.userId!, 'pptx_convert', 'success', '/api/convert-pptx', {
          filename: req.file.originalname,
          jobId: result.job_id
        }, ipHash);

        cleanupFile(req.file.path);
        return res.json(result);
      }

    } catch (error) {
      console.error("[PPTX] Conversion error:", error);

      createAuditLog(req.userId!, 'pptx_convert', 'failure', '/api/convert-pptx', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);

      // Cleanup temp file on error
      if (req.file?.path) cleanupFile(req.file.path);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage === 'workspace_forbidden' || errorMessage === 'project_forbidden') {
        return res.status(403).json({ error: "Kein Zugriff auf den Workspace/Ordner" });
      }

      return res.status(500).json({
        error: "Conversion failed",
        details: errorMessage
      });
    }
  });

  // Get job status
  // Handles both queue jobs (pdfua_*) and direct pdfua-service jobs
  // Using optionalAuth - job ID serves as authorization
  app.get("/api/convert-pptx/jobs/:jobId", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;

      // Check if this is a queued job (our job-store)
      if (jobId.startsWith('pdfua_')) {
        const job = getJob(jobId);

        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }

        // Parse stored data
        const inputData = job.input_data ? JSON.parse(job.input_data) : {};
        const resultData = job.result_data ? JSON.parse(job.result_data) : null;

        // Build response in pdfua-service format for frontend compatibility
        const statusResponse: any = {
          job_id: jobId,
          status: job.status === 'active' ? 'processing' : job.status,
          progress: {
            phase: job.progress_stage || 'queued',
            percentage: job.progress_percent || 0,
          },
          filename: inputData.originalName || inputData.sanitizedName,
          created_at: job.created_at,
        };

        if (job.status === 'completed' && resultData) {
          statusResponse.result = {
            pdfua_compliant: resultData.pdfuaCompliant,
            processing_time_seconds: resultData.processingTime,
            download_url: `/api/convert-pptx/jobs/${resultData.serviceJobId}/download`,
            report_url: `/api/convert-pptx/jobs/${resultData.serviceJobId}/report`,
          };
          // Store serviceJobId for download endpoint
          statusResponse.serviceJobId = resultData.serviceJobId;
        }

        if (job.status === 'failed') {
          statusResponse.error = job.error_message || 'Conversion failed';
        }

        // Get queue position if still waiting
        if (job.status === 'pending') {
          const { getJobPosition, getQueueStats } = await import('./queue');
          const [position, stats] = await Promise.all([
            getJobPosition('pdfua', jobId),
            getQueueStats('pdfua'),
          ]);
          statusResponse.queue = {
            position,
            estimatedWaitMinutes: Math.ceil(stats.estimatedWaitSeconds / 60),
            totalInQueue: stats.waiting + stats.active,
          };
        }

        return res.json(statusResponse);
      }

      // Legacy: Direct pdfua-service job
      const response = await fetch(`${PDFUA_SERVICE_URL}/jobs/${jobId}`);

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Job not found" });
        }
        return res.status(response.status).json({ error: "Service error" });
      }

      const status = await response.json();

      // Send email notification if job completed/failed and notification is registered
      const notification = jobNotifications.get(jobId);
      if (notification && !notification.notified) {
        if (status.status === "completed" || status.status === "failed") {
          const success = status.status === "completed";
          const pdfuaCompliant = status.result?.pdfua_compliant ?? false;

          // Mark as notified before sending to prevent duplicates
          notification.notified = true;
          jobNotifications.set(jobId, notification);

          // Send email asynchronously (don't block response)
          sendConversionCompleteEmail(
            notification.email,
            notification.filename,
            jobId,
            success,
            pdfuaCompliant
          ).then(result => {
            if (result.success) {
              console.log(`[PPTX] Email notification sent for job ${jobId}`);
            } else {
              console.error(`[PPTX] Failed to send email notification for job ${jobId}:`, result.error);
            }
          });
        }
      }

      return res.json(status);

    } catch (error) {
      console.error("[PPTX] Job status error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Download converted PDF
  // Handles both queue jobs (pdfua_*) and direct pdfua-service jobs
  // Using optionalAuth to allow downloads even if token expired (job ID serves as auth)
  app.get("/api/convert-pptx/jobs/:jobId/download", optionalAuth, async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      let { jobId } = req.params;
      let originalJobId = jobId;

      // For queue jobs, get the serviceJobId from our job-store
      if (jobId.startsWith('pdfua_')) {
        const job = getJob(jobId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.status !== 'completed') {
          return res.status(400).json({ error: "Job not completed yet" });
        }
        const resultData = job.result_data ? JSON.parse(job.result_data) : null;
        if (!resultData?.serviceJobId) {
          return res.status(404).json({ error: "Download not available" });
        }
        jobId = resultData.serviceJobId;
      }

      const response = await fetch(`${PDFUA_SERVICE_URL}/jobs/${jobId}/download`);

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "File not found" });
        }
        return res.status(response.status).json({ error: "Download error" });
      }

      // Get filename from Content-Disposition header
      const disposition = response.headers.get("content-disposition");
      const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] || "accessible.pdf";

      createAuditLog(req.userId ?? null, 'pptx_download', 'success', `/api/convert-pptx/jobs/${originalJobId}/download`, {
        jobId: originalJobId,
        serviceJobId: jobId,
        filename
      }, ipHash);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      // Stream the PDF to the client
      const nodeStream = await import('stream');
      const webStream = response.body;
      if (webStream) {
        const readable = nodeStream.Readable.fromWeb(webStream as any);
        readable.pipe(res);
      } else {
        res.status(500).json({ error: "No response body" });
      }

    } catch (error) {
      console.error("[PPTX] Download error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get validation report
  // Handles both queue jobs (pdfua_*) and direct pdfua-service jobs
  app.get("/api/convert-pptx/jobs/:jobId/report", optionalAuth, async (req, res) => {
    try {
      let { jobId } = req.params;
      const format = req.query.format || "json";

      // For queue jobs, get the serviceJobId from our job-store
      if (jobId.startsWith('pdfua_')) {
        const job = getJob(jobId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.status !== 'completed') {
          return res.status(400).json({ error: "Job not completed yet" });
        }
        const resultData = job.result_data ? JSON.parse(job.result_data) : null;
        if (!resultData?.serviceJobId) {
          return res.status(404).json({ error: "Report not available" });
        }
        jobId = resultData.serviceJobId;
      }

      const response = await fetch(`${PDFUA_SERVICE_URL}/jobs/${jobId}/report?format=${format}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Report not available" });
      }

      if (format === "html") {
        // The report may contain user-supplied strings; prevent script execution when opened in a tab.
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:;"
        );
        res.setHeader("Content-Type", "text/html");
        const html = await response.text();
        return res.send(html);
      }

      const report = await response.json();
      return res.json(report);

    } catch (error) {
      console.error("[PPTX] Report error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===========================================
  // PPTX COLOR ANALYSIS
  // ===========================================

  // Analyze colors in a PPTX file
  app.post("/api/tools/pptx/analyze-colors", optionalAuth, gpuRateLimit('color-analysis'), upload.single("file"), async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }

      // Validate file type
      const validation = await validateFileType(req.file.path, ALLOWED_PPTX_TYPES, req.file.mimetype);
      if (!validation.valid) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Nur PPTX-Dateien sind erlaubt" });
      }

      // Check file size (50MB limit)
      const maxSize = 50 * 1024 * 1024;
      if (req.file.size > maxSize) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Datei zu groß (max. 50MB)" });
      }

      // Forward to PDFUA service using axios (fetch doesn't work with form-data package)
      const axios = (await import('axios')).default;
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });

      const response = await axios.post(`${PDFUA_SERVICE_URL}/analyze-colors`, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      if (response.status >= 400) {
        const error = response.data;
        return res.status(response.status).json({ error: error?.detail || "Analyse fehlgeschlagen" });
      }

      const result = response.data;

      createAuditLog(req.userId ?? null, 'color_analysis', 'success', '/api/tools/pptx/analyze-colors', {
        filename: req.file.originalname,
        jobId: result.job_id
      }, ipHash);

      return res.json(result);

    } catch (error) {
      console.error("[ColorAnalysis] Error:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      createAuditLog(req.userId ?? null, 'color_analysis', 'failure', '/api/tools/pptx/analyze-colors', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);
      return res.status(500).json({ error: "Interner Fehler bei der Farbanalyse" });
    }
  });

  // Get color analysis status
  app.get("/api/tools/pptx/analyze-colors/:jobId", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;

      const response = await fetch(`${PDFUA_SERVICE_URL}/analyze-colors/${jobId}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Job nicht gefunden" });
      }

      const result = await response.json();
      return res.json(result);

    } catch (error) {
      console.error("[ColorAnalysis] Status error:", error);
      return res.status(500).json({ error: "Interner Fehler" });
    }
  });

  // Get slide thumbnail
  app.get("/api/tools/pptx/analyze-colors/:jobId/thumbnail/:slideNum", optionalAuth, async (req, res) => {
    try {
      const { jobId, slideNum } = req.params;

      const response = await fetch(`${PDFUA_SERVICE_URL}/analyze-colors/${jobId}/thumbnail/${slideNum}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Thumbnail nicht gefunden" });
      }

      // Stream the image
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));

    } catch (error) {
      console.error("[ColorAnalysis] Thumbnail error:", error);
      return res.status(500).json({ error: "Interner Fehler" });
    }
  });

  // Fix colors in PPTX
  app.post("/api/tools/pptx/fix-colors", optionalAuth, async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      const { job_id, replacements, target_level } = req.body;

      if (!job_id) {
        return res.status(400).json({ error: "job_id ist erforderlich" });
      }

      const response = await fetch(`${PDFUA_SERVICE_URL}/fix-colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id, replacements: replacements || [], target_level })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unbekannter Fehler" }));
        return res.status(response.status).json({ error: error.detail || "Korrektur fehlgeschlagen" });
      }

      const result = await response.json();

      createAuditLog(req.userId ?? null, 'color_fix', 'success', '/api/tools/pptx/fix-colors', {
        jobId: job_id,
        targetLevel: target_level
      }, ipHash);

      return res.json(result);

    } catch (error) {
      console.error("[ColorFix] Error:", error);
      createAuditLog(req.userId ?? null, 'color_fix', 'failure', '/api/tools/pptx/fix-colors', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);
      return res.status(500).json({ error: "Interner Fehler bei der Farbkorrektur" });
    }
  });

  // Get fix status
  app.get("/api/tools/pptx/fix-colors/:jobId", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;

      // Use the analyze-colors endpoint as fix jobs are stored there too
      const response = await fetch(`${PDFUA_SERVICE_URL}/analyze-colors/${jobId}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Job nicht gefunden" });
      }

      const result = await response.json();
      return res.json(result);

    } catch (error) {
      console.error("[ColorFix] Status error:", error);
      return res.status(500).json({ error: "Interner Fehler" });
    }
  });

  // Download fixed PPTX
  app.get("/api/tools/pptx/fix-colors/:jobId/download", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;

      const response = await fetch(`${PDFUA_SERVICE_URL}/fix-colors/${jobId}/download`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Download nicht verfügbar" });
      }

      // Get filename from headers or use default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'präsentation_barrierefrei.pptx';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) filename = match[1];
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));

    } catch (error) {
      console.error("[ColorFix] Download error:", error);
      return res.status(500).json({ error: "Download fehlgeschlagen" });
    }
  });

  // ===========================================
  // PDF FORM ANALYSIS
  // ===========================================

  app.post("/api/tools/pdf/analyze-forms", optionalAuth, upload.single("file"), async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }

      const validation = await validateFileType(req.file.path, ALLOWED_PDF_TYPES, req.file.mimetype);
      if (!validation.valid) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Nur PDF-Dateien sind erlaubt" });
      }

      const maxSize = 150 * 1024 * 1024;
      if (req.file.size > maxSize) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Datei zu groß (max. 150MB)" });
      }

      const axios = (await import('axios')).default;
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: 'application/pdf'
      });

      const response = await axios.post(`${PDFUA_SERVICE_URL}/analyze-forms`, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true,
      });

      fs.unlinkSync(req.file.path);

      if (response.status >= 400) {
        const error = response.data;
        return res.status(response.status).json({ error: error?.detail || "Analyse fehlgeschlagen" });
      }

      const result = response.data;

      createAuditLog(req.userId ?? null, 'form_analysis', 'success', '/api/tools/pdf/analyze-forms', {
        filename: req.file.originalname,
        jobId: result.job_id
      }, ipHash);

      return res.json(result);

    } catch (error) {
      console.error("[FormAnalysis] Error:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      createAuditLog(req.userId ?? null, 'form_analysis', 'failure', '/api/tools/pdf/analyze-forms', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);
      return res.status(500).json({ error: "Interner Fehler bei der Formularanalyse" });
    }
  });

  app.get("/api/tools/pdf/analyze-forms/:jobId", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;

      const response = await fetch(`${PDFUA_SERVICE_URL}/analyze-forms/${jobId}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Job nicht gefunden" });
      }

      const result = await response.json();
      return res.json(result);

    } catch (error) {
      console.error("[FormAnalysis] Status error:", error);
      return res.status(500).json({ error: "Interner Fehler" });
    }
  });

  // ===========================================
  // PDF/UA CONFORMANCE CHECK
  // ===========================================

  app.post("/api/tools/pdf/check-pdfua", optionalAuth, upload.single("file"), async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }

      const validation = await validateFileType(req.file.path, ALLOWED_PDF_TYPES, req.file.mimetype);
      if (!validation.valid) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Nur PDF-Dateien sind erlaubt" });
      }

      const maxSize = 150 * 1024 * 1024;
      if (req.file.size > maxSize) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Datei zu groß (max. 150MB)" });
      }

      const axios = (await import('axios')).default;
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: 'application/pdf'
      });

      const response = await axios.post(`${PDFUA_SERVICE_URL}/check-pdfua`, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true,
      });

      fs.unlinkSync(req.file.path);

      if (response.status >= 400) {
        const error = response.data;
        return res.status(response.status).json({ error: error?.detail || "PDF/UA-Prüfung fehlgeschlagen" });
      }

      const result = response.data;

      createAuditLog(req.userId ?? null, 'pdfua_check', 'success', '/api/tools/pdf/check-pdfua', {
        filename: req.file.originalname,
        jobId: result.job_id
      }, ipHash);

      return res.json(result);

    } catch (error) {
      console.error("[PdfuaCheck] Error:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      createAuditLog(req.userId ?? null, 'pdfua_check', 'failure', '/api/tools/pdf/check-pdfua', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);
      return res.status(500).json({ error: "Interner Fehler bei der PDF/UA-Prüfung" });
    }
  });

  app.get("/api/tools/pdf/check-pdfua/:jobId", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;

      const response = await fetch(`${PDFUA_SERVICE_URL}/check-pdfua/${jobId}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Job nicht gefunden" });
      }

      const result = await response.json();
      return res.json(result);

    } catch (error) {
      console.error("[PdfuaCheck] Status error:", error);
      return res.status(500).json({ error: "Interner Fehler" });
    }
  });

  // ===========================================
  // URL SHORTENER
  // ===========================================

  // Import URL shortener service
	  const {
	    createShortLink,
	    findShortLink,
	    getActiveLinkCount,
	    getUserLinks,
	    deleteLink,
	    getLinkStats,
	    isValidUrl,
	    isValidCustomCode,
	    isCodeAvailable,
	    getLinkStatus,
    updateShortLink,
    toggleLinkPause,
    verifyLinkPassword,
    recordClick,
    getClickStats
  } = await import('./services/url-shortener');

  // Create a new short link
  app.post("/api/links", requireAuth, async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      const workspace = getOrCreateDefaultWorkspaceForUser(req.user!);
      const planId = workspace.plan_id as PlanId;
      const maxLinks = planId === 'free' ? 10 : planId === 'pro' ? 100 : Infinity;
      const activeLinks = getActiveLinkCount(req.userId!);
      if (Number.isFinite(maxLinks) && activeLinks >= maxLinks) {
        return res.status(403).json({
          error: "Limit erreicht",
          message: `Sie haben bereits ${activeLinks} aktive Links. Limit für ${planId}: ${maxLinks}.`,
          requiresUpgrade: planId !== 'premium',
        });
      }

      const { url, title, customCode, expiresAt, password } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL ist erforderlich" });
      }

      if (!isValidUrl(url)) {
        return res.status(400).json({ error: "Ungültige URL. Nur HTTP und HTTPS sind erlaubt." });
      }

      if (url.length > 2048) {
        return res.status(400).json({ error: "URL ist zu lang (max. 2048 Zeichen)" });
      }

      if (title && title.length > 255) {
        return res.status(400).json({ error: "Titel ist zu lang (max. 255 Zeichen)" });
      }

      // Validate custom code if provided
      if (customCode) {
        if (!isValidCustomCode(customCode)) {
          return res.status(400).json({
            error: "Ungültiger Custom Code. Erlaubt: 3-50 Zeichen, nur Kleinbuchstaben, Zahlen und Bindestriche."
          });
        }
        if (!isCodeAvailable(customCode)) {
          return res.status(400).json({ error: "Dieser Custom Code ist bereits vergeben." });
        }
      }

      // Parse expiration date if provided
      let expiresDate: Date | undefined;
      if (expiresAt) {
        expiresDate = new Date(expiresAt);
        if (isNaN(expiresDate.getTime())) {
          return res.status(400).json({ error: "Ungültiges Ablaufdatum" });
        }
        if (expiresDate <= new Date()) {
          return res.status(400).json({ error: "Ablaufdatum muss in der Zukunft liegen" });
        }
      }

      // Validate password if provided
      if (password && password.length < 4) {
        return res.status(400).json({ error: "Passwort muss mindestens 4 Zeichen lang sein" });
      }

      const link = await createShortLink(url, req.userId!, {
        title,
        customCode,
        expiresAt: expiresDate,
        password
      });

      createAuditLog(req.userId!, 'link_create', 'success', '/api/links', {
        shortCode: link.short_code,
        targetUrl: url.substring(0, 100),
        hasCustomCode: !!customCode,
        hasExpiry: !!expiresAt,
        hasPassword: !!password
      }, ipHash);

      return res.json({
        id: link.id,
        shortCode: link.short_code,
        shortUrl: `${getPublicBaseUrl(req)}/s/${link.short_code}`,
        targetUrl: link.target_url,
        title: link.title,
        clicks: link.clicks,
        createdAt: link.created_at,
        expiresAt: link.expires_at,
        isPaused: link.is_paused === 1,
        hasPassword: !!link.password_hash
      });

    } catch (error) {
      console.error("[URL] Create link error:", error);
      createAuditLog(req.userId!, 'link_create', 'failure', '/api/links', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, ipHash);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Link konnte nicht erstellt werden" });
    }
  });

  // Get all links for current user
  app.get("/api/links", requireAuth, async (req, res) => {
    try {
      const links = getUserLinks(req.userId!);
      const now = new Date();
      const baseUrl = getPublicBaseUrl(req);

      return res.json({
        links: links.map(link => {
          const expiresAt = link.expires_at ? new Date(link.expires_at) : null;
          const isExpired = expiresAt ? expiresAt < now : false;

          return {
            id: link.id,
            shortCode: link.short_code,
            shortUrl: `${baseUrl}/s/${link.short_code}`,
            targetUrl: link.target_url,
            title: link.title,
            clicks: link.clicks,
            createdAt: link.created_at,
            expiresAt: link.expires_at,
            isActive: link.is_active === 1,
            isPaused: link.is_paused === 1,
            isExpired,
            hasPassword: !!link.password_hash
          };
        })
      });

    } catch (error) {
      console.error("[URL] Get links error:", error);
      return res.status(500).json({ error: "Links konnten nicht geladen werden" });
    }
  });

  // Get link statistics
  app.get("/api/links/:id/stats", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Ungültige Link-ID" });
      }

      const link = getLinkStats(id, req.userId!);

      if (!link) {
        return res.status(404).json({ error: "Link nicht gefunden" });
      }

      const expiresAt = link.expires_at ? new Date(link.expires_at) : null;
      const isExpired = expiresAt ? expiresAt < new Date() : false;

      return res.json({
        id: link.id,
        shortCode: link.short_code,
        shortUrl: `${getPublicBaseUrl(req)}/s/${link.short_code}`,
        targetUrl: link.target_url,
        title: link.title,
        clicks: link.clicks,
        createdAt: link.created_at,
        expiresAt: link.expires_at,
        isActive: link.is_active === 1,
        isPaused: link.is_paused === 1,
        isExpired,
        hasPassword: !!link.password_hash
      });

    } catch (error) {
      console.error("[URL] Get stats error:", error);
      return res.status(500).json({ error: "Statistiken konnten nicht geladen werden" });
    }
  });

  // Update a link
  app.put("/api/links/:id", requireAuth, async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Ungültige Link-ID" });
      }

      const { targetUrl, title, expiresAt, password } = req.body;

      // Validate target URL if provided
      if (targetUrl !== undefined) {
        if (!isValidUrl(targetUrl)) {
          return res.status(400).json({ error: "Ungültige URL. Nur HTTP und HTTPS sind erlaubt." });
        }
        if (targetUrl.length > 2048) {
          return res.status(400).json({ error: "URL ist zu lang (max. 2048 Zeichen)" });
        }
      }

      // Validate title if provided
      if (title !== undefined && title && title.length > 255) {
        return res.status(400).json({ error: "Titel ist zu lang (max. 255 Zeichen)" });
      }

      // Parse and validate expiration date
      let expiresDate: Date | null | undefined;
      if (expiresAt !== undefined) {
        if (expiresAt === null) {
          expiresDate = null; // Remove expiration
        } else {
          expiresDate = new Date(expiresAt);
          if (isNaN(expiresDate.getTime())) {
            return res.status(400).json({ error: "Ungültiges Ablaufdatum" });
          }
        }
      }

      // Validate password if provided
      if (password !== undefined && password !== null && password.length > 0 && password.length < 4) {
        return res.status(400).json({ error: "Passwort muss mindestens 4 Zeichen lang sein" });
      }

      const updatedLink = await updateShortLink(id, req.userId!, {
        targetUrl,
        title,
        expiresAt: expiresDate,
        password
      });

      if (!updatedLink) {
        return res.status(404).json({ error: "Link nicht gefunden" });
      }

      createAuditLog(req.userId!, 'link_update', 'success', `/api/links/${id}`, {
        linkId: id,
        shortCode: updatedLink.short_code
      }, ipHash);

      const expAt = updatedLink.expires_at ? new Date(updatedLink.expires_at) : null;

      return res.json({
        id: updatedLink.id,
        shortCode: updatedLink.short_code,
        shortUrl: `${getPublicBaseUrl(req)}/s/${updatedLink.short_code}`,
        targetUrl: updatedLink.target_url,
        title: updatedLink.title,
        clicks: updatedLink.clicks,
        createdAt: updatedLink.created_at,
        expiresAt: updatedLink.expires_at,
        isActive: updatedLink.is_active === 1,
        isPaused: updatedLink.is_paused === 1,
        isExpired: expAt ? expAt < new Date() : false,
        hasPassword: !!updatedLink.password_hash
      });

    } catch (error) {
      console.error("[URL] Update link error:", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Link konnte nicht aktualisiert werden" });
    }
  });

  // Toggle link pause state
  app.post("/api/links/:id/toggle", requireAuth, async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Ungültige Link-ID" });
      }

      const link = toggleLinkPause(id, req.userId!);

      if (!link) {
        return res.status(404).json({ error: "Link nicht gefunden" });
      }

      createAuditLog(req.userId!, 'link_toggle', 'success', `/api/links/${id}/toggle`, {
        linkId: id,
        shortCode: link.short_code,
        isPaused: link.is_paused === 1
      }, ipHash);

      return res.json({
        id: link.id,
        shortCode: link.short_code,
        isPaused: link.is_paused === 1,
        message: link.is_paused === 1 ? "Link wurde pausiert" : "Link wurde reaktiviert"
      });

    } catch (error) {
      console.error("[URL] Toggle link error:", error);
      return res.status(500).json({ error: "Link-Status konnte nicht geändert werden" });
    }
  });

  // Get click statistics for a link (daily breakdown)
  app.get("/api/links/:id/clicks", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Ungültige Link-ID" });
      }

      const days = parseInt(req.query.days as string, 10) || 30;
      if (days < 1 || days > 365) {
        return res.status(400).json({ error: "Tage müssen zwischen 1 und 365 liegen" });
      }

      const stats = getClickStats(id, req.userId!, days);

      return res.json({ clicks: stats });

    } catch (error) {
      console.error("[URL] Get clicks error:", error);
      return res.status(500).json({ error: "Klick-Statistiken konnten nicht geladen werden" });
    }
  });

  // Check if custom code is available
  app.get("/api/links/check-code/:code", requireAuth, async (req, res) => {
    try {
      const { code } = req.params;

      if (!isValidCustomCode(code)) {
        return res.json({
          valid: false,
          available: false,
          message: "Ungültiger Code. Erlaubt: 3-50 Zeichen, nur Kleinbuchstaben, Zahlen und Bindestriche."
        });
      }

      const available = isCodeAvailable(code);

      return res.json({
        valid: true,
        available,
        message: available ? "Code ist verfügbar" : "Code ist bereits vergeben"
      });

    } catch (error) {
      console.error("[URL] Check code error:", error);
      return res.status(500).json({ error: "Code-Prüfung fehlgeschlagen" });
    }
  });

  // Delete a link
  app.delete("/api/links/:id", requireAuth, async (req, res) => {
    const ipHash = hashIP(req.ip || 'unknown');

    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Ungültige Link-ID" });
      }

      const deleted = deleteLink(id, req.userId!);

      if (!deleted) {
        return res.status(404).json({ error: "Link nicht gefunden" });
      }

      createAuditLog(req.userId!, 'link_delete', 'success', `/api/links/${id}`, {
        linkId: id
      }, ipHash);

      return res.json({ success: true });

    } catch (error) {
      console.error("[URL] Delete link error:", error);
      return res.status(500).json({ error: "Link konnte nicht gelöscht werden" });
    }
  });

  // Public redirect endpoint
  app.get("/s/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const status = getLinkStatus(code);

      // Link not found
      if (!status.exists || !status.link) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Link nicht gefunden - VoxDrop</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f7; }
              .container { text-align: center; padding: 2rem; max-width: 500px; }
              h1 { color: #1f2937; margin-bottom: 0.5rem; }
              p { color: #6b7280; }
              a { color: #0d9488; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Link nicht gefunden</h1>
              <p>Dieser Kurzlink existiert nicht.</p>
              <p><a href="/">Zurück zu VoxDrop</a></p>
            </div>
          </body>
          </html>
        `);
      }

      // Link is expired
      if (status.expired) {
        return res.status(410).send(`
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Link abgelaufen - VoxDrop</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); }
              .container { text-align: center; padding: 2rem; max-width: 500px; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              .icon { font-size: 48px; margin-bottom: 1rem; }
              h1 { color: #92400e; margin-bottom: 0.5rem; }
              p { color: #6b7280; margin: 0.5rem 0; }
              a { color: #0d9488; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="container" role="main">
              <div class="icon" aria-hidden="true">⏰</div>
              <h1>Link abgelaufen</h1>
              <p>Dieser Kurzlink ist leider nicht mehr gültig.</p>
              <p>Das Ablaufdatum wurde vom Ersteller festgelegt.</p>
              <p style="margin-top: 1.5rem;"><a href="/">Zurück zu VoxDrop</a></p>
            </div>
          </body>
          </html>
        `);
      }

      // Link is paused
      if (status.paused) {
        return res.status(503).send(`
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Link pausiert - VoxDrop</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); }
              .container { text-align: center; padding: 2rem; max-width: 500px; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              .icon { font-size: 48px; margin-bottom: 1rem; }
              h1 { color: #4338ca; margin-bottom: 0.5rem; }
              p { color: #6b7280; margin: 0.5rem 0; }
              a { color: #0d9488; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="container" role="main">
              <div class="icon" aria-hidden="true">⏸️</div>
              <h1>Link momentan nicht verfügbar</h1>
              <p>Dieser Kurzlink wurde vom Ersteller vorübergehend deaktiviert.</p>
              <p>Bitte versuchen Sie es später erneut.</p>
              <p style="margin-top: 1.5rem;"><a href="/">Zurück zu VoxDrop</a></p>
            </div>
          </body>
          </html>
        `);
      }

      // Link is password protected
      if (status.passwordProtected) {
        return res.send(`
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Passwortgeschützter Link - VoxDrop</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); }
              .container { text-align: center; padding: 2rem; max-width: 400px; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              .icon { font-size: 48px; margin-bottom: 1rem; }
              h1 { color: #1f2937; margin-bottom: 0.5rem; font-size: 1.5rem; }
              p { color: #6b7280; margin: 0.5rem 0; }
              form { margin-top: 1.5rem; }
              label { display: block; text-align: left; margin-bottom: 0.5rem; color: #374151; font-weight: 500; }
              input[type="password"] {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 0.5rem;
                font-size: 1rem;
                margin-bottom: 1rem;
              }
              input[type="password"]:focus {
                outline: none;
                border-color: #0d9488;
                box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
              }
              button {
                width: 100%;
                padding: 0.75rem;
                background: linear-gradient(135deg, #14b8a6, #06b6d4);
                color: white;
                border: none;
                border-radius: 0.5rem;
                font-size: 1rem;
                font-weight: 500;
                cursor: pointer;
              }
              button:hover { opacity: 0.9; }
              .error { color: #dc2626; margin-top: 0.5rem; display: none; }
              a { color: #0d9488; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="container" role="main">
              <div class="icon" aria-hidden="true">🔒</div>
              <h1>Passwortgeschützter Link</h1>
              <p>Dieser Link ist durch ein Passwort geschützt.</p>
              <form id="passwordForm" action="/s/${escapeHtml(code)}/verify" method="POST">
                <label for="password">Passwort eingeben:</label>
                <input type="password" id="password" name="password" required autocomplete="off" aria-describedby="error">
                <div id="error" class="error" role="alert"></div>
                <button type="submit">Weiter</button>
              </form>
              <p style="margin-top: 1.5rem;"><a href="/">Zurück zu VoxDrop</a></p>
            </div>
            <script>
              document.getElementById('passwordForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const password = document.getElementById('password').value;
                const errorEl = document.getElementById('error');

                try {
                  const response = await fetch('/s/${escapeHtml(code)}/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                  });

                  const data = await response.json();

                  if (data.success && data.targetUrl) {
                    window.location.href = data.targetUrl;
                  } else {
                    errorEl.textContent = 'Falsches Passwort. Bitte versuchen Sie es erneut.';
                    errorEl.style.display = 'block';
                  }
                } catch (err) {
                  errorEl.textContent = 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
                  errorEl.style.display = 'block';
                }
              });
            </script>
          </body>
          </html>
        `);
      }

      // Record the click (daily stats)
      recordClick(status.link.id);

      // 302 redirect to target URL
      return res.redirect(302, status.link.target_url);

    } catch (error) {
      console.error("[URL] Redirect error:", error);
      return res.status(500).send("Ein Fehler ist aufgetreten");
    }
  });

  // Verify password for protected link
  app.post("/s/:code/verify", async (req, res) => {
    try {
      const { code } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ success: false, error: "Passwort erforderlich" });
      }

      const isValid = await verifyLinkPassword(code, password);

      if (!isValid) {
        return res.status(401).json({ success: false, error: "Falsches Passwort" });
      }

      // Get the link to return target URL
      const status = getLinkStatus(code);
      if (!status.link) {
        return res.status(404).json({ success: false, error: "Link nicht gefunden" });
      }

      // Record the click (daily stats)
      recordClick(status.link.id);

      return res.json({ success: true, targetUrl: status.link.target_url });

    } catch (error) {
      console.error("[URL] Verify password error:", error);
      return res.status(500).json({ success: false, error: "Fehler bei der Passwortprüfung" });
    }
  });

  // Preview page (accessible, shows target before redirect)
  app.get("/p/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const link = findShortLink(code);

      if (!link) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Link nicht gefunden - VoxDrop</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f7; }
              .container { text-align: center; padding: 2rem; }
              h1 { color: #1f2937; margin-bottom: 0.5rem; }
              p { color: #6b7280; }
              a { color: #0d9488; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Link nicht gefunden</h1>
              <p>Dieser Kurzlink existiert nicht oder ist abgelaufen.</p>
              <p><a href="/">Zurück zu VoxDrop</a></p>
            </div>
          </body>
          </html>
        `);
      }

      // Parse target URL for display
      const targetHost = new URL(link.target_url).hostname;

      // BITV 2.0 compliant preview page
      return res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${link.title || 'Kurzlink'} - VoxDrop</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%);
              padding: 1rem;
            }
            .skip-link {
              position: absolute;
              top: -40px;
              left: 0;
              background: #0d9488;
              color: white;
              padding: 8px 16px;
              text-decoration: none;
              z-index: 100;
            }
            .skip-link:focus { top: 0; }
            .card {
              background: white;
              border-radius: 1rem;
              padding: 2rem;
              max-width: 500px;
              width: 100%;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
              text-align: center;
            }
            .logo {
              width: 48px;
              height: 48px;
              background: linear-gradient(135deg, #14b8a6, #06b6d4);
              border-radius: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 1.5rem;
              color: white;
              font-size: 24px;
            }
            h1 {
              color: #1f2937;
              margin: 0 0 0.5rem;
              font-size: 1.5rem;
              font-weight: 600;
            }
            .subtitle {
              color: #6b7280;
              margin: 0 0 1.5rem;
              font-size: 0.875rem;
            }
            .target-box {
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 0.75rem;
              padding: 1rem;
              margin-bottom: 1.5rem;
              word-break: break-all;
            }
            .target-label {
              font-size: 0.75rem;
              color: #6b7280;
              margin-bottom: 0.25rem;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .target-url {
              color: #0d9488;
              font-weight: 500;
              font-size: 0.875rem;
            }
            .continue-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
              background: linear-gradient(135deg, #14b8a6, #06b6d4);
              color: white;
              padding: 0.875rem 2rem;
              border-radius: 0.75rem;
              text-decoration: none;
              font-weight: 500;
              font-size: 1rem;
              transition: opacity 0.2s;
              width: 100%;
            }
            .continue-btn:hover { opacity: 0.9; }
            .continue-btn:focus {
              outline: 2px solid #0d9488;
              outline-offset: 2px;
            }
            .info {
              margin-top: 1.5rem;
              padding-top: 1rem;
              border-top: 1px solid #e5e7eb;
              font-size: 0.75rem;
              color: #9ca3af;
            }
            .info a { color: #6b7280; }
          </style>
        </head>
        <body>
          <a href="#main" class="skip-link">Zum Hauptinhalt springen</a>

          <main id="main" class="card" role="main">
            <div class="logo" aria-hidden="true">🔗</div>

            <h1>${link.title ? escapeHtml(link.title) : 'Kurzlink-Vorschau'}</h1>
            <p class="subtitle">Sie werden gleich weitergeleitet zu:</p>

            <div class="target-box">
              <div class="target-label">Ziel-URL</div>
              <div class="target-url" aria-label="Zieladresse: ${escapeHtml(link.target_url)}">${escapeHtml(link.target_url)}</div>
            </div>

            <a href="${escapeHtml(link.target_url)}" class="continue-btn" rel="noopener">
              Weiter zu ${escapeHtml(targetHost)}
              <span aria-hidden="true">→</span>
            </a>

            <div class="info">
              Kurzlink bereitgestellt von <a href="/">VoxDrop</a>
            </div>
          </main>
        </body>
        </html>
      `);

    } catch (error) {
      console.error("[URL] Preview error:", error);
      return res.status(500).send("Ein Fehler ist aufgetreten");
    }
  });

  // QR code generation endpoint
  app.get("/qr/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const link = findShortLink(code);

      if (!link) {
        return res.status(404).json({ error: "Link nicht gefunden" });
      }

      // Dynamic import of qrcode
      const QRCode = (await import('qrcode')).default;

      // Generate QR code as SVG string (high contrast for WCAG)
      const shortUrl = `${getPublicBaseUrl(req)}/s/${code}`;
      const svg = await QRCode.toString(shortUrl, {
        type: 'svg',
        color: {
          dark: '#1f2937',  // Dark gray for good contrast
          light: '#ffffff'  // White background
        },
        margin: 2,
        width: 256
      });

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      return res.send(svg);

    } catch (error) {
      console.error("[URL] QR code error:", error);
      return res.status(500).json({ error: "QR-Code konnte nicht generiert werden" });
    }
  });

  // Helper function to escape HTML
  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  const httpServer = createServer(app);
  return httpServer;
}
