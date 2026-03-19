import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import archiver from "archiver";
import { requireAuth } from "../auth/middleware";
import { tmpPath } from "../utils/tmp";
import { DATA_DIR } from "../db/init";
import { checkNvencAvailable as checkNvencAvailableRuntime } from "../utils/nvenc";

const router = Router();

const CHUNKS_DIR = path.join(DATA_DIR, "recording-chunks");
const CHAPTER_EXPORTS_DIR = path.join(DATA_DIR, "chapter-exports");
const EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TARGET_SIZE_MB = 125;
const MIN_TARGET_SIZE_MB = 25;
const MAX_TARGET_SIZE_MB = 500;
const DEFAULT_EXPORT_FPS = 30;

type SubtitleFontFamilyKey = "dejavu-sans" | "dejavu-serif" | "dejavu-sans-mono";

interface SubtitleRenderStyle {
  fontSize: number;
  fontFamily: SubtitleFontFamilyKey;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
}

const SUBTITLE_FONT_FAMILIES: Record<SubtitleFontFamilyKey, string> = {
  "dejavu-sans": "DejaVu Sans",
  "dejavu-serif": "DejaVu Serif",
  "dejavu-sans-mono": "DejaVu Sans Mono",
};
const DEFAULT_SUBTITLE_RENDER_STYLE: SubtitleRenderStyle = {
  fontSize: 24,
  fontFamily: "dejavu-sans",
  fontColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 80,
};

if (!fs.existsSync(CHAPTER_EXPORTS_DIR)) {
  fs.mkdirSync(CHAPTER_EXPORTS_DIR, { recursive: true });
}

function cleanupExports() {
  try {
    const entries = fs.readdirSync(CHAPTER_EXPORTS_DIR, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(CHAPTER_EXPORTS_DIR, entry.name);
      try {
        const stats = fs.statSync(dirPath);
        if (now - stats.mtimeMs > EXPORT_MAX_AGE_MS) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup failures
      }
    }
  } catch {
    // Ignore cleanup failures
  }
}
setInterval(cleanupExports, 60 * 60 * 1000);
cleanupExports();

interface ChunkMeta {
  chunkIndex: number;
  chunkId: string;
  filename: string;
  startTime: number;
  endTime: number;
  size: number;
  uploadedAt: string;
}

interface TranscriptSegment {
  index: number;
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

interface ChunkChapter {
  timestampSeconds: number;
  label?: string;
  targetSizeMb?: number;
  source?: "recording" | "transcript" | "seeded";
}

interface ChunkSession {
  sessionId: string;
  userId: number;
  chunks: ChunkMeta[];
  chapters?: Array<{ timestampSeconds: number; label?: string }>;
  recordingMarkers?: ChunkChapter[];
  canonicalChapters?: ChunkChapter[];
  reviewedTranscriptSegments?: TranscriptSegment[];
  defaultTargetSizeMb?: number;
  chapterOverrides?: Record<string, number>;
  storageScope: string;
  workspaceId?: string;
  projectId?: string;
  createdAt: string;
  completedAt?: string;
}

interface TranscriptionJob {
  id: string;
  sessionId: string;
  userId: number;
  status: "processing" | "completed" | "failed";
  progress: number;
  currentStep: string;
  language: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface ChapterPart {
  partIndex: number;
  filename: string;
  sizeMb: number;
  durationSeconds: number;
  srtFilename?: string;
}

interface ChapterExportResult {
  index: number;
  label: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  targetSizeMb: number;
  parts: ChapterPart[];
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

interface ChapterExportJob {
  id: string;
  sessionId: string;
  userId: number;
  status: "processing" | "completed" | "failed";
  progress: number;
  currentStep: string;
  format: "mp4";
  subtitleType: "hardcoded" | "soft";
  subtitleStyle: SubtitleRenderStyle;
  includeSrt: boolean;
  defaultTargetSizeMb: number;
  language: string;
  usesReviewedTranscript: boolean;
  chapters: ChapterExportResult[];
  error?: string;
  createdAt: string;
  completedAt?: string;
}

const transcriptionJobs = new Map<string, TranscriptionJob>();
const exportJobs = new Map<string, ChapterExportJob>();

let nvencAvailable: boolean | null = null;

function checkNvencAvailable(): boolean {
  if (nvencAvailable !== null) return nvencAvailable;
  nvencAvailable = checkNvencAvailableRuntime("[ChapterExport]");
  return nvencAvailable;
}

function cleanupFile(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup failures
  }
}

function sanitizeSessionId(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "kapitel";
}

function clampTargetSize(value: unknown, fallback = DEFAULT_TARGET_SIZE_MB): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_TARGET_SIZE_MB, Math.min(MAX_TARGET_SIZE_MB, Math.round(numeric)));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function sanitizeSubtitleFontFamily(value: unknown): SubtitleFontFamilyKey {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "dejavu-serif") return "dejavu-serif";
  if (normalized === "dejavu-sans-mono") return "dejavu-sans-mono";
  return "dejavu-sans";
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function hexToAss(hex: string, transparency: number = 0): string {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  const alphaHex = Math.round(Math.max(0, Math.min(100, transparency)) * 2.55)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
}

function resolveSubtitleRenderStyle(input: {
  subtitleFontSize?: unknown;
  subtitleFontFamily?: unknown;
  subtitleFontColor?: unknown;
  subtitleBackgroundColor?: unknown;
  subtitleBackgroundOpacity?: unknown;
}): SubtitleRenderStyle {
  return {
    fontSize: clampInt(input.subtitleFontSize, 18, 42, DEFAULT_SUBTITLE_RENDER_STYLE.fontSize),
    fontFamily: sanitizeSubtitleFontFamily(input.subtitleFontFamily),
    fontColor: isHexColor(input.subtitleFontColor) ? input.subtitleFontColor : DEFAULT_SUBTITLE_RENDER_STYLE.fontColor,
    backgroundColor: isHexColor(input.subtitleBackgroundColor) ? input.subtitleBackgroundColor : DEFAULT_SUBTITLE_RENDER_STYLE.backgroundColor,
    backgroundOpacity: clampInt(input.subtitleBackgroundOpacity, 0, 100, DEFAULT_SUBTITLE_RENDER_STYLE.backgroundOpacity),
  };
}

function buildHardcodedSubtitleForceStyle(style: SubtitleRenderStyle): string {
  const primaryColour = hexToAss(style.fontColor, 0);
  const backColour = hexToAss(style.backgroundColor, 100 - style.backgroundOpacity);
  const outlineColour = hexToAss(style.backgroundColor, 0);
  const borderStyle = style.backgroundOpacity > 0 ? 4 : 1;
  return [
    `FontName=${SUBTITLE_FONT_FAMILIES[style.fontFamily]}`,
    `FontSize=${style.fontSize}`,
    `PrimaryColour=${primaryColour}`,
    `BackColour=${backColour}`,
    `OutlineColour=${outlineColour}`,
    `BorderStyle=${borderStyle}`,
    "Outline=2",
    "Shadow=0",
    "MarginV=30",
  ].join(",");
}

function coerceFiniteDuration(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function secondsToSrtTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const ms = Math.round((clamped % 1) * 1000);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function srtTimeToSeconds(time: string): number {
  const match = String(time || "").match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

function parseSrtContent(srt: string): TranscriptSegment[] {
  const trimmed = String(srt || "").trim();
  if (!trimmed) return [];
  const blocks = trimmed.split(/\n\n+/);
  const segments: TranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) continue;
    const indexRaw = Number.parseInt(lines[0], 10);
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!timeMatch) continue;
    const startSeconds = srtTimeToSeconds(timeMatch[1]);
    const endSeconds = srtTimeToSeconds(timeMatch[2]);
    const text = lines.slice(2).join("\n").trim();
    if (!text) continue;
    segments.push({
      index: Number.isFinite(indexRaw) ? indexRaw : segments.length + 1,
      startTime: secondsToSrtTime(startSeconds),
      endTime: secondsToSrtTime(endSeconds),
      startSeconds,
      endSeconds,
      text,
    });
  }

