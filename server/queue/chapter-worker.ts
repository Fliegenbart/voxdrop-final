import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'node:child_process';
import path from 'path';
import fs from 'fs';
import { tmpPath } from '../utils/tmp';
import { checkNvencAvailable } from '../utils/nvenc';

const queueConnection = redisConnection as any;
const CHAPTER_CONVERT_TIMEOUT_SECONDS = Math.max(
  60,
  Number(process.env.CHAPTER_CONVERT_TIMEOUT_SECONDS || 1800),
);
const CHAPTER_CONVERT_HEARTBEAT_MS = Math.max(
  5000,
  Number(process.env.CHAPTER_CONVERT_HEARTBEAT_MS || 15000),
);

type ActiveChapterProcess = {
  command: ffmpeg.FfmpegCommand | null;
  phase: 'starting' | 'backup' | 'converting' | 'splitting' | 'packaging';
  startedAt: number;
};

const activeChapterProcesses = new Map<string, ActiveChapterProcess>();
const chapterCancelRequests = new Set<string>();

class ChapterCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ChapterCancelledError';
  }
}

class ChapterConvertTimeoutError extends Error {
  constructor(timeoutSeconds: number) {
    super(`chapter_convert_timeout (${timeoutSeconds}s)`);
    this.name = 'ChapterConvertTimeoutError';
  }
}

function setChapterPhase(jobId: string, phase: ActiveChapterProcess['phase']) {
  const state = activeChapterProcesses.get(jobId);
  if (!state) return;
  state.phase = phase;
}

function setActiveCommand(jobId: string, command: ffmpeg.FfmpegCommand | null) {
  const state = activeChapterProcesses.get(jobId);
  if (!state) return;
  state.command = command;
}

function isChapterCancelRequested(jobId: string): boolean {
  return chapterCancelRequests.has(jobId);
}

function throwIfChapterCancelled(jobId: string) {
  if (isChapterCancelRequested(jobId)) {
    throw new ChapterCancelledError();
  }
}

function cleanupTempFilesForJob(jobId: string) {
  const tmpDir = path.dirname(tmpPath(`chapters_${jobId}`));
  try {
    for (const entry of fs.readdirSync(tmpDir)) {
      if (!entry.includes(jobId)) continue;
      if (!entry.startsWith('session_split_') && !entry.startsWith('converted_') && !entry.startsWith('chapters_')) continue;
      const fullPath = path.join(tmpDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          cleanupDir(fullPath);
        } else {
          cleanupFile(fullPath);
        }
      } catch {}
    }
  } catch {}
}

export function requestChapterCancel(jobId: string): boolean {
  chapterCancelRequests.add(jobId);
  const state = activeChapterProcesses.get(jobId);
  if (state?.command) {
    try {
      state.command.kill('SIGKILL');
      console.log(`[ChapterWorker] Cancel signal applied to ffmpeg: ${jobId}`);
      return true;
    } catch (error) {
      console.error(`[ChapterWorker] Failed to kill ffmpeg for ${jobId}:`, error);
    }
  }
  console.log(`[ChapterWorker] Cancel requested: ${jobId}`);
  return false;
}

// Get video encoding options
function getVideoEncodingOptions(quality: 'fast' | 'balanced' | 'quality' = 'fast'): string[] {
  if (checkNvencAvailable('[ChapterWorker]')) {
    const presets: Record<string, string> = {
      fast: 'p1',
      balanced: 'p4',
      quality: 'p7',
    };
    return [
      '-c:v h264_nvenc',
      `-preset ${presets[quality]}`,
      '-rc vbr',
      '-cq 23',
      '-b:v 0',
    ];
  }

  // CPU fallback
  const presets: Record<string, string> = {
    fast: 'veryfast',
    balanced: 'medium',
    quality: 'slow',
  };
  return [
    '-c:v libx264',
    `-preset ${presets[quality]}`,
    '-crf 23',
  ];
}

