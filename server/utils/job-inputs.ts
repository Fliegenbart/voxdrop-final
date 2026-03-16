import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getTmpDir } from "./tmp";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const JOB_INPUTS_DIR =
  process.env.VOXDROP_JOB_INPUTS_DIR || path.join(DATA_DIR, "job-inputs");

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeExtFromName(originalName: string | undefined, fallback: string) {
  const ext = originalName ? path.extname(originalName).trim() : "";
  if (!ext || ext.length > 10) return fallback;
  if (!/^\.[a-zA-Z0-9]+$/.test(ext)) return fallback;
  return ext;
}

function moveFileBestEffort(sourcePath: string, destPath: string) {
  ensureDir(path.dirname(destPath));
  try {
    fs.renameSync(sourcePath, destPath);
    return;
  } catch (err: any) {
    // Cross-device rename can fail (EXDEV). Fall back to copy+unlink.
    if (err?.code !== "EXDEV") {
      throw err;
    }
  }

  fs.copyFileSync(sourcePath, destPath);
  try {
    fs.unlinkSync(sourcePath);
  } catch {
    // Ignore cleanup failures.
  }
}

export function computeFileSha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead <= 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

export function preflightInputFile(params: {
  filePath: string;
  expectedChecksum?: string | null;
}): { exists: boolean; size: number; checksum: string | null; reason?: string } {
  const { filePath, expectedChecksum } = params;
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, checksum: null, reason: "input_missing" };
  }

  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return { exists: false, size: 0, checksum: null, reason: "input_missing" };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { exists: true, size: 0, checksum: null, reason: "input_empty" };
  }

  if (!expectedChecksum) {
    return { exists: true, size, checksum: null };
  }

  const checksum = computeFileSha256(filePath);
  if (checksum !== expectedChecksum) {
    return {
      exists: true,
      size,
      checksum,
      reason: "input_checksum_mismatch",
    };
  }

  return { exists: true, size, checksum };
}

function cleanupOldDirs(rootDir: string, olderThanMs: number): number {
  if (!fs.existsSync(rootDir)) return 0;
  let removed = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current)) {
      const fullPath = path.join(current, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs >= olderThanMs) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          removed += 1;
          continue;
        } catch {
          // Best effort cleanup only.
        }
      }

      stack.push(fullPath);
    }
  }
  return removed;
}

export function cleanupStaleJobInputsAndTmp(params?: {
  olderThanHours?: number;
}): { removedJobInputDirs: number; removedTmpDirs: number } {
  const olderThanHours = Math.max(1, Math.floor(params?.olderThanHours ?? 48));
  const olderThanMs = olderThanHours * 60 * 60 * 1000;

  const removedJobInputDirs = cleanupOldDirs(JOB_INPUTS_DIR, olderThanMs);
  const tmpJobRoot = path.join(getTmpDir(), "jobs");
  const removedTmpDirs = cleanupOldDirs(tmpJobRoot, olderThanMs);

  return { removedJobInputDirs, removedTmpDirs };
}

export type JobInputKind =
  | "transcription"
  | "pdfua"
  | "podcast"
  | "subtitle-embed";

/**
 * Persist job inputs outside of the ephemeral tmp naming, so:
 * - inputs survive long queue times / worker restarts
 * - retries don't break because input file was deleted early
 *
 * Inputs remain on the shared /app/data bind mount and should be cleaned up by workers.
 */
export function persistJobInputFile(params: {
  kind: JobInputKind;
  jobId: string;
  sourcePath: string;
  originalName?: string;
  defaultExt: string;
  filenameBase?: string;
}): string {
  const ext = safeExtFromName(params.originalName, params.defaultExt);
  const base = params.filenameBase || "input";
  const destDir = path.join(JOB_INPUTS_DIR, params.kind, params.jobId);
  const destPath = path.join(destDir, `${base}${ext}`);
  moveFileBestEffort(params.sourcePath, destPath);
  return destPath;
}

export function persistJobTextFile(params: {
  kind: JobInputKind;
  jobId: string;
  content: string;
  filename: string;
  encoding?: BufferEncoding;
}): string {
  const destDir = path.join(JOB_INPUTS_DIR, params.kind, params.jobId);
  ensureDir(destDir);
  const destPath = path.join(destDir, params.filename);
  fs.writeFileSync(destPath, params.content, params.encoding || "utf-8");
  return destPath;
}

export function persistJobUploadedFile(params: {
  kind: JobInputKind;
  jobId: string;
  sourcePath: string;
  originalName?: string;
  defaultExt: string;
  filenameBase: string;
}): string {
  return persistJobInputFile({
    kind: params.kind,
    jobId: params.jobId,
    sourcePath: params.sourcePath,
    originalName: params.originalName,
    defaultExt: params.defaultExt,
    filenameBase: params.filenameBase,
  });
}

export function createTempFilePath(prefix: string, ext: string) {
  const id = crypto.randomUUID();
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return path.join(getTmpDir(), `${prefix}_${id}${safeExt}`);
}