  return segments;
}

function segmentsToSrtContent(segments: TranscriptSegment[]): string {
  return `${segments
    .map((segment, index) => {
      const start = segment.startTime || secondsToSrtTime(segment.startSeconds);
      const end = segment.endTime || secondsToSrtTime(segment.endSeconds);
      return `${index + 1}\n${start} --> ${end}\n${segment.text}`;
    })
    .join("\n\n")}\n`;
}

function normalizeTranscriptSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((segment, index) => {
      if (!segment || typeof segment !== "object") return null;
      const source = segment as Record<string, unknown>;
      const startSeconds = Number(source.startSeconds);
      const endSeconds = Number(source.endSeconds);
      const text = typeof source.text === "string" ? source.text.trim() : "";
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || !text || endSeconds <= startSeconds) {
        return null;
      }
      return {
        index: index + 1,
        startSeconds,
        endSeconds,
        startTime: secondsToSrtTime(startSeconds),
        endTime: secondsToSrtTime(endSeconds),
        text,
      } satisfies TranscriptSegment;
    })
    .filter(Boolean) as TranscriptSegment[];

  return normalized.sort((a, b) => a.startSeconds - b.startSeconds);
}

function getChunkSessionPath(sessionId: string) {
  return path.join(CHUNKS_DIR, `${sessionId}.json`);
}

