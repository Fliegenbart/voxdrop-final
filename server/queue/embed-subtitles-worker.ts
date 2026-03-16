import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { sendSubtitleEmbedCompleteEmail } from '../email/service';
import { incrementUsage } from '../db/queries';
import { subtitleEmbedQueue } from './queues';
import { inferJobErrorCode, isRetryableErrorCode, sanitizeErrorMessage } from './job-error-codes';
import { tieredRetryBackoff } from './retry-policy';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getTmpDir, tmpPath } from '../utils/tmp';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';
import { checkNvencAvailable } from '../utils/nvenc';
import { preflightInputFile } from '../utils/job-inputs';

const queueConnection = redisConnection as any;

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.floor(value)));

function getEnvMs(name: string, fallbackMs: number, minMs: number, maxMs: number): number {
  const raw = process.env[name];
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallbackMs;
  return clampInt(parsed, minMs, maxMs);
}

// Guardrails: prevent a single FFmpeg run from blocking the queue forever.
// You can tune these in ops without code changes.
const EMBED_MAX_RUNTIME_MS = getEnvMs(
  'VOXDROP_SUBTITLE_EMBED_TIMEOUT_MS',
  60 * 60 * 1000, // 60m
  5 * 60 * 1000,  // 5m
  6 * 60 * 60 * 1000 // 6h
);
const EMBED_NO_PROGRESS_TIMEOUT_MS = getEnvMs(
  'VOXDROP_SUBTITLE_EMBED_NO_PROGRESS_TIMEOUT_MS',
  10 * 60 * 1000, // 10m
  60 * 1000,      // 1m
  60 * 60 * 1000  // 60m
);
const EMBED_CONCURRENCY = clampInt(
  Number(process.env.VOXDROP_SUBTITLE_EMBED_CONCURRENCY || 1),
  1,
  4
);
const MIN_GPU_FREE_MB = Math.max(
  128,
  Number(process.env.VOXDROP_SUBTITLE_EMBED_MIN_GPU_FREE_MB || 1500),
);

type FfprobeCodecInfo = {
  formatName: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
};

type EncodeQuality = 'fast' | 'balanced' | 'quality';

async function probeCodecs(inputPath: string): Promise<FfprobeCodecInfo> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) {
        resolve({ formatName: null, videoCodec: null, audioCodec: null });
        return;
      }
      const formatName = (data as any)?.format?.format_name ? String((data as any).format.format_name) : null;
      const streams = (data as any)?.streams || [];
      const v = streams.find((s: any) => s.codec_type === 'video');
      const a = streams.find((s: any) => s.codec_type === 'audio');
      resolve({
        formatName,
        videoCodec: v?.codec_name ? String(v.codec_name) : null,
        audioCodec: a?.codec_name ? String(a.codec_name) : null,
      });
    });
  });
}