// Cleanup file helper
function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[ChapterWorker] Failed to cleanup ${filePath}:`, err);
  }
}

// Cleanup directory helper
function cleanupDir(dirPath: string) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`[ChapterWorker] Failed to cleanup dir ${dirPath}:`, err);
  }
}

// Sanitize filename for filesystem
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*']/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

// Convert SRT timestamp to seconds
function srtTimeToSeconds(timeStr: string): number {
  const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, ms] = match;
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(ms) / 1000;
}

// Convert seconds to SRT timestamp
function secondsToSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function ffmpegTimemarkToSeconds(timemark?: string): number | null {
  if (!timemark || typeof timemark !== 'string') return null;
  const parts = timemark.split(':');
  if (parts.length !== 3) return null;
  const [hoursPart, minutesPart, secondsPart] = parts;
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

// Extract SRT segments for a time range (adjusting timestamps to start from 0)
function extractSrtForTimeRange(srtContent: string, startTime: string, endTime: string): string {
  const startSec = srtTimeToSeconds(startTime);
  const endSec = srtTimeToSeconds(endTime);

  const segments: string[] = [];
  const blocks = srtContent.trim().split(/\n\n+/);
  let newIndex = 1;

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timeMatch) continue;

    const segStart = srtTimeToSeconds(timeMatch[1]);
    const segEnd = srtTimeToSeconds(timeMatch[2]);

    // Check if segment overlaps with our time range
    if (segEnd <= startSec || segStart >= endSec) continue;

    // Adjust timestamps relative to chapter start
    const newStartSec = Math.max(0, segStart - startSec);
    const newEndSec = Math.min(endSec - startSec, segEnd - startSec);

    const newStart = secondsToSrtTime(newStartSec);
    const newEnd = secondsToSrtTime(newEndSec);
    const text = lines.slice(2).join('\n');

    segments.push(`${newIndex}\n${newStart} --> ${newEnd}\n${text}`);
    newIndex++;
  }

  return segments.join('\n\n') + '\n';
}

// Create tar.gz archive from directory using system tar
async function createTarGz(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn('tar', ['-czf', outputPath, '-C', sourceDir, '.'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 60000);

      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve();
        reject(new Error(`tar exited with code ${code}: ${stderr.slice(-500)}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Convert WebM to MP4 if needed