function loadChunkSession(sessionId: string): ChunkSession | null {
  const sessionPath = getChunkSessionPath(sessionId);
  if (!fs.existsSync(sessionPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  } catch {
    return null;
  }
}

function saveChunkSession(session: ChunkSession) {
  fs.writeFileSync(getChunkSessionPath(session.sessionId), JSON.stringify(session, null, 2));
}

function getCreatedAtTimestamp(value: string | undefined): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLatestJobForSession<T extends { sessionId: string; userId: number; createdAt: string }>(
  jobs: Map<string, T>,
  sessionId: string,
  userId: number,
): T | null {
  let latest: T | null = null;
  for (const job of jobs.values()) {
    if (job.sessionId !== sessionId || job.userId !== userId) continue;
    if (!latest || getCreatedAtTimestamp(job.createdAt) >= getCreatedAtTimestamp(latest.createdAt)) {
      latest = job;
    }
  }
  return latest;
}

function serializeTranscriptionJob(job: TranscriptionJob | null | undefined) {
  if (!job) return null;
  return {
    id: job.id,
    sessionId: job.sessionId,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

function serializeExportJob(job: ChapterExportJob | null | undefined) {
  if (!job) return null;
  const subtitleStyle = job.subtitleStyle || DEFAULT_SUBTITLE_RENDER_STYLE;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    format: job.format,
    subtitleType: job.subtitleType,
    subtitleFontSize: subtitleStyle.fontSize,
    subtitleFontFamily: subtitleStyle.fontFamily,
    subtitleFontColor: subtitleStyle.fontColor,
    subtitleBackgroundColor: subtitleStyle.backgroundColor,
    subtitleBackgroundOpacity: subtitleStyle.backgroundOpacity,
    includeSrt: job.includeSrt,
    usesReviewedTranscript: job.usesReviewedTranscript,
    chapters: job.chapters.map((chapter) => ({
      index: chapter.index,
      label: chapter.label,
      startSeconds: chapter.startSeconds,
      endSeconds: chapter.endSeconds,
      durationSeconds: chapter.durationSeconds,
      targetSizeMb: chapter.targetSizeMb,
      status: chapter.status,
      error: chapter.error,
      parts: chapter.parts.map((part) => ({
        partIndex: part.partIndex,
        filename: part.filename,
        sizeMb: Math.round(part.sizeMb * 10) / 10,
        durationSeconds: Math.round(part.durationSeconds),
        hasSrt: !!part.srtFilename,
      })),
    })),
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

function getEncodingOptionsForMode(mode: "gpu" | "cpu", quality: "fast" | "balanced" = "fast"): string[] {
  if (mode === "gpu") {
    const presets: Record<string, string> = { fast: "p1", balanced: "p4" };
    return ["-c:v", "h264_nvenc", "-preset", presets[quality], "-rc", "vbr", "-cq", "23", "-b:v", "0"];
  }
  const presets: Record<string, string> = { fast: "veryfast", balanced: "fast" };
  return ["-c:v", "libx264", "-preset", presets[quality], "-crf", "23"];
}

function shouldRetryWithoutNvenc(error: unknown): boolean {
  if (!checkNvencAvailable()) return false;
  const message = error instanceof Error ? error.message : String(error || "");
  return /h264_nvenc|signal SIGSEGV|segmentation fault|Cannot init CUDA|No capable devices found|Device setup failed|Error while opening encoder/i.test(message);
}

async function runEncodedFfmpegCommand(
  buildArgs: (encodingOptions: string[]) => string[],
  quality: "fast" | "balanced" = "fast",
): Promise<"gpu" | "cpu"> {
  const tryGpuFirst = checkNvencAvailable();
  const attempts: Array<"gpu" | "cpu"> = tryGpuFirst ? ["gpu", "cpu"] : ["cpu"];
  let lastError: unknown = null;

  for (const mode of attempts) {
    try {
      await runFfmpegCommand(buildArgs(getEncodingOptionsForMode(mode, quality)));
      return mode;
    } catch (error) {
      lastError = error;
      if (mode === "gpu" && shouldRetryWithoutNvenc(error)) {
        console.warn("[ChapterExport] NVENC render failed, retrying with CPU encoder.", {
          message: error instanceof Error ? error.message : String(error || ""),
        });
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("FFmpeg-Transkodierung fehlgeschlagen");
}

async function runFfmpegCommand(args: string[]): Promise<void> {
  const { spawn } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const suffix = signal ? ` (signal ${signal})` : "";
      reject(new Error(`ffmpeg exited with code ${code ?? "null"}${suffix}: ${stderr.slice(-600)}`));
    });
  });
}

async function ffprobeAsync(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function concatenateBinaryFiles(inputPaths: string[], outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    let index = 0;

    const pipeNext = () => {
      if (index >= inputPaths.length) {
        output.end();
        return;
      }

      const input = fs.createReadStream(inputPaths[index]);
      index += 1;

      input.on("error", (error) => {
        output.destroy();
        reject(error);
      });
      input.on("end", () => {
        pipeNext();
      });
      input.pipe(output, { end: false });
    };

    output.on("error", reject);
    output.on("finish", resolve);

    pipeNext();
  });
}

async function mergeChunksToFile(chunkPaths: string[], outputPath: string): Promise<void> {
  if (path.extname(outputPath).toLowerCase() === ".webm") {
    await concatenateBinaryFiles(chunkPaths, outputPath);
    return;
  }

  const listPath = tmpPath(`chapter_concat_${Date.now()}.txt`);
  const listContent = chunkPaths.map((chunkPath) => `file '${chunkPath.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listContent);
  try {
    await runFfmpegCommand(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
  } finally {
    cleanupFile(listPath);
  }
}

async function cutSection(inputPath: string, startSec: number, endSec: number, outputPath: string): Promise<void> {
  const duration = Math.max(0.05, endSec - startSec);
  await runFfmpegCommand([
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(duration),
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outputPath,
  ]);
}

async function extractAudio(videoPath: string, outputWav: string): Promise<void> {
  await runFfmpegCommand([
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outputWav,
  ]);
}

async function transcodeToMp4(inputPath: string, outputPath: string): Promise<void> {
  await runEncodedFfmpegCommand((encodingOptions) => [
    "-y",
    "-fflags",
    "+genpts",
    "-i",
    inputPath,
    "-r",
    String(DEFAULT_EXPORT_FPS),
    ...encodingOptions,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ], "fast");
}

async function burnSubtitlesToMp4(
  inputPath: string,
  srtPath: string,
  outputPath: string,
  subtitleStyle: SubtitleRenderStyle,
): Promise<void> {
  const escapedSrt = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const forceStyle = buildHardcodedSubtitleForceStyle(subtitleStyle);
  await runEncodedFfmpegCommand((encodingOptions) => [
    "-y",
    "-fflags",
    "+genpts",
    "-i",
    inputPath,
    "-vf",
    `subtitles='${escapedSrt}':force_style='${forceStyle}'`,
    "-r",
    String(DEFAULT_EXPORT_FPS),
    ...encodingOptions,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ], "fast");
}

async function transcodeSegmentToMp4(
  inputPath: string,
  startSec: number,
  endSec: number,
  outputPath: string,
): Promise<void> {
  const duration = Math.max(0.05, endSec - startSec);
  await runEncodedFfmpegCommand((encodingOptions) => [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(duration),
    "-r",
    String(DEFAULT_EXPORT_FPS),
    ...encodingOptions,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ], "fast");
}

async function burnSubtitleSegmentToMp4(
  inputPath: string,
  startSec: number,
  endSec: number,
  srtPath: string,
  outputPath: string,
  subtitleStyle: SubtitleRenderStyle,
): Promise<void> {
  const duration = Math.max(0.05, endSec - startSec);
  const escapedSrt = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const forceStyle = buildHardcodedSubtitleForceStyle(subtitleStyle);
  await runEncodedFfmpegCommand((encodingOptions) => [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(duration),
    "-vf",
    `subtitles='${escapedSrt}':force_style='${forceStyle}'`,
    "-r",
    String(DEFAULT_EXPORT_FPS),
    ...encodingOptions,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ], "fast");
}

async function muxSoftSubtitles(baseMp4Path: string, srtPath: string, outputPath: string): Promise<void> {
  await runFfmpegCommand([
    "-y",
    "-i",
    baseMp4Path,
    "-i",
    srtPath,
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=de",
    outputPath,
  ]);
}

const WHISPER_SERVICE_URL = process.env.WHISPER_SERVICE_URL || "http://whisper-service:8000";

async function transcribeAudio(wavPath: string, language: string): Promise<string> {
  const formData = new FormData();
  const buffer = fs.readFileSync(wavPath);
  const blob = new Blob([buffer], { type: "audio/wav" });
  formData.append("audio", blob, path.basename(wavPath));
  formData.append("language", language === "auto" ? "" : language);
  formData.append("output_format", "srt");

  const response = await fetch(`${WHISPER_SERVICE_URL}/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Whisper transcription failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as { srt?: string };
  return data.srt || "";
}

function getChunkPaths(session: ChunkSession): string[] {
  return [...session.chunks]
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => path.join(CHUNKS_DIR, session.sessionId, chunk.filename));
}

function getApproxSessionDuration(session: ChunkSession): number {
  const transcriptDuration = session.reviewedTranscriptSegments?.[session.reviewedTranscriptSegments.length - 1]?.endSeconds;
  const chunkDuration = session.chunks.reduce((max, chunk) => Math.max(max, chunk.endTime || 0), 0);
  return Math.max(transcriptDuration || 0, chunkDuration || 0);
}

function normalizeChapterList(
  chapters: unknown,
  defaultTargetSizeMb: number,
  totalDurationSeconds: number
): ChunkChapter[] {
  const input = Array.isArray(chapters) ? chapters : [];
  const normalized = input
    .map((chapter) => {
      if (chapter === null || chapter === undefined) return null;
      if (typeof chapter === "number") {
        if (!Number.isFinite(chapter)) return null;
        return {
          timestampSeconds: chapter,
          source: "transcript" as const,
        };
      }
      if (typeof chapter !== "object") return null;
      const source = chapter as Record<string, unknown>;
      const timestampSeconds = Number(source.timestampSeconds);
      if (!Number.isFinite(timestampSeconds)) return null;
      return {
        timestampSeconds,
        label: typeof source.label === "string" ? source.label.trim() || undefined : undefined,
        targetSizeMb: source.targetSizeMb !== undefined ? clampTargetSize(source.targetSizeMb, defaultTargetSizeMb) : undefined,
        source:
          source.source === "recording" || source.source === "transcript" || source.source === "seeded"
            ? source.source
            : undefined,
      } satisfies ChunkChapter;
    })
    .filter(Boolean) as ChunkChapter[];

  const maxTimestamp = Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0
    ? totalDurationSeconds
    : Number.POSITIVE_INFINITY;

  const withStart = normalized.some((chapter) => chapter.timestampSeconds <= 0.1)
    ? normalized
    : [{ timestampSeconds: 0, label: "Kapitel 1", source: "transcript" as const }, ...normalized];

  const deduped = new Map<string, ChunkChapter>();
  for (const chapter of withStart) {
    if (chapter.timestampSeconds < 0) continue;
    if (chapter.timestampSeconds >= maxTimestamp && chapter.timestampSeconds > 0) continue;
    const key = chapter.timestampSeconds.toFixed(3);
    if (!deduped.has(key)) {
      deduped.set(key, {
        ...chapter,
        targetSizeMb: chapter.targetSizeMb ? clampTargetSize(chapter.targetSizeMb, defaultTargetSizeMb) : undefined,
      });
    }
  }

  return [...deduped.values()]
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    .map((chapter, index) => ({
      ...chapter,
      label: chapter.label || `Kapitel ${index + 1}`,
    }));
}

function buildChapterRanges(chapters: ChunkChapter[], totalDurationSeconds: number, defaultTargetSizeMb: number): ChapterExportResult[] {
  const normalized = normalizeChapterList(chapters, defaultTargetSizeMb, totalDurationSeconds)
    .filter((chapter) => chapter.timestampSeconds < totalDurationSeconds || chapter.timestampSeconds === 0);

  if (normalized.length === 0) {
    return [
      {
        index: 0,
        label: "Kapitel 1",
        startSeconds: 0,
        endSeconds: totalDurationSeconds,
        durationSeconds: totalDurationSeconds,
        targetSizeMb: defaultTargetSizeMb,
        parts: [],
        status: "pending" as const,
      },
    ];
  }

  return normalized.map((chapter, index) => {
    const nextTimestamp = normalized[index + 1]?.timestampSeconds ?? totalDurationSeconds;
    return {
      index,
      label: chapter.label || `Kapitel ${index + 1}`,
      startSeconds: chapter.timestampSeconds,
      endSeconds: nextTimestamp,
      durationSeconds: Math.max(0, nextTimestamp - chapter.timestampSeconds),
      targetSizeMb: clampTargetSize(chapter.targetSizeMb, defaultTargetSizeMb),
      parts: [],
      status: "pending" as const,
    };
  }).filter((chapter) => chapter.durationSeconds > 0.05);
}

function extractSegmentsForRange(segments: TranscriptSegment[], startSec: number, endSec: number): TranscriptSegment[] {
  const extracted: TranscriptSegment[] = [];

  for (const segment of segments) {
    if (segment.endSeconds <= startSec || segment.startSeconds >= endSec) continue;
    const clippedStart = Math.max(startSec, segment.startSeconds);
    const clippedEnd = Math.min(endSec, segment.endSeconds);
    if (clippedEnd - clippedStart < 0.05) continue;
    const relativeStart = clippedStart - startSec;
    const relativeEnd = clippedEnd - startSec;
    extracted.push({
      index: extracted.length + 1,
      startSeconds: relativeStart,
      endSeconds: relativeEnd,
      startTime: secondsToSrtTime(relativeStart),
      endTime: secondsToSrtTime(relativeEnd),
      text: segment.text,
    });
  }

  return extracted;
}

function seedChaptersFromRecordingMarkers(
  recordingMarkers: ChunkChapter[],
  transcriptSegments: TranscriptSegment[],
  defaultTargetSizeMb: number
): ChunkChapter[] {
  if (transcriptSegments.length === 0) {
    return normalizeChapterList([], defaultTargetSizeMb, 0);
  }

  const seeded: ChunkChapter[] = [{
    timestampSeconds: 0,
    label: "Kapitel 1",
    source: "seeded",
  }];

  for (const marker of recordingMarkers) {
    const mappedSegment =
      transcriptSegments.find((segment) => segment.startSeconds >= marker.timestampSeconds - 0.05) ||
      transcriptSegments.find((segment) => segment.endSeconds >= marker.timestampSeconds) ||
      transcriptSegments[transcriptSegments.length - 1];

    if (!mappedSegment) continue;
    if (mappedSegment.startSeconds <= 0.1) continue;

    seeded.push({
      timestampSeconds: mappedSegment.startSeconds,
      label: marker.label,
      targetSizeMb: marker.targetSizeMb,
      source: "seeded",
    });
  }

  const totalDuration = transcriptSegments[transcriptSegments.length - 1]?.endSeconds || 0;
  return normalizeChapterList(seeded, defaultTargetSizeMb, totalDuration);
}

function syncLegacyChapterFields(session: ChunkSession) {
  const chapters = session.canonicalChapters || [];
  session.chapters = chapters.map((chapter) => ({
    timestampSeconds: chapter.timestampSeconds,
    label: chapter.label,
  }));
  session.chapterOverrides = Object.fromEntries(
    chapters
      .filter((chapter) => Number.isFinite(chapter.targetSizeMb))
      .map((chapter) => [chapter.timestampSeconds.toFixed(3), clampTargetSize(chapter.targetSizeMb, session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB)])
  );
}

async function mergeSessionToTemp(session: ChunkSession, suffix: string): Promise<{ path: string; durationSeconds: number }> {
  if (session.chunks.length === 0) {
    throw new Error("Keine Chunks vorhanden");
  }

  const chunkPaths = getChunkPaths(session);
  const missingChunk = chunkPaths.find((chunkPath) => !fs.existsSync(chunkPath));
  if (missingChunk) {
    throw new Error("Chunk-Dateien unvollständig");
  }

  const mergedExt = path.extname(session.chunks[0]?.filename || "") || ".webm";
  const mergedPath = tmpPath(`${suffix}_${session.sessionId}_${Date.now()}${mergedExt}`);
  await mergeChunksToFile(chunkPaths, mergedPath);
  const probe = await ffprobeAsync(mergedPath).catch(() => null);
  const fallbackDuration = coerceFiniteDuration(getApproxSessionDuration(session)) || 0;
  return {
    path: mergedPath,
    durationSeconds: coerceFiniteDuration(probe?.format?.duration) || fallbackDuration,
  };
}

async function renderRangeOutput(options: {
  sourcePath: string;
  sourceExt: string;
  startSeconds: number;
  endSeconds: number;
  subtitleType: "hardcoded" | "soft";
  subtitleStyle: SubtitleRenderStyle;
  srtContent: string;
  outputPath: string;
}) {
  let baseMp4Path: string | null = null;
  let srtPath: string | null = null;

  try {
    if (!options.srtContent.trim()) {
      await transcodeSegmentToMp4(
        options.sourcePath,
        options.startSeconds,
        options.endSeconds,
        options.outputPath,
      );
      return;
    }

    srtPath = tmpPath(`chapter_subtitles_${Date.now()}.srt`);
    fs.writeFileSync(srtPath, options.srtContent);

    if (options.subtitleType === "hardcoded") {
      await burnSubtitleSegmentToMp4(
        options.sourcePath,
        options.startSeconds,
        options.endSeconds,
        srtPath,
        options.outputPath,
        options.subtitleStyle,
      );
      return;
    }

    baseMp4Path = tmpPath(`chapter_soft_base_${Date.now()}.mp4`);
    await transcodeSegmentToMp4(
      options.sourcePath,
      options.startSeconds,
      options.endSeconds,
      baseMp4Path,
    );
    await muxSoftSubtitles(baseMp4Path, srtPath, options.outputPath);
  } finally {
    cleanupFile(baseMp4Path);
    cleanupFile(srtPath);
  }
}

async function exportChapterParts(options: {
  sourcePath: string;
  sourceExt: string;
  exportDir: string;
  chapter: ChapterExportResult;
  transcriptSegments: TranscriptSegment[];
  subtitleType: "hardcoded" | "soft";
  subtitleStyle: SubtitleRenderStyle;
  includeSrt: boolean;
}): Promise<ChapterPart[]> {
  const safeBaseName = sanitizeFilename(`Kapitel_${options.chapter.index + 1}_${options.chapter.label}`);
  const chapterSegments = extractSegmentsForRange(
    options.transcriptSegments,
    options.chapter.startSeconds,
    options.chapter.endSeconds
  );
  const fullSrtContent = segmentsToSrtContent(chapterSegments);
  const chapterOutputPath = tmpPath(`chapter_output_${Date.now()}.mp4`);

  await renderRangeOutput({
    sourcePath: options.sourcePath,
    sourceExt: options.sourceExt,
    startSeconds: options.chapter.startSeconds,
    endSeconds: options.chapter.endSeconds,
    subtitleType: options.subtitleType,
    subtitleStyle: options.subtitleStyle,
    srtContent: fullSrtContent,
    outputPath: chapterOutputPath,
  });

  const fullStats = fs.statSync(chapterOutputPath);
  const fullSizeMb = fullStats.size / (1024 * 1024);

  if (fullSizeMb <= options.chapter.targetSizeMb) {
    const filename = `${safeBaseName}.mp4`;
    const finalPath = path.join(options.exportDir, filename);
    fs.renameSync(chapterOutputPath, finalPath);

    let srtFilename: string | undefined;
    if (options.includeSrt && fullSrtContent.trim()) {
      srtFilename = `${safeBaseName}.srt`;
      fs.writeFileSync(path.join(options.exportDir, srtFilename), fullSrtContent);
    }

    return [{
      partIndex: 0,
      filename,
      sizeMb: fullSizeMb,
      durationSeconds: options.chapter.durationSeconds,
      srtFilename,
    }];
  }

  cleanupFile(chapterOutputPath);

  const safetyTarget = Math.max(1, options.chapter.targetSizeMb * 0.9);
  const partCount = Math.max(2, Math.ceil(fullSizeMb / safetyTarget));
  const partDuration = options.chapter.durationSeconds / partCount;
  const parts: ChapterPart[] = [];

  for (let index = 0; index < partCount; index += 1) {
    const partStart = options.chapter.startSeconds + index * partDuration;
    const partEnd = index === partCount - 1
      ? options.chapter.endSeconds
      : options.chapter.startSeconds + (index + 1) * partDuration;
    const relativeSegments = extractSegmentsForRange(options.transcriptSegments, partStart, partEnd);
    const partSrtContent = segmentsToSrtContent(relativeSegments);
    const filename = `${safeBaseName}_Teil${index + 1}.mp4`;
    const outputPath = path.join(options.exportDir, filename);

    await renderRangeOutput({
      sourcePath: options.sourcePath,
      sourceExt: options.sourceExt,
      startSeconds: partStart,
      endSeconds: partEnd,
      subtitleType: options.subtitleType,
      subtitleStyle: options.subtitleStyle,
      srtContent: partSrtContent,
      outputPath,
    });

    const stats = fs.statSync(outputPath);
    let srtFilename: string | undefined;
    if (options.includeSrt && partSrtContent.trim()) {
      srtFilename = filename.replace(/\.mp4$/i, ".srt");
      fs.writeFileSync(path.join(options.exportDir, srtFilename), partSrtContent);
    }

    parts.push({
      partIndex: index,
      filename,
      sizeMb: stats.size / (1024 * 1024),
      durationSeconds: Math.max(0, partEnd - partStart),
      srtFilename,
    });
  }

  return parts;
}

async function processSessionTranscription(job: TranscriptionJob, recordingMarkers: ChunkChapter[], defaultTargetSizeMb: number) {
  let merged: { path: string; durationSeconds: number } | null = null;
  let wavPath: string | null = null;

  try {
    const session = loadChunkSession(job.sessionId);
    if (!session) throw new Error("Session nicht gefunden");
    if (session.chunks.length === 0) throw new Error("Keine Chunks vorhanden");

    session.recordingMarkers = normalizeChapterList(recordingMarkers, defaultTargetSizeMb, getApproxSessionDuration(session))
      .filter((chapter) => chapter.timestampSeconds > 0);
    session.defaultTargetSizeMb = clampTargetSize(defaultTargetSizeMb, DEFAULT_TARGET_SIZE_MB);
    saveChunkSession(session);

    job.currentStep = "Chunks zusammenführen";
    job.progress = 10;
    merged = await mergeSessionToTemp(session, "session_transcription");

    job.currentStep = "Audio extrahieren";
    job.progress = 35;
    wavPath = tmpPath(`session_transcription_${job.id}.wav`);
    await extractAudio(merged.path, wavPath);

    job.currentStep = "Transkription läuft";
    job.progress = 65;
    const srt = await transcribeAudio(wavPath, job.language);
    const transcriptSegments = parseSrtContent(srt);
    if (transcriptSegments.length === 0) {
      throw new Error("Keine Transcript-Segmente erkannt");
    }

    const latestSession = loadChunkSession(job.sessionId);
    if (!latestSession) throw new Error("Session nicht gefunden");

    const canonicalChapters = latestSession.canonicalChapters?.length
      ? normalizeChapterList(latestSession.canonicalChapters, latestSession.defaultTargetSizeMb || defaultTargetSizeMb, merged.durationSeconds)
      : seedChaptersFromRecordingMarkers(latestSession.recordingMarkers || [], transcriptSegments, latestSession.defaultTargetSizeMb || defaultTargetSizeMb);

    latestSession.reviewedTranscriptSegments = transcriptSegments;
    latestSession.canonicalChapters = canonicalChapters;
    latestSession.defaultTargetSizeMb = clampTargetSize(latestSession.defaultTargetSizeMb, defaultTargetSizeMb);
    syncLegacyChapterFields(latestSession);
    saveChunkSession(latestSession);

    job.status = "completed";
    job.progress = 100;
    job.currentStep = "Fertig";
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.progress = 100;
    job.currentStep = "Fehlgeschlagen";
    job.error = error instanceof Error ? error.message : "Unbekannter Fehler";
    job.completedAt = new Date().toISOString();
  } finally {
    cleanupFile(wavPath);
    cleanupFile(merged?.path);
  }
}

async function processChapterExport(job: ChapterExportJob) {
  let merged: { path: string; durationSeconds: number } | null = null;
  let normalizedMasterPath: string | null = null;
  let mergedSession: ChunkSession | null = null;
  let normalizedDurationSeconds = 0;

  try {
    const session = loadChunkSession(job.sessionId);
    if (!session) throw new Error("Session nicht gefunden");
    if (session.chunks.length === 0) throw new Error("Keine Chunks vorhanden");

    mergedSession = session;
    const exportDir = path.join(CHAPTER_EXPORTS_DIR, job.id);
    fs.mkdirSync(exportDir, { recursive: true });

    job.currentStep = "Chunks zusammenführen";
    job.progress = 5;
    merged = await mergeSessionToTemp(session, "chapter_export");

    const sessionChapters = session.canonicalChapters?.length
      ? session.canonicalChapters
      : session.chapters?.map((chapter) => ({
          timestampSeconds: chapter.timestampSeconds,
          label: chapter.label,
        })) || [];
    const hasReviewedTranscript = !!session.reviewedTranscriptSegments?.length;
    let exportSourcePath = merged.path;
    let exportSourceExt = path.extname(merged.path) || ".webm";

    if (hasReviewedTranscript) {
      job.currentStep = "Kapitel vorbereiten";
      job.progress = 12;
      normalizedDurationSeconds =
        coerceFiniteDuration(merged.durationSeconds)
        || coerceFiniteDuration(getApproxSessionDuration(session))
        || 0;
    } else {
      job.currentStep = "Master vorbereiten";
      job.progress = 12;
      normalizedMasterPath = tmpPath(`chapter_export_master_${job.id}.mp4`);
      await transcodeToMp4(merged.path, normalizedMasterPath);
      normalizedDurationSeconds =
        coerceFiniteDuration((await ffprobeAsync(normalizedMasterPath).catch(() => null))?.format?.duration)
        || coerceFiniteDuration(merged.durationSeconds)
        || coerceFiniteDuration(getApproxSessionDuration(session))
        || 0;
      exportSourcePath = normalizedMasterPath;
      exportSourceExt = ".mp4";
    }

    const chapterRanges = buildChapterRanges(sessionChapters, normalizedDurationSeconds, job.defaultTargetSizeMb);
    if (chapterRanges.length === 0) {
      console.warn("[ChapterExport] No chapter ranges resolved.", {
        jobId: job.id,
        sessionId: job.sessionId,
        hasReviewedTranscript,
        sessionChapterCount: sessionChapters.length,
        normalizedDurationSeconds,
        mergedDurationSeconds: merged.durationSeconds,
        approxDurationSeconds: getApproxSessionDuration(session),
      });
    }
    job.chapters = chapterRanges;

    const totalChapters = chapterRanges.length;
    const progressBase = 18;
    const progressRange = 72;

    for (let index = 0; index < chapterRanges.length; index += 1) {
      const chapter = chapterRanges[index];
      chapter.status = "processing";
      job.currentStep = `Kapitel ${index + 1}/${totalChapters}: ${chapter.label}`;
      job.progress = Math.round(progressBase + (progressRange * index) / Math.max(1, totalChapters));

      try {
        let transcriptSegments: TranscriptSegment[];

        if (hasReviewedTranscript) {
          transcriptSegments = session.reviewedTranscriptSegments || [];
        } else {
          job.currentStep = `Kapitel ${index + 1}/${totalChapters}: Transkription`;
          const rawClipPath = tmpPath(`chapter_legacy_${job.id}_${index}${exportSourceExt}`);
          const wavPath = tmpPath(`chapter_legacy_${job.id}_${index}.wav`);
          try {
            await cutSection(exportSourcePath, chapter.startSeconds, chapter.endSeconds, rawClipPath);
            await extractAudio(rawClipPath, wavPath);
            const srt = await transcribeAudio(wavPath, job.language);
            transcriptSegments = parseSrtContent(srt).map((segment) => ({
              ...segment,
              startSeconds: segment.startSeconds + chapter.startSeconds,
              endSeconds: segment.endSeconds + chapter.startSeconds,
            }));
          } finally {
            cleanupFile(rawClipPath);
            cleanupFile(wavPath);
          }
        }

        job.currentStep = `Kapitel ${index + 1}/${totalChapters}: Rendern`;
        const parts = await exportChapterParts({
          sourcePath: exportSourcePath,
          sourceExt: exportSourceExt,
          exportDir,
          chapter,
          transcriptSegments,
          subtitleType: job.subtitleType,
          subtitleStyle: job.subtitleStyle,
          includeSrt: job.includeSrt,
        });

        chapter.parts = parts;
        chapter.status = "completed";
      } catch (error) {
        chapter.parts = [];
        chapter.status = "failed";
        chapter.error = error instanceof Error ? error.message : "Unbekannter Fehler";
        console.error("[ChapterExport] Chapter render failed", {
          jobId: job.id,
          sessionId: job.sessionId,
          chapterIndex: chapter.index,
          chapterLabel: chapter.label,
          subtitleType: job.subtitleType,
          message: chapter.error,
        });
      }
    }

    const exportedFiles = fs
      .readdirSync(exportDir)
      .filter((file) => fs.statSync(path.join(exportDir, file)).isFile());
    const allCompleted = job.chapters.every((chapter) => chapter.status === "completed");
    const hasFiles = exportedFiles.length > 0;

    if (!allCompleted && !job.error) {
      job.error = job.chapters.find((chapter) => chapter.error)?.error || "Mindestens ein Kapitel konnte nicht gerendert werden.";
    }
    if (allCompleted && !hasFiles) {
      job.error = "Es wurden keine Kapiteldateien erzeugt.";
    }

    job.status = allCompleted && hasFiles ? "completed" : "failed";
    job.progress = 100;
    job.currentStep = allCompleted && hasFiles ? "Fertig" : "Teilweise fehlgeschlagen";
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.progress = 100;
    job.currentStep = "Fehlgeschlagen";
    job.error = error instanceof Error ? error.message : "Unbekannter Fehler";
    job.completedAt = new Date().toISOString();
  } finally {
    cleanupFile(merged?.path);
    cleanupFile(normalizedMasterPath);
    if (mergedSession) {
      const latestSession = loadChunkSession(mergedSession.sessionId);
      if (latestSession) {
        syncLegacyChapterFields(latestSession);
        saveChunkSession(latestSession);
      }
    }
  }
}

router.post("/chunk/:sessionId/transcribe", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const sessionId = sanitizeSessionId(req.params.sessionId || "");
  if (!sessionId) {
    return res.status(400).json({ error: "Ungültige Session-ID" });
  }

  const session = loadChunkSession(sessionId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ error: "Session nicht gefunden" });
  }
  if (!session.completedAt) {
    return res.status(409).json({ error: "Aufnahme ist noch nicht abgeschlossen" });
  }
  if (session.chunks.length === 0) {
    return res.status(400).json({ error: "Keine Chunks vorhanden" });
  }

  const language = typeof req.body?.language === "string" ? req.body.language : "de";
  const defaultTargetSizeMb = clampTargetSize(req.body?.defaultTargetSizeMb, session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB);
  const recordingMarkers = normalizeChapterList(req.body?.recordingMarkers, defaultTargetSizeMb, getApproxSessionDuration(session))
    .filter((chapter) => chapter.timestampSeconds > 0)
    .map((chapter) => ({ ...chapter, source: "recording" as const }));

  const jobId = crypto.randomUUID();
  const job: TranscriptionJob = {
    id: jobId,
    sessionId,
    userId,
    status: "processing",
    progress: 0,
    currentStep: "Initialisierung",
    language,
    createdAt: new Date().toISOString(),
  };

  transcriptionJobs.set(jobId, job);
  void processSessionTranscription(job, recordingMarkers, defaultTargetSizeMb);

  return res.json({
    success: true,
    jobId,
  });
});