// Get video encoding options
function getVideoEncodingOptions(quality: EncodeQuality = 'balanced'): string[] {
  if (checkNvencAvailable('[EmbedSubtitlesWorker]')) {
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

function getEmbedQuality(): EncodeQuality {
  const raw = String(process.env.VOXDROP_SUBTITLE_EMBED_QUALITY || 'fast').toLowerCase();
  if (raw === 'quality') return 'quality';
  if (raw === 'balanced') return 'balanced';
  return 'fast';
}

function usesNvencEncoding(options: string[] | null | undefined): boolean {
  if (!options || options.length === 0) return false;
  return options.some((opt) => /\bh264_nvenc\b/i.test(opt));
}

function attemptsLeft(bullJob: BullJob<any>): number {
  const maxAttempts = bullJob.opts?.attempts ?? 1;
  const made = bullJob.attemptsMade ?? 0;
  // In the catch block we are still on the current attempt.
  return Math.max(0, maxAttempts - (made + 1));
}

function getAttemptNumber(bullJob: BullJob<any>): number {
  return Math.max(1, (bullJob.attemptsMade ?? 0) + 1);
}

function getFreeGpuMb(): number {
  try {
    const output = execSync(
      "nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -n 1",
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 },
    );
    const parsed = Number(String(output).trim());
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function cleanupFile(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[EmbedSubtitlesWorker] Failed to cleanup ${filePath}:`, err);
  }
}

function normalizeNotifyEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

interface EmbedSubtitlesJobData {
  jobId: string;
  userId: number;
  videoPath: string;
  videoChecksum?: string;
  srtPath: string;
  srtChecksum?: string;
  fontPath?: string | null;
  fontChecksum?: string | null;
  subtitleType: 'hardcoded' | 'soft';
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  originalName: string;
  notifyEmail?: string;
}

async function convertWebmToMp4(
  inputPath: string,
  jobId: string,
  userId: number,
  encodingOptions: string[]
): Promise<string> {
  const outputPath = tmpPath(`embed_convert_${jobId}_${Date.now()}.mp4`);

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .outputOptions([
        ...encodingOptions,
        '-c:a aac',
        '-b:a 128k',
        '-fps_mode vfr',
      ])
      .output(outputPath)
      // Avoid ffmpeg waiting on stdin (can happen in some environments).
      .inputOptions(['-nostdin'])
      .on('start', (cmdLine) => {
        console.log(`[EmbedSubtitlesWorker] ffmpeg convert start: ${cmdLine}`);
        updateJob(jobId, { progressStage: 'converting', phase: 'converting', progressPercent: 15 });
        publishJobEvent(jobId, userId, 'progress', {
          stage: 'converting',
          percent: 15,
        });
      })
      .on('progress', (progress) => {
        const percent = Math.min(30, 10 + Math.round(progress.percent || 0) * 0.2);
        updateJob(jobId, { progressPercent: percent });
        publishJobEvent(jobId, userId, 'progress', {
          stage: 'converting',
          percent,
        });
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err, _stdout, stderr) => {
        const detail = stderr ? `\n${String(stderr).slice(-2000)}` : '';
        reject(new Error(`${err?.message || err}${detail}`));
      })
      ;

    let finished = false;
    let lastActivityMs = Date.now();
    const startedAtMs = Date.now();
    const interval = setInterval(() => {
      if (finished) return;
      const now = Date.now();
      if (now - startedAtMs > EMBED_MAX_RUNTIME_MS) {
        finished = true;
        try { command.kill('SIGKILL'); } catch {}
        clearInterval(interval);
        reject(new Error(`FFmpeg timeout (max_runtime ${Math.round(EMBED_MAX_RUNTIME_MS / 60000)}m)`));
        return;
      }
      if (now - lastActivityMs > EMBED_NO_PROGRESS_TIMEOUT_MS) {
        finished = true;
        try { command.kill('SIGKILL'); } catch {}
        clearInterval(interval);
        reject(new Error(`FFmpeg timeout (no_progress ${Math.round(EMBED_NO_PROGRESS_TIMEOUT_MS / 60000)}m)`));
      }
    }, 30_000);

    command
      .on('stderr', () => { lastActivityMs = Date.now(); })
      .on('progress', () => { lastActivityMs = Date.now(); })
      .on('end', () => {
        finished = true;
        clearInterval(interval);
      })
      .on('error', () => {
        finished = true;
        clearInterval(interval);
      })
      .run();
  });
}

async function processEmbedSubtitles(bullJob: BullJob<EmbedSubtitlesJobData>): Promise<string> {
  const {
    jobId,
    userId,
    videoPath,
    videoChecksum,
    srtPath,
    srtChecksum,
    fontPath,
    fontChecksum,
    subtitleType,
    fontSize = 24,
    fontColor = '#FFFFFF',
    backgroundColor = '#000000',
    backgroundOpacity = 80,
    originalName,
    notifyEmail,
  } = bullJob.data;
  const notificationEmail = normalizeNotifyEmail(notifyEmail);

  let gpuAllocation: Awaited<ReturnType<typeof acquireGpuSlot>> | null = null;
  const attempt = getAttemptNumber(bullJob);
  const attemptDir = path.join(getTmpDir(), 'jobs', jobId, `attempt-${attempt}`);
  try { fs.mkdirSync(attemptDir, { recursive: true }); } catch {}
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let currentPhase = 'preparing';
  let currentPercent = 5;

  updateJob(jobId, {
    status: 'active',
    progressStage: 'preparing',
    phase: 'preparing',
    progressPercent: 5,
    retryCount: Math.max(0, bullJob.attemptsMade ?? 0),
    errorCode: null,
    lastHeartbeatAt: new Date(),
    startedAt: new Date(),
  });

  await publishJobEvent(jobId, userId, 'progress', {
    status: 'active',
    stage: 'preparing',
    percent: 5,
    retryCount: Math.max(0, bullJob.attemptsMade ?? 0),
  });

  let convertedMp4Path: string | null = null;
  let videoInputPath = videoPath;
  const outputPath = path.join(attemptDir, `subtitled_${jobId}.mp4`);
  const finalOutputPath = tmpPath(`subtitled_${jobId}.mp4`);

  try {
    heartbeatTimer = setInterval(() => {
      updateJob(jobId, {
        lastHeartbeatAt: new Date(),
        phase: currentPhase,
        progressStage: currentPhase,
        progressPercent: currentPercent,
      });
    }, 15_000);

    const videoPreflight = preflightInputFile({ filePath: videoPath, expectedChecksum: videoChecksum || undefined });
    if (!videoPreflight.exists || videoPreflight.reason) {
      throw new Error(videoPreflight.reason || 'input_missing');
    }
    const srtPreflight = preflightInputFile({ filePath: srtPath, expectedChecksum: srtChecksum || undefined });
    if (!srtPreflight.exists || srtPreflight.reason) {
      throw new Error(srtPreflight.reason || 'input_missing');
    }
    if (fontPath) {
      const fontPreflight = preflightInputFile({ filePath: fontPath, expectedChecksum: fontChecksum || undefined });
      if (!fontPreflight.exists || fontPreflight.reason) {
        throw new Error(fontPreflight.reason || 'input_missing');
      }
    }

    // Multer temp files have no extension; detect codecs/container via ffprobe.
    // For soft subtitles we mux into MP4 with `-c copy` (plus mov_text). That fails unless the input is MP4-compatible.
    const codecs = await probeCodecs(videoInputPath);
    const formatName = codecs.formatName || '';
    const isMp4Container = /(^|,)(mov|mp4|m4a|3gp|3g2|mj2)(,|$)/i.test(formatName);
    const canStreamCopyForSoft =
      isMp4Container &&
      (codecs.videoCodec === 'h264' || codecs.videoCodec === 'hevc') &&
      // Some recordings have no audio stream; allow that.
      (codecs.audioCodec === null || codecs.audioCodec === 'aac');

    // Convert to MP4/H.264/AAC when needed to avoid ffmpeg "could not write header"/muxing failures.
    const shouldConvertToMp4 = subtitleType === 'soft' && !canStreamCopyForSoft;
    const conversionEncodingOptions = shouldConvertToMp4 ? getVideoEncodingOptions('fast') : [];
    const hardcodedEncodingOptions =
      subtitleType === 'hardcoded' ? getVideoEncodingOptions(getEmbedQuality()) : [];

    if (usesNvencEncoding(conversionEncodingOptions) || usesNvencEncoding(hardcodedEncodingOptions)) {
      const freeGpuMb = getFreeGpuMb();
      if (freeGpuMb > 0 && freeGpuMb < MIN_GPU_FREE_MB) {
        throw new Error(`gpu_slot_timeout: insufficient_free_vram_${freeGpuMb}mb`);
      }
      const gpuWaitStartedAt = Date.now();
      gpuAllocation = await acquireGpuSlot('subtitle-embed', bullJob.id);
      updateJob(jobId, { gpuWaitMs: Date.now() - gpuWaitStartedAt });
    } else {
      console.log('[EmbedSubtitlesWorker] Skipping GPU slot: no NVENC encode path for this job');
    }

    if (shouldConvertToMp4) {
      currentPhase = 'converting';
      currentPercent = 15;
      console.log(
        `[EmbedSubtitlesWorker] Converting input for soft subtitles (format=${formatName || 'unknown'}, v=${codecs.videoCodec || 'n/a'}, a=${codecs.audioCodec || 'n/a'})`
      );
      convertedMp4Path = await convertWebmToMp4(videoInputPath, jobId, userId, conversionEncodingOptions);
      videoInputPath = convertedMp4Path;
    }

    currentPhase = 'embedding';
    currentPercent = 35;
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(videoInputPath);
      let lastPercent = 0;
      const stderrTail: string[] = [];
      let finished = false;
      let lastActivityMs = Date.now();
      const startedAtMs = Date.now();

      if (subtitleType === 'hardcoded') {
        const hexToAss = (hex: string, transparency: number = 0): string => {
          const clean = hex.replace('#', '');
          const r = clean.substring(0, 2);
          const g = clean.substring(2, 4);
          const b = clean.substring(4, 6);
          const alphaHex = Math.round(transparency * 2.55).toString(16).padStart(2, '0').toUpperCase();
          return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
        };

        const safeOpacity = Math.min(100, Math.max(0, backgroundOpacity));
        const primaryColour = hexToAss(fontColor, 0);
        const backColour = hexToAss(backgroundColor, 100 - safeOpacity);
        const outlineColour = hexToAss(backgroundColor, 0);

        const borderStyle = safeOpacity > 0 ? 4 : 1;
        let forceStyle = `FontSize=${fontSize},PrimaryColour=${primaryColour},BackColour=${backColour},OutlineColour=${outlineColour},BorderStyle=${borderStyle},Outline=2,Shadow=0,MarginV=30`;

        // Burn-in subtitles are CPU-heavy because of the subtitles filter.
        // Default to "fast" for better throughput; can be overridden via VOXDROP_SUBTITLE_EMBED_QUALITY.
        const encodingOptions = hardcodedEncodingOptions;

        if (fontPath) {
          const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, '\\:');
          command = command.outputOptions([
            `-vf subtitles='${escapedSrtPath}':fontsdir='${path.dirname(fontPath)}':force_style='FontName=${path.basename(fontPath, path.extname(fontPath))},${forceStyle}'`,
            ...encodingOptions,
            '-c:a aac',
            '-b:a 128k',
            '-fps_mode vfr',
            '-movflags +faststart',
          ]);
        } else {
          forceStyle = `FontName=Arial,${forceStyle}`;
          command = command.outputOptions([
            `-vf subtitles='${srtPath.replace(/'/g, "'\\''")}':force_style='${forceStyle}'`,
            ...encodingOptions,
            '-c:a aac',
            '-b:a 128k',
            '-fps_mode vfr',
            '-movflags +faststart',
          ]);
        }
      } else {
        command = command
          .input(srtPath)
          .outputOptions([
            '-c:v copy',
            '-c:a copy',
            '-c:s mov_text',
            '-metadata:s:s:0 language=de',
          ]);
      }

      command
        // Avoid ffmpeg waiting on stdin (can happen in some environments).
        .inputOptions(['-nostdin'])
        .output(outputPath)
        .on('start', (cmdLine) => {
          console.log(`[EmbedSubtitlesWorker] ffmpeg embed start: ${cmdLine}`);
          updateJob(jobId, { progressStage: 'embedding', phase: 'embedding', progressPercent: 35 });
          publishJobEvent(jobId, userId, 'progress', {
            stage: 'embedding',
            percent: 35,
          });
        })
        .on('stderr', (line) => {
          // Keep a short tail to debug failures without flooding logs.
          lastActivityMs = Date.now();
          stderrTail.push(String(line));
          if (stderrTail.length > 60) stderrTail.shift();
        })
        .on('progress', (progress) => {
          lastActivityMs = Date.now();
          const rawPercent = progress.percent || 0;
          const percent = Math.min(95, 35 + Math.round(rawPercent * 0.6));
          if (percent > lastPercent + 5) {
            lastPercent = percent;
            updateJob(jobId, { progressPercent: percent });
            publishJobEvent(jobId, userId, 'progress', {
              stage: 'embedding',
              percent,
            });
          }
        })
        .on('end', () => {
          finished = true;
          resolve();
        })
        .on('error', (err, _stdout, stderr) => {
          if (finished) return;
          finished = true;
          const stderrText = (stderr ? String(stderr) : stderrTail.join('\n')).slice(-4000);
          reject(new Error(`${err?.message || err}\n${stderrText}`.trim()));
        })
        .run();

      const interval = setInterval(() => {
        if (finished) return;
        const now = Date.now();
        if (now - startedAtMs > EMBED_MAX_RUNTIME_MS) {
          finished = true;
          try { command.kill('SIGKILL'); } catch {}
          clearInterval(interval);
          reject(new Error(`FFmpeg timeout (max_runtime ${Math.round(EMBED_MAX_RUNTIME_MS / 60000)}m)`));
          return;
        }
        if (now - lastActivityMs > EMBED_NO_PROGRESS_TIMEOUT_MS) {
          finished = true;
          try { command.kill('SIGKILL'); } catch {}
          clearInterval(interval);
          reject(new Error(`FFmpeg timeout (no_progress ${Math.round(EMBED_NO_PROGRESS_TIMEOUT_MS / 60000)}m)`));
        }
      }, 30_000);

      const clear = () => clearInterval(interval);
      command.on('end', clear);
      command.on('error', clear);
    });

    try {
      fs.copyFileSync(outputPath, finalOutputPath);
    } catch {
      // If copy fails, keep the original path for backward compatibility.
    }
    const resultPath = fs.existsSync(finalOutputPath) ? finalOutputPath : outputPath;

    updateJob(jobId, {
      status: 'completed',
      progressStage: 'done',
      phase: 'done',
      progressPercent: 100,
      errorCode: null,
      lastHeartbeatAt: new Date(),
      resultFilePath: resultPath,
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'completed', {
      status: 'completed',
      percent: 100,
      resultFilePath: resultPath,
    });

    try {
      incrementUsage(userId, 'videos');
    } catch (err) {
      console.error('[EmbedSubtitlesWorker] Failed to track usage:', err);
    }

    if (notificationEmail) {
      const emailResult = await sendSubtitleEmbedCompleteEmail(
        notificationEmail,
        originalName,
        jobId,
        true
      );
      if (!emailResult.success) {
        console.error(
          `[EmbedSubtitlesWorker] Failed to send completion email for job ${jobId}: ${emailResult.error || 'unknown_error'}`,
        );
      } else {
        console.log(`[EmbedSubtitlesWorker] Completion email sent for job ${jobId} to ${notificationEmail}`);
      }
    }

    cleanupFile(videoPath);
    cleanupFile(srtPath);
    cleanupFile(fontPath || null);
    cleanupFile(convertedMp4Path);
    cleanupFile(outputPath === resultPath ? null : outputPath);

    return resultPath;
  } catch (error: any) {
    const retriesLeft = attemptsLeft(bullJob);
    const errorMessage = sanitizeErrorMessage(error, 'Embedding failed');
    const errorCode = inferJobErrorCode(errorMessage);
    const retryable = isRetryableErrorCode(errorCode);

    if (retryable && retriesLeft > 0) {
      const retriesDone = Math.max(1, (bullJob.attemptsMade ?? 0) + 1);
      updateJob(jobId, {
        status: 'pending',
        progressStage: 'retrying',
        phase: 'retrying',
        progressPercent: 35,
        retryCount: retriesDone,
        errorCode,
        lastHeartbeatAt: new Date(),
        errorMessage: `Einbettung fehlgeschlagen, erneuter Versuch folgt (${retriesLeft} retries verbleibend).`,
      });

      await publishJobEvent(jobId, userId, 'progress', {
        status: 'pending',
        stage: 'retrying',
        percent: 35,
        retryCount: retriesDone,
        errorCode,
        message: 'Einbettung fehlgeschlagen, erneuter Versuch folgt.',
      });

      cleanupFile(convertedMp4Path);
      cleanupFile(outputPath);
      cleanupFile(finalOutputPath);
      throw error;
    }

    updateJob(jobId, {
      status: 'failed',
      phase: 'failed',
      errorMessage,
      errorCode,
      retryCount: Math.max(0, (bullJob.attemptsMade ?? 0) + (retriesLeft === 0 ? 1 : 0)),
      lastHeartbeatAt: new Date(),
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'failed', {
      status: 'failed',
      error: errorMessage,
      errorCode,
    });

    if (notificationEmail) {
      const emailResult = await sendSubtitleEmbedCompleteEmail(
        notificationEmail,
        originalName,
        jobId,
        false
      );
      if (!emailResult.success) {
        console.error(
          `[EmbedSubtitlesWorker] Failed to send failure email for job ${jobId}: ${emailResult.error || 'unknown_error'}`,
        );
      } else {
        console.log(`[EmbedSubtitlesWorker] Failure email sent for job ${jobId} to ${notificationEmail}`);
      }
    }

    cleanupFile(videoPath);
    cleanupFile(srtPath);
    cleanupFile(fontPath || null);
    cleanupFile(convertedMp4Path);
    cleanupFile(outputPath);
    cleanupFile(finalOutputPath);

    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    try { fs.rmSync(attemptDir, { recursive: true, force: true }); } catch {}
    releaseGpuSlot(gpuAllocation);
  }
}