async function convertToMp4(inputPath: string, jobId: string, userId: number): Promise<string> {
  throwIfChapterCancelled(jobId);
  setChapterPhase(jobId, 'converting');
  const outputPath = tmpPath(`converted_${jobId}_${Date.now()}.mp4`);

  const inputDurationPromise = new Promise<number | null>((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return resolve(null);
      const raw = metadata?.format?.duration;
      const duration = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(duration) || duration <= 0) return resolve(null);
      resolve(duration);
    });
  });

  return new Promise((resolve, reject) => {
    let lastPercent = 5;
    let settled = false;
    const heartbeat = setInterval(() => {
      if (settled || isChapterCancelRequested(jobId)) return;
      const percent = Math.min(19, lastPercent + 1);
      if (percent === lastPercent) return;
      lastPercent = percent;
      updateJob(jobId, { progressStage: 'converting', progressPercent: percent });
      publishJobEvent(jobId, userId, 'progress', {
        stage: 'converting',
        percent,
      });
    }, CHAPTER_CONVERT_HEARTBEAT_MS);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const active = activeChapterProcesses.get(jobId)?.command;
      if (active) {
        try { active.kill('SIGKILL'); } catch {}
      }
      clearInterval(heartbeat);
      clearTimeout(timeout);
      setActiveCommand(jobId, null);
      reject(new ChapterConvertTimeoutError(CHAPTER_CONVERT_TIMEOUT_SECONDS));
    }, CHAPTER_CONVERT_TIMEOUT_SECONDS * 1000);

    const command = ffmpeg(inputPath)
      .outputOptions([
        ...getVideoEncodingOptions('fast'),
        '-c:a aac',
        '-b:a 128k',
      ])
      .output(outputPath)
      .on('start', () => {
        console.log(`[ChapterWorker] Converting WebM to MP4: ${jobId}`);
      })
      .on('progress', async (progress) => {
        const inputDuration = await inputDurationPromise;
        const ffmpegPercent = typeof progress.percent === 'number' && Number.isFinite(progress.percent)
          ? progress.percent
          : null;
        const timemarkSeconds = ffmpegTimemarkToSeconds(progress.timemark);

        let normalizedProgress = ffmpegPercent;
        if (normalizedProgress === null && inputDuration && timemarkSeconds !== null) {
          normalizedProgress = Math.min(100, Math.max(0, (timemarkSeconds / inputDuration) * 100));
        }

        const candidatePercent = normalizedProgress !== null
          ? Math.round(normalizedProgress * 0.15) + 5 // 5-20%
          : lastPercent;
        const percent = Math.max(lastPercent, Math.min(19, candidatePercent));
        if (percent === lastPercent) return;
        lastPercent = percent;
        updateJob(jobId, { progressStage: 'converting', progressPercent: percent });
        publishJobEvent(jobId, userId, 'progress', {
          stage: 'converting',
          percent,
        });
        if (isChapterCancelRequested(jobId)) {
          try { command.kill('SIGKILL'); } catch {}
        }
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        clearInterval(heartbeat);
        clearTimeout(timeout);
        setActiveCommand(jobId, null);
        console.log(`[ChapterWorker] WebM conversion complete: ${jobId}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (settled) return;
        settled = true;
        clearInterval(heartbeat);
        clearTimeout(timeout);
        setActiveCommand(jobId, null);
        console.error(`[ChapterWorker] WebM conversion error: ${jobId}`, err);
        if (isChapterCancelRequested(jobId)) {
          return reject(new ChapterCancelledError());
        }
        reject(err);
      });
    setActiveCommand(jobId, command);
    command.run();
  });
}

// Split video and embed subtitles for a single chapter
async function splitAndEmbed(
  inputPath: string,
  srtPath: string,
  startSec: number,
  duration: number,
  outputPath: string,
  jobId: string,
  options?: {
    maxSizeMb?: number;
    subtitleType?: 'hardcoded' | 'soft';
    hasSubtitleCues?: boolean;
  }
): Promise<void> {
  throwIfChapterCancelled(jobId);
  setChapterPhase(jobId, 'splitting');
  return new Promise((resolve, reject) => {
    // Escape special characters in SRT path for FFmpeg filter
    const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, '\\:');

    const maxSizeMb = options?.maxSizeMb;
    const subtitleType = options?.subtitleType || 'hardcoded';
    const hasSubtitleCues = options?.hasSubtitleCues !== false;
    const maxBytes = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) * 1024 * 1024 : null;
    const audioKbps = 96;

    // For long chapters, prefer lower resolution to keep readability under 125MB.
    const estimateVideoKbps = (limitMb: number, seconds: number, audio: number) => {
      const bits = Math.max(1, Math.floor(limitMb)) * 1024 * 1024 * 8 * 0.92;
      const totalKbps = bits / Math.max(1, seconds) / 1000;
      return Math.floor(totalKbps - audio - 80);
    };

    const chooseScale = (videoKbps: number) => {
      if (videoKbps < 420) return 'scale=-2:360:flags=lanczos';
      if (videoKbps < 650) return 'scale=-2:540:flags=lanczos';
      return 'scale=-2:720:flags=lanczos';
    };

    const baseVideoKbps = maxSizeMb ? estimateVideoKbps(maxSizeMb, duration, audioKbps) : 0;
    const scale = maxSizeMb ? chooseScale(baseVideoKbps) : null;

    // Build encoding options for max size (CBR-ish).
    const buildEncoding = (limitMb: number) => {
      const videoKbpsRaw = estimateVideoKbps(limitMb, duration, audioKbps);
      const videoKbps = Math.max(180, Math.min(25000, videoKbpsRaw));
      const bufKbps = Math.max(200, videoKbps * 2);

      if (checkNvencAvailable('[ChapterWorker]')) {
        return [
          '-c:v h264_nvenc',
          '-preset p4',
          '-rc vbr',
          `-b:v ${videoKbps}k`,
          `-maxrate ${videoKbps}k`,
          `-bufsize ${bufKbps}k`,
          '-c:a aac',
          `-b:a ${audioKbps}k`,
        ];
      }

      return [
        '-c:v libx264',
        '-preset veryfast',
        '-pix_fmt yuv420p',
        `-b:v ${videoKbps}k`,
        `-maxrate ${videoKbps}k`,
        `-bufsize ${bufKbps}k`,
        '-c:a aac',
        `-b:a ${audioKbps}k`,
      ];
    };

    const buildVf = () => {
      const parts = [];
      if (scale) parts.push(scale);
      if (hasSubtitleCues) {
        parts.push(`subtitles='${escapedSrtPath}':force_style='FontSize=24,FontName=Arial,PrimaryColour=&HFFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=30'`);
      }
      return parts.join(',');
    };

    const MAX_RETRIES = 4;

    const tryEncode = (attempt: number, limitMb: number) => {
      if (isChapterCancelRequested(jobId)) {
        return reject(new ChapterCancelledError());
      }
      // Delete previous output if we retry.
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch {}
      }

      const vf = buildVf();
      const encoding = maxSizeMb
        ? buildEncoding(limitMb)
        : [
          ...getVideoEncodingOptions('fast'),
          '-c:a aac',
          `-b:a ${audioKbps}k`,
        ];

      const ffmpegStderr: string[] = [];
      let command = ffmpeg(inputPath)
        .setStartTime(startSec)
        .duration(duration);
      setActiveCommand(jobId, command);

      if (subtitleType === 'hardcoded') {
        const outputOptions = [
          ...encoding,
          '-movflags +faststart',
        ];
        if (vf) {
          outputOptions.unshift(`-vf ${vf}`);
        }
        command = command.outputOptions(outputOptions);
      } else {
        if (hasSubtitleCues) {
          command = command
            .input(srtPath)
            .outputOptions([
              ...encoding,
              '-c:s mov_text',
              '-metadata:s:s:0 language=de',
              '-map 0:v:0',
              '-map 0:a?',
              '-map 1:0',
              '-movflags +faststart',
            ]);
        } else {
          command = command.outputOptions([
            ...(vf ? [`-vf ${vf}`] : []),
            ...encoding,
            '-map 0:v:0',
            '-map 0:a?',
            '-movflags +faststart',
          ]);
        }
      }

      command
        .output(outputPath)
        .on('start', (cmdline) => {
          console.log(
            `[ChapterWorker] Encode attempt ${attempt + 1}/${MAX_RETRIES + 1} start=` +
            `${startSec.toFixed(3)}s dur=${duration.toFixed(3)}s limit=${Math.max(1, Math.floor(limitMb))}MB ` +
            `subtitleType=${subtitleType} cues=${hasSubtitleCues ? 'yes' : 'no'} cmd="${cmdline}"`
          );
        })
        .on('stderr', (line) => {
          const cleaned = String(line || '').trim();
          if (!cleaned) return;
          ffmpegStderr.push(cleaned);
          if (ffmpegStderr.length > 24) ffmpegStderr.shift();
        })
        .on('end', () => {
          setActiveCommand(jobId, null);
          if (!maxBytes) return resolve();
          try {
            const size = fs.statSync(outputPath).size;
            if (size > maxBytes && attempt < MAX_RETRIES) {
              const ratio = maxBytes / size;
              const nextLimitMb = Math.max(1, Math.floor(limitMb * ratio * 0.9));
              console.log(`[ChapterWorker] Chapter too large (${Math.round(size / (1024 * 1024))}MB > ${Math.floor(limitMb)}MB), retry with tighter limit: ${nextLimitMb}MB`);
              return tryEncode(attempt + 1, nextLimitMb);
            }
            if (size > maxBytes) {
              const actualMb = Math.round(size / (1024 * 1024));
              const targetMb = Math.max(1, Math.floor(maxSizeMb || (maxBytes / 1024 / 1024)));
              const stderrTail = ffmpegStderr.slice(-4).join(' | ');
              if (stderrTail) {
                console.error(`[ChapterWorker] Final oversize after retries. ffmpeg tail: ${stderrTail}`);
              }
              const err: Error & { code?: string; actualMb?: number; targetMb?: number } =
                new Error(`Chapter exceeds max size (${actualMb}MB > ${targetMb}MB).`);
              err.code = 'CHAPTER_TOO_LARGE';
              err.actualMb = actualMb;
              err.targetMb = targetMb;
              return reject(err);
            }
          } catch {}
          return resolve();
        })
        .on('error', (err) => {
          setActiveCommand(jobId, null);
          if (isChapterCancelRequested(jobId)) {
            return reject(new ChapterCancelledError());
          }
          const stderrTail = ffmpegStderr.slice(-8).join(' | ');
          if (stderrTail) {
            console.error(`[ChapterWorker] splitAndEmbed ffmpeg stderr tail: ${stderrTail}`);
            if (err && typeof err.message === 'string') {
              err.message = `${err.message} (ffmpeg: ${stderrTail})`;
            }
          }
          reject(err);
        })
        .run();
    };

    return tryEncode(0, maxSizeMb ? Math.floor(maxSizeMb) : 0);
  });
}

// Chapter definition interface
interface Chapter {
  start: string;  // SRT format: "00:10:30,500"
  end: string;
  title: string;
}

interface ChapterTask {
  startSec: number;
  endSec: number;
  titleBase: string;
  partPath: string;
  splitDepth: number;
}

function formatChapterTitle(task: ChapterTask): string {
  if (!task.partPath) return task.titleBase;
  return `${task.titleBase} (Teil ${task.partPath})`;
}

// Chapter splitting job data interface
interface ChapterSplitJobData {
  jobId: string;
  userId: number;
  videoPath: string;
  srtContent: string;
  chapters: Chapter[];
  backupPath: string;
  originalFilename: string;
  sourceKind?: 'proxy_mp4' | 'original_webm' | 'original_mp4';
  usedProxy?: boolean;
  maxSizeMb?: number;
  subtitleType?: 'hardcoded' | 'soft';
}

// Process chapter splitting
async function processChapterSplit(bullJob: BullJob<ChapterSplitJobData>): Promise<string> {
  const { jobId, userId, videoPath, srtContent, chapters, backupPath, originalFilename, sourceKind, usedProxy, maxSizeMb, subtitleType } = bullJob.data;

  let inputPath = videoPath;
  let convertedPath: string | null = null;
  const outputDir = tmpPath(`chapters_${jobId}`);
  const archivePath = tmpPath(`chapters_${jobId}.tar.gz`);
  const chapterFiles: Array<{
    index: number;
    title: string;
    videoFilename: string;
    srtFilename: string;
  }> = [];

  chapterCancelRequests.delete(jobId);
  activeChapterProcesses.set(jobId, {
    command: null,
    phase: 'starting',
    startedAt: Date.now(),
  });

  try {
    // Update job status to active
    updateJob(jobId, {
      status: 'active',
      progressStage: 'starting',
      progressPercent: 0,
      startedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'progress', {
      status: 'active',
      stage: 'starting',
      percent: 0,
    });
    throwIfChapterCancelled(jobId);

    // 1. Create backup
    console.log(`[ChapterWorker] Creating backup: ${jobId}`);
    console.log(`[ChapterWorker] Source mode ${sourceKind || 'unknown'} (usedProxy=${usedProxy ? 'true' : 'false'}): ${jobId}`);
    setChapterPhase(jobId, 'backup');
    updateJob(jobId, { progressStage: 'backup', progressPercent: 2 });
    await publishJobEvent(jobId, userId, 'progress', { stage: 'backup', percent: 2 });

    // Ensure backup directory exists
    const backupDir = path.dirname(backupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.copyFileSync(videoPath, backupPath);
    console.log(`[ChapterWorker] Backup created: ${backupPath}`);
    throwIfChapterCancelled(jobId);

    // 2. Convert WebM to MP4 if needed
    const isWebM = videoPath.toLowerCase().endsWith('.webm');
    if (isWebM) {
      console.log(`[ChapterWorker] WebM detected, converting to MP4: ${jobId}`);
      updateJob(jobId, { progressStage: 'converting', progressPercent: 5 });
      await publishJobEvent(jobId, userId, 'progress', { stage: 'converting', percent: 5 });

      convertedPath = await convertToMp4(videoPath, jobId, userId);
      inputPath = convertedPath;
    }
    throwIfChapterCancelled(jobId);

    // 3. Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 4. Process each chapter
    const chapterQueue: ChapterTask[] = chapters
      .map((chapter) => ({
        startSec: srtTimeToSeconds(chapter.start),
        endSec: srtTimeToSeconds(chapter.end),
        titleBase: chapter.title || 'Kapitel',
        partPath: '',
        splitDepth: 0,
      }))
      .filter((chapter) => chapter.endSec > chapter.startSec);

    if (chapterQueue.length === 0) {
      throw new Error('Keine gueltigen Kapitelgrenzen gefunden');
    }

    const chapterMaxSizeMb = Number.isFinite(Number(maxSizeMb))
      ? Math.max(25, Math.min(125, Number(maxSizeMb)))
      : 125;
    const maxSplitDepth = 6;
    const minSplitDurationSec = 20;
    let queueIndex = 0;
    let completedChapters = 0;
    let lastProgressPercent = 20;

    console.log(`[ChapterWorker] Processing ${chapterQueue.length} chapters: ${jobId}`);

    while (queueIndex < chapterQueue.length) {
      throwIfChapterCancelled(jobId);
      const chapter = chapterQueue[queueIndex];
      const chapterNum = completedChapters + 1;
      const chapterTitle = formatChapterTitle(chapter);
      const duration = chapter.endSec - chapter.startSec;
      const totalPlanned = Math.max(1, chapterQueue.length);
      const computedPercent = 20 + Math.round((completedChapters / totalPlanned) * 70);
      const basePercent = Math.max(lastProgressPercent, computedPercent);
      lastProgressPercent = basePercent;

      updateJob(jobId, {
        progressStage: `chapter ${chapterNum}/${totalPlanned}`,
        progressPercent: basePercent,
      });
      await publishJobEvent(jobId, userId, 'progress', {
        stage: `Kapitel ${chapterNum}/${totalPlanned}: ${chapterTitle}`,
        percent: basePercent,
      });

      const chapterStart = secondsToSrtTime(chapter.startSec);
      const chapterEnd = secondsToSrtTime(chapter.endSec);
      const chapterSrt = extractSrtForTimeRange(srtContent, chapterStart, chapterEnd);
      const chapterHasSubtitleCues = chapterSrt.includes('-->');
      const filePrefix = chapterNum.toString().padStart(2, '0');
      const srtFilename = `${filePrefix}_${sanitizeFilename(chapterTitle)}.srt`;
      const srtPath = path.join(outputDir, srtFilename);
      fs.writeFileSync(srtPath, chapterSrt);

      const videoFilename = `${filePrefix}_${sanitizeFilename(chapterTitle)}.mp4`;
      const outputPath = path.join(outputDir, videoFilename);

      console.log(`[ChapterWorker] Processing chapter ${chapterNum}: ${chapterTitle} (${chapter.startSec}s - ${chapter.endSec}s)`);
      try {
        await splitAndEmbed(inputPath, srtPath, chapter.startSec, duration, outputPath, jobId, {
          maxSizeMb: chapterMaxSizeMb,
          subtitleType: subtitleType || 'hardcoded',
          hasSubtitleCues: chapterHasSubtitleCues,
        });
      } catch (err: any) {
        cleanupFile(outputPath);
        cleanupFile(srtPath);

        const canSplit =
          err?.code === 'CHAPTER_TOO_LARGE' &&
          duration >= minSplitDurationSec &&
          chapter.splitDepth < maxSplitDepth;

        if (canSplit) {
          const middle = chapter.startSec + duration / 2;
          const leftPath = chapter.partPath ? `${chapter.partPath}.1` : '1';
          const rightPath = chapter.partPath ? `${chapter.partPath}.2` : '2';

          chapterQueue.splice(
            queueIndex,
            1,
            {
              startSec: chapter.startSec,
              endSec: middle,
              titleBase: chapter.titleBase,
              partPath: leftPath,
              splitDepth: chapter.splitDepth + 1,
            },
            {
              startSec: middle,
              endSec: chapter.endSec,
              titleBase: chapter.titleBase,
              partPath: rightPath,
              splitDepth: chapter.splitDepth + 1,
            },
          );

          await publishJobEvent(jobId, userId, 'progress', {
            stage: `Kapitel zu gross, teile automatisch: ${chapterTitle}`,
            percent: Math.max(lastProgressPercent, 22),
          });
          console.log(`[ChapterWorker] Auto-splitting oversized chapter: ${chapterTitle}`);
          continue;
        }

        if (err?.code === 'CHAPTER_TOO_LARGE') {
          throw new Error(`Kapitel ${chapterNum} (${chapterTitle}) konnte nicht unter ${chapterMaxSizeMb}MB exportiert werden.`);
        }

        const detail = err?.message ? ` Grund: ${err.message}` : '';
        throw new Error(`Kapitel ${chapterNum} (${chapterTitle}) konnte nicht exportiert werden.${detail}`);
      }

      chapterFiles.push({
        index: chapterNum,
        title: chapterTitle,
        videoFilename,
        srtFilename,
      });

      completedChapters += 1;
      queueIndex += 1;

      console.log(`[ChapterWorker] Chapter ${chapterNum} complete: ${outputPath}`);
    }

    // 5. Create tar.gz archive
    throwIfChapterCancelled(jobId);
    setChapterPhase(jobId, 'packaging');
    console.log(`[ChapterWorker] Creating archive: ${jobId}`);
    updateJob(jobId, { progressStage: 'packaging', progressPercent: 92 });
    await publishJobEvent(jobId, userId, 'progress', { stage: 'Archiv erstellen', percent: 92 });

    await createTarGz(outputDir, archivePath);

    // 6. Mark job as completed
    updateJob(jobId, {
      status: 'completed',
      progressStage: 'done',
      progressPercent: 100,
      resultFilePath: archivePath,
      resultData: {
        chapterCount: chapterFiles.length,
        backupPath,
        originalFilename,
        chapterOutputDir: outputDir,
        chapterFiles,
      },
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'completed', {
      status: 'completed',
      percent: 100,
      chapterCount: chapterFiles.length,
    });

    console.log(`[ChapterWorker] Job completed: ${jobId} - ${chapterFiles.length} chapters created`);

    // Cleanup temp files (keep backup)
    cleanupFile(videoPath);
    if (convertedPath) cleanupFile(convertedPath);

    return archivePath;

  } catch (error: any) {
    console.error(`[ChapterWorker] Job failed: ${jobId}`, error);
    const cancelled = error instanceof ChapterCancelledError || isChapterCancelRequested(jobId);
    const timedOut = error instanceof ChapterConvertTimeoutError;
    const errorMessage = cancelled
      ? 'cancelled'
      : timedOut
        ? 'chapter_convert_timeout'
        : (error.message || 'Chapter splitting failed');
    const progressStage = cancelled ? 'cancelled' : 'failed';
    const errorCode = cancelled ? 'cancelled' : timedOut ? 'chapter_convert_timeout' : null;

    // Update job as failed
    updateJob(jobId, {
      status: 'failed',
      progressStage,
      errorMessage,
      errorCode,
      finishedAt: new Date(),
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'failed', {
      status: 'failed',
      stage: progressStage,
      error: errorMessage,
    });

    // Cleanup temp files
    cleanupFile(videoPath);
    if (convertedPath) cleanupFile(convertedPath);
    cleanupTempFilesForJob(jobId);
    cleanupDir(outputDir);
    cleanupFile(archivePath);

    throw error;
  } finally {
    setActiveCommand(jobId, null);
    activeChapterProcesses.delete(jobId);
    chapterCancelRequests.delete(jobId);
  }
}

// Create and start the chapter worker
export function startChapterWorker() {
  const worker = new Worker<ChapterSplitJobData>(
    'chapter-splitting',
    processChapterSplit,
    {
      connection: queueConnection,
      concurrency: 1, // Process one job at a time
    }
  );

  worker.on('ready', () => {
    console.log('[ChapterWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[ChapterWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ChapterWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[ChapterWorker] Worker error:', err);
  });

  return worker;
}

export { processChapterSplit, ChapterSplitJobData };