router.get("/chunk/:sessionId/recover", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const sessionId = sanitizeSessionId(req.params.sessionId || "");
  if (!sessionId) {
    return res.status(400).json({ error: "Ungültige Session-ID" });
  }

  const session = loadChunkSession(sessionId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ error: "Session nicht gefunden" });
  }

  const totalDurationSeconds = getApproxSessionDuration(session);
  const latestTranscriptionJob = getLatestJobForSession(transcriptionJobs, sessionId, userId);
  const latestExportJob = getLatestJobForSession(exportJobs, sessionId, userId);

  return res.json({
    sessionId: session.sessionId,
    sessionStatus: {
      sessionId: session.sessionId,
      totalChunks: session.chunks.length,
      chunks: session.chunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.chunkId,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        size: chunk.size,
      })),
      isComplete: !!session.completedAt,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    },
    totalDurationSeconds,
    recordingMarkers: session.recordingMarkers || [],
    segments: session.reviewedTranscriptSegments || [],
    chapters: normalizeChapterList(
      session.canonicalChapters || [],
      session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB,
      totalDurationSeconds,
    ),
    defaultTargetSizeMb: session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB,
    transcriptionJob: serializeTranscriptionJob(latestTranscriptionJob),
    exportJob: serializeExportJob(latestExportJob),
  });
});