export function startEmbedSubtitlesWorker() {
  const worker = new Worker<EmbedSubtitlesJobData>(
    'subtitle-embed',
    processEmbedSubtitles,
    {
      connection: queueConnection,
      concurrency: EMBED_CONCURRENCY,
      // Embedding subtitles can take many minutes for large uploads.
      // A short lockDuration increases the chance of BullMQ marking jobs as "stalled"
      // during deploys or temporary event-loop stalls. Use a long lock and allow a few stall recoveries.
      lockDuration: 30 * 60 * 1000, // 30 minutes
      maxStalledCount: 3,
      stalledInterval: 30 * 1000,
      settings: {
        backoffStrategy: tieredRetryBackoff,
      },
    }
  );

  worker.on('ready', () => {
    console.log('[EmbedSubtitlesWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[EmbedSubtitlesWorker] Job ${job.id} completed`);
  });

  worker.on('stalled', async (bullJobId) => {
    // BullMQ detected a lost lock and will re-queue the job (unless maxStalledCount exceeded).
    // The UI polls our job-store, so we should surface that this job is being retried.
    console.warn(`[EmbedSubtitlesWorker] Job ${bullJobId} stalled`);
    try {
      const job = await subtitleEmbedQueue.getJob(bullJobId);
      const data = (job?.data || null) as Partial<EmbedSubtitlesJobData> | null;
      const jobId = data?.jobId;
      const userId = data?.userId;
      if (jobId && typeof userId === 'number') {
        updateJob(jobId, {
          status: 'active',
          progressStage: 'retrying',
          phase: 'retrying',
          lastHeartbeatAt: new Date(),
        });
        publishJobEvent(jobId, userId, 'progress', {
          status: 'active',
          stage: 'retrying',
          percent: 35,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[EmbedSubtitlesWorker] Failed to handle stalled job:', e);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmbedSubtitlesWorker] Job ${job?.id} failed:`, err.message);
    try {
      const maxAttempts = job?.opts?.attempts ?? 1;
      const made = job?.attemptsMade ?? 0;
      const retriesLeft = Math.max(0, maxAttempts - made);
      if (retriesLeft > 0) {
        console.warn(`[EmbedSubtitlesWorker] Job ${job?.id} retrying (${retriesLeft} retries left)`);
        return;
      }

      const data = (job?.data || null) as Partial<EmbedSubtitlesJobData> | null;
      const jobId = data?.jobId;
      const userId = data?.userId;
      if (jobId && typeof userId === 'number') {
        const errorMessage = sanitizeErrorMessage(err?.message || 'Embedding failed');
        const errorCode = inferJobErrorCode(errorMessage);
        updateJob(jobId, {
          status: 'failed',
          phase: 'failed',
          errorMessage,
          errorCode,
          lastHeartbeatAt: new Date(),
          completedAt: new Date(),
        });
        publishJobEvent(jobId, userId, 'failed', {
          status: 'failed',
          error: errorMessage,
          errorCode,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[EmbedSubtitlesWorker] Failed to sync failed status to job-store:', e);
    }
  });

  worker.on('error', (err) => {
    console.error('[EmbedSubtitlesWorker] Worker error:', err);
  });

  return worker;
}