router.get("/transcription/:jobId/status", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const job = transcriptionJobs.get(String(req.params.jobId || ""));
  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Transkriptions-Job nicht gefunden" });
  }

  return res.json({
    id: job.id,
    sessionId: job.sessionId,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

router.get("/transcription/:jobId/result", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const job = transcriptionJobs.get(String(req.params.jobId || ""));
  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Transkriptions-Job nicht gefunden" });
  }
  if (job.status !== "completed") {
    return res.status(409).json({ error: "Transkription noch nicht abgeschlossen" });
  }

  const session = loadChunkSession(job.sessionId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ error: "Session nicht gefunden" });
  }

  return res.json({
    sessionId: session.sessionId,
    segments: session.reviewedTranscriptSegments || [],
    chapters: normalizeChapterList(
      session.canonicalChapters || [],
      session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB,
      getApproxSessionDuration(session)
    ),
    recordingMarkers: session.recordingMarkers || [],
    defaultTargetSizeMb: session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB,
    totalDurationSeconds: getApproxSessionDuration(session),
  });
});

router.post("/chunk/:sessionId/draft", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const sessionId = sanitizeSessionId(req.params.sessionId || "");
  if (!sessionId) {
    return res.status(400).json({ error: "Ungültige Session-ID" });
  }

  const session = loadChunkSession(sessionId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ error: "Session nicht gefunden" });
  }

  if (req.body?.recordingMarkers !== undefined && !Array.isArray(req.body.recordingMarkers)) {
    return res.status(400).json({ error: "recordingMarkers muss ein Array sein" });
  }
  if (req.body?.chapters !== undefined && !Array.isArray(req.body.chapters)) {
    return res.status(400).json({ error: "chapters muss ein Array sein" });
  }
  if (req.body?.reviewedTranscriptSegments !== undefined && !Array.isArray(req.body.reviewedTranscriptSegments)) {
    return res.status(400).json({ error: "reviewedTranscriptSegments muss ein Array sein" });
  }

  const defaultTargetSizeMb = req.body?.defaultTargetSizeMb !== undefined
    ? clampTargetSize(req.body.defaultTargetSizeMb, session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB)
    : (session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB);
  session.defaultTargetSizeMb = defaultTargetSizeMb;

  if (req.body?.recordingMarkers !== undefined) {
    session.recordingMarkers = normalizeChapterList(
      req.body.recordingMarkers,
      defaultTargetSizeMb,
      getApproxSessionDuration(session),
    )
      .filter((chapter) => chapter.timestampSeconds > 0)
      .map((chapter) => ({
        ...chapter,
        source: "recording" as const,
      }));
  }

  if (req.body?.reviewedTranscriptSegments !== undefined) {
    session.reviewedTranscriptSegments = normalizeTranscriptSegments(req.body.reviewedTranscriptSegments);
  }

  if (req.body?.chapters !== undefined) {
    const totalDurationSeconds =
      session.reviewedTranscriptSegments?.[session.reviewedTranscriptSegments.length - 1]?.endSeconds ||
      getApproxSessionDuration(session);
    session.canonicalChapters = normalizeChapterList(
      req.body.chapters,
      defaultTargetSizeMb,
      totalDurationSeconds,
    ).map((chapter) => ({
      ...chapter,
      source: chapter.source === "recording" ? "recording" : "transcript",
    }));
  }

  syncLegacyChapterFields(session);
  saveChunkSession(session);

  const totalDurationSeconds = getApproxSessionDuration(session);
  return res.json({
    success: true,
    sessionId: session.sessionId,
    totalDurationSeconds,
    recordingMarkers: session.recordingMarkers || [],
    chapters: normalizeChapterList(
      session.canonicalChapters || [],
      session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB,
      totalDurationSeconds,
    ),
    defaultTargetSizeMb: session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB,
    segmentCount: session.reviewedTranscriptSegments?.length || 0,
  });
});

router.post("/chunk/:sessionId/chapters", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const sessionId = sanitizeSessionId(req.params.sessionId || "");
  if (!sessionId) {
    return res.status(400).json({ error: "Ungültige Session-ID" });
  }

  const session = loadChunkSession(sessionId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ error: "Session nicht gefunden" });
  }

  if (!Array.isArray(req.body?.chapters)) {
    return res.status(400).json({ error: "chapters muss ein Array sein" });
  }

  const defaultTargetSizeMb = clampTargetSize(req.body?.defaultTargetSizeMb, session.defaultTargetSizeMb || DEFAULT_TARGET_SIZE_MB);
  const transcriptSegments = req.body?.reviewedTranscriptSegments !== undefined
    ? normalizeTranscriptSegments(req.body.reviewedTranscriptSegments)
    : (session.reviewedTranscriptSegments || []);
  const totalDurationSeconds = transcriptSegments[transcriptSegments.length - 1]?.endSeconds || getApproxSessionDuration(session);

  session.defaultTargetSizeMb = defaultTargetSizeMb;
  session.canonicalChapters = normalizeChapterList(req.body.chapters, defaultTargetSizeMb, totalDurationSeconds)
    .map((chapter) => ({
      ...chapter,
      source: chapter.source === "recording" ? "recording" : "transcript",
    }));
  if (transcriptSegments.length > 0) {
    session.reviewedTranscriptSegments = transcriptSegments;
  }
  syncLegacyChapterFields(session);
  saveChunkSession(session);

  return res.json({
    success: true,
    chapterCount: session.canonicalChapters.length,
    defaultTargetSizeMb: session.defaultTargetSizeMb,
  });
});

router.post("/chunk/:sessionId/export-chapters", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const sessionId = sanitizeSessionId(req.params.sessionId || "");
  if (!sessionId) {
    return res.status(400).json({ error: "Ungültige Session-ID" });
  }

  const session = loadChunkSession(sessionId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ error: "Session nicht gefunden" });
  }
  if (session.chunks.length === 0) {
    return res.status(400).json({ error: "Keine Chunks vorhanden" });
  }

  const usesReviewedTranscript = !!session.reviewedTranscriptSegments?.length;
  if (usesReviewedTranscript && !(session.canonicalChapters?.length)) {
    return res.status(409).json({ error: "Bitte zuerst Kapitelmarker im Transcript speichern" });
  }

  const defaultTargetSizeMb = clampTargetSize(req.body?.defaultTargetSizeMb, session.defaultTargetSizeMb || req.body?.maxSizeMb || DEFAULT_TARGET_SIZE_MB);
  const subtitleType = req.body?.subtitleType === "soft"
    ? "soft"
    : req.body?.subtitleType === "hardcoded"
      ? "hardcoded"
      : req.body?.burnSubtitles === false
        ? "soft"
        : "hardcoded";
  const includeSrt = req.body?.includeSrt !== false;
  const language = typeof req.body?.language === "string" ? req.body.language : "de";
  const subtitleStyle = resolveSubtitleRenderStyle({
    subtitleFontSize: req.body?.subtitleFontSize,
    subtitleFontFamily: req.body?.subtitleFontFamily,
    subtitleFontColor: req.body?.subtitleFontColor,
    subtitleBackgroundColor: req.body?.subtitleBackgroundColor,
    subtitleBackgroundOpacity: req.body?.subtitleBackgroundOpacity,
  });

  if (Array.isArray(req.body?.chapters) && req.body.chapters.length > 0) {
    const totalDurationSeconds = getApproxSessionDuration(session);
    session.defaultTargetSizeMb = defaultTargetSizeMb;
    session.canonicalChapters = normalizeChapterList(req.body.chapters, defaultTargetSizeMb, totalDurationSeconds);
    syncLegacyChapterFields(session);
    saveChunkSession(session);
  }

  const chapterRanges = buildChapterRanges(
    session.canonicalChapters || session.chapters || [],
    Math.max(getApproxSessionDuration(session), 0.1),
    defaultTargetSizeMb
  );

  const jobId = crypto.randomUUID();
  const job: ChapterExportJob = {
    id: jobId,
    sessionId,
    userId,
    status: "processing",
    progress: 0,
    currentStep: "Initialisierung",
    format: "mp4",
    subtitleType,
    subtitleStyle,
    includeSrt,
    defaultTargetSizeMb,
    language,
    usesReviewedTranscript,
    chapters: chapterRanges,
    createdAt: new Date().toISOString(),
  };

  exportJobs.set(jobId, job);
  void processChapterExport(job);

  return res.json({
    success: true,
    jobId,
    chapterCount: chapterRanges.length,
  });
});

router.get("/:jobId/status", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const job = exportJobs.get(String(req.params.jobId || ""));
  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Export-Job nicht gefunden" });
  }

  return res.json(serializeExportJob(job));
});

router.get("/:jobId/download/:filename", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const jobId = String(req.params.jobId || "");
  const filename = String(req.params.filename || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const job = exportJobs.get(jobId);

  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Export-Job nicht gefunden" });
  }

  const filePath = path.join(CHAPTER_EXPORTS_DIR, jobId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei nicht gefunden" });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === ".mp4"
      ? "video/mp4"
      : ext === ".srt"
        ? "text/plain; charset=utf-8"
        : "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

router.get("/:jobId/download-all", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const jobId = String(req.params.jobId || "");
  const job = exportJobs.get(jobId);

  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Export-Job nicht gefunden" });
  }
  if (job.status !== "completed") {
    return res.status(409).json({ error: "Export noch nicht abgeschlossen" });
  }

  const exportDir = path.join(CHAPTER_EXPORTS_DIR, jobId);
  if (!fs.existsSync(exportDir)) {
    return res.status(404).json({ error: "Export-Dateien nicht gefunden" });
  }

  const files = fs
    .readdirSync(exportDir)
    .filter((file) => fs.statSync(path.join(exportDir, file)).isFile());
  if (files.length === 0) {
    return res.status(404).json({ error: "Keine Export-Dateien vorhanden" });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="kapitel-export-${jobId.slice(0, 8)}.zip"`);

  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.pipe(res);

  for (const file of files) {
    const filePath = path.join(exportDir, file);
    archive.file(filePath, { name: file });
  }

  await archive.finalize();
});

export default router;
