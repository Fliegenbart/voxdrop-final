/**
 * Video Processor Service
 *
 * FFmpeg operations for video cutting, trimming, and merging.
 * Uses system FFmpeg with GPU acceleration when available.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { checkNvencAvailable as checkNvencAvailableRuntime } from '../utils/nvenc';

// Check if NVENC (NVIDIA GPU encoding) is available
let nvencAvailable: boolean | null = null;

function checkNvencAvailable(): boolean {
  if (nvencAvailable !== null) return nvencAvailable;

  nvencAvailable = checkNvencAvailableRuntime('[VideoProcessor]');

  return nvencAvailable;
}

// Get encoding options based on GPU availability
function getEncodingOptions(): string[] {
  const useGpu = checkNvencAvailable();

  if (useGpu) {
    return [
      '-c:v', 'h264_nvenc',
      '-preset', 'p4',
      '-rc', 'vbr',
      '-cq', '23',
      '-b:v', '0',
      '-c:a', 'aac',
      '-b:a', '192k'
    ];
  } else {
    return [
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k'
    ];
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function estimateVideoBitrateKbps(params: {
  durationSeconds: number;
  maxSizeMb: number;
  audioKbps: number;
}): number {
  const { durationSeconds, maxSizeMb, audioKbps } = params;
  const seconds = Math.max(1, durationSeconds);
  const maxBytes = Math.max(1, Math.floor(maxSizeMb)) * 1024 * 1024;

  // Safety margin for container overhead and bitrate variance.
  const targetBits = maxBytes * 8 * 0.92;
  const targetKbpsTotal = targetBits / seconds / 1000;

  // Reserve some overhead (container + mux + variability).
  const overheadKbps = 80;
  const videoKbps = Math.floor(targetKbpsTotal - audioKbps - overheadKbps);

  // Keep within sane bounds.
  return clampInt(videoKbps, 180, 25000);
}

function resolutionScaleFilter(resolution?: '720p' | '1080p' | 'original' | '540p' | '360p'): string | null {
  if (!resolution || resolution === 'original') return null;
  if (resolution === '1080p') return 'scale=-2:1080:flags=lanczos';
  if (resolution === '720p') return 'scale=-2:720:flags=lanczos';
  if (resolution === '540p') return 'scale=-2:540:flags=lanczos';
  if (resolution === '360p') return 'scale=-2:360:flags=lanczos';
  return null;
}

type VideoFastMode = 'reencode' | 'auto' | 'copy';
type VideoAspect = '16:9' | '4:3' | '9:16';

function aspectRatioNumber(aspect: VideoAspect): number {
  if (aspect === '16:9') return 16 / 9;
  if (aspect === '4:3') return 4 / 3;
  return 9 / 16;
}

function aspectPadFilter(aspect?: VideoAspect): string | null {
  if (!aspect) return null;
  const r = aspectRatioNumber(aspect);
  // Keep full frame, never crop: pad output to the chosen aspect ratio.
  // a = input aspect ratio (iw/ih). If input is wider than target, pad height; else pad width.
  return `pad=w='if(gt(a,${r}),iw,ih*${r})':h='if(gt(a,${r}),iw/${r},ih)':x='(ow-iw)/2':y='(oh-ih)/2'`;
}

function videoFilterChain(filters: Array<string | null | undefined>): string | null {
  const parts = filters.filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(',');
}

function loudnormFilter(): string {
  // Speech-friendly defaults (EBU R128). Keep it simple and stable.
  return 'loudnorm=I=-16:TP=-2:LRA=11';
}

function getEncodingOptionsForMaxSize(params: {
  durationSeconds: number;
  maxSizeMb: number;
  audioKbps?: number;
}): { args: string[]; audioKbps: number; videoKbps: number } {
  const audioKbps = clampInt(params.audioKbps ?? 96, 48, 192);
  const videoKbps = estimateVideoBitrateKbps({
    durationSeconds: params.durationSeconds,
    maxSizeMb: params.maxSizeMb,
    audioKbps,
  });

  const useGpu = checkNvencAvailable();
  if (useGpu) {
    return {
      audioKbps,
      videoKbps,
      args: [
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-rc', 'vbr',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${videoKbps}k`,
        '-bufsize', `${Math.max(200, videoKbps * 2)}k`,
        '-c:a', 'aac',
        '-b:a', `${audioKbps}k`,
      ],
    };
  }

  return {
    audioKbps,
    videoKbps,
    args: [
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-b:v', `${videoKbps}k`,
      '-maxrate', `${videoKbps}k`,
      '-bufsize', `${Math.max(200, videoKbps * 2)}k`,
      '-c:a', 'aac',
      '-b:a', `${audioKbps}k`,
    ],
  };
}

async function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    ffmpeg.on('close', (code) => resolve({ code: code ?? 1, stderr }));
    ffmpeg.on('error', (err) => resolve({ code: 1, stderr: err.message }));
  });
}

async function runFfprobe(args: string[], timeoutMs = 10000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, Math.max(1000, timeoutMs));

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: '', stderr: err.message });
    });
  });
}

export interface CutSegment {
  start: number;  // Start time in seconds
  end: number;    // End time in seconds
}

export interface CutResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
}

/**
 * Cut a segment from a video
 */
export async function cutVideo(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  endSeconds: number,
  options?: {
    maxSizeMb?: number;
    durationSeconds?: number;
    audioKbps?: number;
    resolution?: '720p' | '1080p' | 'original' | '540p' | '360p';
    aspect?: VideoAspect;
    normalizeAudio?: boolean;
    fastMode?: VideoFastMode;
  }
): Promise<CutResult> {
  const duration = endSeconds - startSeconds;
  if (duration <= 0) {
    return { success: false, error: 'Invalid time range' };
  }

  const maxSizeMb = options?.maxSizeMb;
  const maxBytes = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) * 1024 * 1024 : null;
  const durationSeconds = options?.durationSeconds ?? duration;
  const scale = resolutionScaleFilter(options?.resolution);
  const pad = aspectPadFilter(options?.aspect);
  const normalizeAudio = !!options?.normalizeAudio;
  const filter = videoFilterChain([scale, pad]);
  const fastMode = options?.fastMode ?? 'reencode';

  console.log(`[VideoProcessor] Cutting video: ${startSeconds}s - ${endSeconds}s`);

  const canStreamCopy = !maxBytes && !filter && !normalizeAudio;
  const tryCopy = canStreamCopy && (fastMode === 'copy' || fastMode === 'auto');

  const attempts = maxBytes ? 3 : 1;
  let lastErr = '';
  let videoKbpsHint: number | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }

    if (tryCopy) {
      const copyArgs = [
        '-y',
        '-ss', startSeconds.toString(),
        '-to', endSeconds.toString(),
        '-i', inputPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ];

      const copy = await runFfmpeg(copyArgs);
      if (copy.code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          return { success: true, outputPath, duration };
        }
      }

      // If copy is forced, fail early.
      if (fastMode === 'copy') {
        lastErr = `FFmpeg stream-copy failed: ${copy.stderr.slice(-500)}`;
        return { success: false, error: lastErr };
      }
      // Otherwise fall through to re-encode path (auto mode).
    }

    const encoding = maxBytes
      ? getEncodingOptionsForMaxSize({
          durationSeconds,
          maxSizeMb: Math.floor(maxSizeMb!),
          audioKbps: options?.audioKbps,
        })
      : null;

    if (encoding) {
      videoKbpsHint = encoding.videoKbps;
    }

    const args = [
      '-y',
      '-ss', startSeconds.toString(),
      '-i', inputPath,
      '-t', duration.toString(),
      ...(filter ? ['-vf', filter] : []),
      ...(encoding ? encoding.args : getEncodingOptions()),
      ...(normalizeAudio ? ['-af', loudnormFilter()] : []),
      '-movflags', '+faststart',
      outputPath,
    ];

    const { code, stderr } = await runFfmpeg(args);
    if (code !== 0 || !fs.existsSync(outputPath)) {
      lastErr = `FFmpeg exited with code ${code}: ${stderr.slice(-500)}`;
      continue;
    }

    const stats = fs.statSync(outputPath);
    if (stats.size <= 0) {
      lastErr = 'Output file is empty';
      continue;
    }

    if (maxBytes && stats.size > maxBytes) {
      // Retry with lower bitrate.
      const ratio = maxBytes / stats.size;
      const nextVideoKbps = videoKbpsHint ? Math.floor(videoKbpsHint * ratio * 0.9) : null;
      if (nextVideoKbps && nextVideoKbps >= 180) {
        // Bias the next run by shrinking the maxSize slightly (equivalent to lowering bitrate).
        options = { ...(options || {}), maxSizeMb: Math.max(1, Math.floor((maxSizeMb as number) * ratio * 0.9)) };
      }
      lastErr = `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${Math.floor(maxSizeMb!)}MB)`;
      continue;
    }

    return { success: true, outputPath, duration };
  }

  return { success: false, error: lastErr || 'FFmpeg failed' };
}

/**
 * Cut multiple segments from a video
 */
export async function cutMultipleSegments(
  inputPath: string,
  outputDir: string,
  segments: CutSegment[],
  options?: {
    maxSizeMb?: number;
    audioKbps?: number;
    resolution?: '720p' | '1080p' | 'original' | '540p' | '360p';
    aspect?: VideoAspect;
    normalizeAudio?: boolean;
    fastMode?: VideoFastMode;
  }
): Promise<{ success: boolean; files: string[]; errors: string[] }> {
  const results: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputFileName = `clip_${i + 1}_${uuidv4().slice(0, 8)}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);

    const durationSeconds = Math.max(0, Number(segment.end) - Number(segment.start));
    const result = await cutVideo(inputPath, outputPath, segment.start, segment.end, {
      maxSizeMb: options?.maxSizeMb,
      durationSeconds,
      audioKbps: options?.audioKbps,
      resolution: options?.resolution,
      aspect: options?.aspect,
      normalizeAudio: options?.normalizeAudio,
      fastMode: options?.fastMode,
    });

    if (result.success && result.outputPath) {
      results.push(result.outputPath);
    } else {
      errors.push(`Segment ${i + 1}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    files: results,
    errors
  };
}

/**
 * Merge multiple videos into one
 */
export async function mergeVideos(
  inputPaths: string[],
  outputPath: string,
  options?: {
    maxSizeMb?: number;
    durationSeconds?: number;
    audioKbps?: number;
    resolution?: '720p' | '1080p' | 'original' | '540p' | '360p';
    aspect?: VideoAspect;
    normalizeAudio?: boolean;
    fastMode?: VideoFastMode;
  }
): Promise<CutResult> {
  if (inputPaths.length === 0) {
    return { success: false, error: 'No input files provided' };
  }

  if (inputPaths.length === 1) {
    try {
      fs.copyFileSync(inputPaths[0], outputPath);
      return { success: true, outputPath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // Create concat file list
  const concatListPath = outputPath + '.txt';
  // Paths are generated by our session/job storage and are expected to contain no whitespace.
  // Avoid quoting/escaping pitfalls of the concat demuxer by writing plain paths.
  const concatContent = inputPaths.map((p) => `file ${p.replace(/\r?\n/g, '')}`).join('\n');
  fs.writeFileSync(concatListPath, concatContent);

  const durationSeconds = options?.durationSeconds;
  const maxSizeMb = options?.maxSizeMb;
  const maxBytes = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) * 1024 * 1024 : null;
  const scale = resolutionScaleFilter(options?.resolution);
  const pad = aspectPadFilter(options?.aspect);
  const normalizeAudio = !!options?.normalizeAudio;
  const filter = videoFilterChain([scale, pad]);
  const fastMode = options?.fastMode ?? 'reencode';

  console.log(`[VideoProcessor] Merging ${inputPaths.length} videos`);

  const canStreamCopy = !maxBytes && !durationSeconds && !filter && !normalizeAudio;
  const tryCopy = canStreamCopy && (fastMode === 'copy' || fastMode === 'auto');

  let lastErr = '';
  let limitMb = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) : null;
  const attempts = maxBytes && durationSeconds ? 3 : 1;

  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch {}
      }

      if (tryCopy) {
        const copyArgs = [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-c', 'copy',
          '-movflags', '+faststart',
          outputPath,
        ];
        const copy = await runFfmpeg(copyArgs);
        if (copy.code === 0 && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            return { success: true, outputPath };
          }
        }
        if (fastMode === 'copy') {
          lastErr = `FFmpeg stream-copy failed: ${copy.stderr.slice(-500)}`;
          return { success: false, error: lastErr };
        }
        // Auto mode falls back to re-encode
      }

      const encoding = (maxBytes && durationSeconds && limitMb)
        ? getEncodingOptionsForMaxSize({
            durationSeconds,
            maxSizeMb: limitMb,
            audioKbps: options?.audioKbps,
          })
        : null;

      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        ...(filter ? ['-vf', filter] : []),
        ...(encoding ? encoding.args : getEncodingOptions()),
        ...(normalizeAudio ? ['-af', loudnormFilter()] : []),
        '-movflags', '+faststart',
        outputPath,
      ];

      const { code, stderr } = await runFfmpeg(args);
      if (code !== 0 || !fs.existsSync(outputPath)) {
        lastErr = `FFmpeg exited with code ${code}: ${stderr.slice(-500)}`;
        continue;
      }

      const stats = fs.statSync(outputPath);
      if (stats.size <= 0) {
        lastErr = 'Output file is empty';
        continue;
      }

      if (maxBytes && durationSeconds && stats.size > maxBytes && attempt < attempts - 1) {
        const ratio = maxBytes / stats.size;
        const nextLimit = Math.max(1, Math.floor((limitMb ?? Math.floor(maxSizeMb!)) * ratio * 0.9));
        lastErr = `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${limitMb ?? Math.floor(maxSizeMb!)}MB)`;
        limitMb = nextLimit;
        continue;
      }

      if (maxBytes && stats.size > maxBytes) {
        return { success: false, error: `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${Math.floor(maxSizeMb!)}MB)` };
      }

      return { success: true, outputPath };
    }

    return { success: false, error: lastErr || 'FFmpeg failed' };
  } finally {
    try { fs.unlinkSync(concatListPath); } catch {}
  }
}

/**
 * Get video duration in seconds
 */
export async function getVideoDuration(inputPath: string): Promise<number> {
  try {
    const { code, stdout } = await runFfprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);
    if (code !== 0) return 0;
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) ? duration : 0;
  } catch {
    return 0;
  }
}

/**
 * Get video metadata
 */
export async function getVideoMetadata(inputPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
} | null> {
  try {
    const { code, stdout } = await runFfprobe([
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,codec_name',
      '-show_entries', 'format=duration',
      '-of', 'json',
      inputPath,
    ]);
    if (code !== 0) return null;
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];
    const format = data.format;

    if (!stream) return null;

    // Parse frame rate (can be "30/1" or "29.97")
    let fps = 30;
    if (stream.r_frame_rate) {
      const parts = String(stream.r_frame_rate).split('/');
      if (parts.length === 2) {
        const a = Number(parts[0]);
        const b = Number(parts[1]);
        if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
          fps = a / b;
        }
      } else {
        const parsed = Number(stream.r_frame_rate);
        if (Number.isFinite(parsed)) fps = parsed;
      }
    }

    return {
      duration: parseFloat(format?.duration || '0'),
      width: stream.width || 0,
      height: stream.height || 0,
      fps: Math.round(fps * 100) / 100,
      codec: stream.codec_name || 'unknown'
    };
  } catch {
    return null;
  }
}

/**
 * Combine video and audio tracks into one file
 * Replaces original audio with the provided audio track
 */
/**
 * Extract a single frame from video as an image (Freeze Frame / Standbild)
 */
export async function extractFreezeFrame(
  inputPath: string,
  outputPath: string,
  timeSeconds: number,
  format: 'jpg' | 'png' = 'jpg'
): Promise<CutResult> {
  return new Promise((resolve) => {
    const args = [
      '-y',
      '-ss', timeSeconds.toString(),
      '-i', inputPath,
      '-vframes', '1',
      '-q:v', '2',  // High quality for JPEG
      outputPath
    ];

    console.log(`[VideoProcessor] Extracting freeze frame at ${timeSeconds}s (${format})`);

    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          resolve({
            success: true,
            outputPath
          });
        } else {
          resolve({ success: false, error: 'Output file is empty' });
        }
      } else {
        resolve({ success: false, error: `FFmpeg exited with code ${code}: ${stderr.slice(-500)}` });
      }
    });

    ffmpeg.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Combine video and audio tracks into one file
 * Replaces original audio with the provided audio track
 */
export async function combineVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  options?: {
    videoTrimStart?: number;
    videoTrimEnd?: number;
    audioTrimStart?: number;
    audioTrimEnd?: number;
    audioVolume?: number;  // 0.0 to 2.0, default 1.0
    maxSizeMb?: number;
    durationSeconds?: number;
    audioKbps?: number;
    resolution?: '720p' | '1080p' | 'original' | '540p' | '360p';
    aspect?: VideoAspect;
    normalizeAudio?: boolean;
  }
): Promise<CutResult> {
  const volume = options?.audioVolume ?? 1.0;

  // Build FFmpeg filter complex for audio processing
  let filterComplex = '';
  let audioInput = '1:a';

  // Trim audio if needed
  if (options?.audioTrimStart !== undefined || options?.audioTrimEnd !== undefined) {
    const trimStart = options?.audioTrimStart ?? 0;
    const trimEnd = options?.audioTrimEnd;
    if (trimEnd !== undefined) {
      filterComplex += `[1:a]atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS`;
    } else {
      filterComplex += `[1:a]atrim=start=${trimStart},asetpts=PTS-STARTPTS`;
    }
    audioInput = 'trimmed';
    filterComplex += `[trimmed];`;
  }

  // Apply volume (+ optional loudness normalization)
  const outAudioLabel = options?.normalizeAudio ? 'outa_pre' : 'outa';
  filterComplex += `[${audioInput}]volume=${volume}[${outAudioLabel}]`;
  if (options?.normalizeAudio) {
    filterComplex += `;[${outAudioLabel}]${loudnormFilter()}[outa]`;
  }

  const maxSizeMb = options?.maxSizeMb;
  const durationSeconds = options?.durationSeconds;
  const maxBytes = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) * 1024 * 1024 : null;

  let lastErr = '';
  let limitMb = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) : null;
  const attempts = maxBytes && durationSeconds ? 3 : 1;

  console.log(`[VideoProcessor] Combining video + audio, volume: ${volume}`);

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }

    // Build FFmpeg arguments
    const args = ['-y'];

    // Input video with optional trim
    if (options?.videoTrimStart !== undefined) {
      args.push('-ss', options.videoTrimStart.toString());
    }
    args.push('-i', videoPath);

    // Limit video duration if trimEnd specified
    if (options?.videoTrimEnd !== undefined && options?.videoTrimStart !== undefined) {
      const dur = options.videoTrimEnd - options.videoTrimStart;
      args.push('-t', dur.toString());
    }

    // Input audio
    args.push('-i', audioPath);

    // Filter complex for audio processing
    args.push('-filter_complex', filterComplex);

    // Map video from first input, processed audio
    args.push('-map', '0:v:0');
    args.push('-map', '[outa]');

    const scale = resolutionScaleFilter(options?.resolution);
    const pad = aspectPadFilter(options?.aspect);
    const filter = videoFilterChain([scale, pad]);

    // Encoding options:
    // - default: copy video, encode audio
    // - size-constrained: re-encode video+audio to hit the target size
    if (maxBytes && durationSeconds && limitMb) {
      const enc = getEncodingOptionsForMaxSize({
        durationSeconds,
        maxSizeMb: limitMb,
        audioKbps: options?.audioKbps,
      });
      if (filter) args.push('-vf', filter);
      args.push(...enc.args);
    } else {
      // If we need any video filter, we cannot stream-copy video.
      if (filter) {
        args.push('-vf', filter);
        args.push(...getEncodingOptions());
      } else {
      args.push('-c:v', 'copy');
      args.push('-c:a', 'aac');
      args.push('-b:a', `${clampInt(options?.audioKbps ?? 192, 64, 256)}k`);
      }
    }

    // Use shortest stream to determine output duration
    args.push('-shortest');

    // Fast start for web playback
    args.push('-movflags', '+faststart');
    args.push(outputPath);

    const { code, stderr } = await runFfmpeg(args);
    if (code !== 0 || !fs.existsSync(outputPath)) {
      lastErr = `FFmpeg exited with code ${code}: ${stderr.slice(-500)}`;
      continue;
    }

    const stats = fs.statSync(outputPath);
    if (stats.size <= 0) {
      lastErr = 'Output file is empty';
      continue;
    }

    if (maxBytes && durationSeconds && stats.size > maxBytes && attempt < attempts - 1) {
      const ratio = maxBytes / stats.size;
      const nextLimit = Math.max(1, Math.floor((limitMb ?? Math.floor(maxSizeMb!)) * ratio * 0.9));
      lastErr = `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${limitMb ?? Math.floor(maxSizeMb!)}MB)`;
      limitMb = nextLimit;
      continue;
    }

    if (maxBytes && stats.size > maxBytes) {
      return { success: false, error: `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${Math.floor(maxSizeMb!)}MB)` };
    }

    return { success: true, outputPath };
  }

  return { success: false, error: lastErr || 'FFmpeg failed' };
}

/**
 * Timeline clip definition for rendering
 */
export interface TimelineClip {
  sourceFilePath: string;
  sourceStart: number;      // In-point in source (seconds)
  sourceEnd: number;        // Out-point in source (seconds)
  timelineStart: number;    // Position on timeline (seconds)
  type: 'video' | 'audio' | 'image';
  volume?: number;          // Audio volume (0-2, default 1)
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

export type VideoLayoutPreset =
  | 'full'
  | 'pip_tr'
  | 'pip_tl'
  | 'pip_br'
  | 'pip_bl'
  | 'lower_third'
  | 'center';

export interface VideoTrackLayout {
  preset?: VideoLayoutPreset;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  opacity?: number; // 0..1
}

export type AudioTrackRole = 'voice' | 'music' | 'sfx';

/**
 * Timeline track definition
 */
export interface TimelineTrack {
  type: 'video' | 'audio';
  clips: TimelineClip[];
  muted?: boolean;
  volume?: number;          // Track volume (0-2, default 1)
  layout?: VideoTrackLayout;
  role?: AudioTrackRole;
}

/**
 * Render timeline options
 */
export interface RenderTimelineOptions {
  tracks: TimelineTrack[];
  outputPath: string;
  resolution?: '720p' | '1080p' | 'original' | '540p' | '360p';
  format?: 'mp4' | 'webm';
  maxSizeMb?: number;
  durationSeconds?: number;
  audioKbps?: number;
  aspect?: VideoAspect;
  normalizeAudio?: boolean;
  cleanAudio?: boolean;
  transition?: { type: 'none' | 'fade' | 'crossfade'; durationSeconds?: number };
}

/**
 * Render a timeline with multiple tracks and clips into a single video
 *
 * This handles:
 * - Multiple video clips concatenated in sequence
 * - Audio track with volume control
 * - Image clips rendered as static frames
 */
export async function renderTimeline(options: RenderTimelineOptions): Promise<CutResult> {
  const { tracks, outputPath, resolution } = options;

  const clamp = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  };

  const clamp01 = (value: number): number => clamp(value, 0, 1);

  const roundEven = (value: number): number => {
    const v = Math.max(2, Math.round(value));
    return v % 2 === 0 ? v : v + 1;
  };

  const resolvePresetLayout = (preset: VideoLayoutPreset): Required<Pick<VideoTrackLayout, 'x' | 'y' | 'w' | 'h'>> => {
    const m = 0.04; // margin
    if (preset === 'full') return { x: 0, y: 0, w: 1, h: 1 };
    if (preset === 'center') return { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    if (preset === 'lower_third') return { x: 0.05, y: 0.62, w: 0.9, h: 0.33 };

    // Picture-in-picture presets.
    const pipW = 0.32;
    const pipH = 0.32;
    if (preset === 'pip_tr') return { x: 1 - pipW - m, y: m, w: pipW, h: pipH };
    if (preset === 'pip_tl') return { x: m, y: m, w: pipW, h: pipH };
    if (preset === 'pip_br') return { x: 1 - pipW - m, y: 1 - pipH - m, w: pipW, h: pipH };
    return { x: m, y: 1 - pipH - m, w: pipW, h: pipH }; // pip_bl
  };

  const resolveTrackLayout = (layout: VideoTrackLayout | undefined, isBaseTrack: boolean): Required<VideoTrackLayout> => {
    const preset = layout?.preset ?? (isBaseTrack ? 'full' : 'pip_tr');
    const box = resolvePresetLayout(preset);
    return {
      preset,
      x: clamp01(layout?.x ?? box.x),
      y: clamp01(layout?.y ?? box.y),
      w: clamp01(layout?.w ?? box.w),
      h: clamp01(layout?.h ?? box.h),
      opacity: clamp01(layout?.opacity ?? 1),
    };
  };

  const computeTimelineDuration = (): number => {
    let maxEnd = 0;
    for (const track of tracks) {
      if (!track?.clips || track.clips.length === 0) continue;
      for (const clip of track.clips) {
        const start = Number(clip?.timelineStart) || 0;
        const dur = Math.max(0, Number(clip?.sourceEnd) - Number(clip?.sourceStart));
        maxEnd = Math.max(maxEnd, start + dur);
      }
    }
    return maxEnd;
  };

  // Visible tracks (muted = disabled)
  const videoTracks = tracks.filter((t) => t.type === 'video' && !t.muted);
  const audioTracks = tracks.filter((t) => t.type === 'audio' && !t.muted);

  if (videoTracks.length === 0) {
    return { success: false, error: 'No video tracks to render' };
  }

  const firstVisualClip =
    videoTracks
      .flatMap((t) => t.clips)
      .find((c) => c.type === 'video' || c.type === 'image');

  if (!firstVisualClip) {
    return { success: false, error: 'No video clips to render' };
  }

  const durationSeconds = Math.max(0.01, options.durationSeconds ?? computeTimelineDuration());

  // Determine a base canvas size from the first visual clip (fallback to 1280x720).
  const baseMeta = await getVideoMetadata(firstVisualClip.sourceFilePath);
  const canvasW = roundEven(baseMeta?.width || 1280);
  const canvasH = roundEven(baseMeta?.height || 720);
  const fps = clamp(baseMeta?.fps || 30, 12, 60);

  const inputIndexByPath = new Map<string, number>();
  const inputArgs: string[] = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=${canvasW}x${canvasH}:r=${fps}:d=${durationSeconds}`
  ];

  const ensureInput = (filePath: string): number => {
    const existing = inputIndexByPath.get(filePath);
    if (existing !== undefined) return existing;
    const idx = 1 + inputIndexByPath.size; // 0 is the color source
    inputIndexByPath.set(filePath, idx);
    inputArgs.push('-i', filePath);
    return idx;
  };

  const audioPresenceCache = new Map<string, boolean>();
  const hasAudioStream = async (filePath: string): Promise<boolean> => {
    const cached = audioPresenceCache.get(filePath);
    if (cached !== undefined) return cached;
    const { code, stdout } = await runFfprobe([
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      filePath,
    ], 8000);
    const ok = code === 0 && stdout.trim().length > 0;
    audioPresenceCache.set(filePath, ok);
    return ok;
  };

  const transition = options.transition;
  const transitionType = transition?.type ?? 'none';
  const transitionDurationSeconds = clamp(Number(transition?.durationSeconds ?? 0.35), 0, 5);

  const baseVideoTrack = videoTracks.find((t) => (t.clips || []).some((c) => c.type === 'video' || c.type === 'image')) ?? videoTracks[0];

  const filterParts: string[] = [];
  filterParts.push('[0:v]format=rgba[base0]');
  let baseLabel = 'base0';

  const visualClipCount = videoTracks.reduce(
    (acc, track) => acc + track.clips.filter((c) => c.type === 'video' || c.type === 'image').length,
    0
  );

  let clipCounter = 0;

  for (const track of videoTracks) {
    const isBaseTrack = track === baseVideoTrack;
    const layout = resolveTrackLayout(track.layout, isBaseTrack);

    const clipsSorted = [...track.clips]
      .filter((c) => c.type === 'video' || c.type === 'image')
      .sort((a, b) => a.timelineStart - b.timelineStart);

    for (let i = 0; i < clipsSorted.length; i++) {
      const clip = clipsSorted[i];
      const clipDuration = Math.max(0, clip.sourceEnd - clip.sourceStart);
      if (clipDuration <= 0) continue;

      const inputIdx = ensureInput(clip.sourceFilePath);

      // Default fades for the base track when a global transition is selected.
      const isFirstBaseClip = isBaseTrack && i === 0;
      const isLastBaseClip = isBaseTrack && i === clipsSorted.length - 1;
      const defaultFade = transitionType !== 'none' && isBaseTrack ? transitionDurationSeconds : 0;

      const fadeInSeconds = clamp(
        Number(clip.fadeInSeconds ?? (isFirstBaseClip ? 0 : defaultFade)),
        0,
        clipDuration
      );
      const fadeOutSeconds = clamp(
        Number(clip.fadeOutSeconds ?? (isLastBaseClip ? 0 : defaultFade)),
        0,
        clipDuration
      );

      const safeFadeOutStart = Math.max(0, clipDuration - fadeOutSeconds);

      // Layout box in pixels.
      const boxW = roundEven(canvasW * (layout.w ?? 1));
      const boxH = roundEven(canvasH * (layout.h ?? 1));
      const xPx = Math.round(clamp(layout.x ?? 0, 0, 1) * canvasW);
      const yPx = Math.round(clamp(layout.y ?? 0, 0, 1) * canvasH);

      const padX = Math.max(0, Math.min(canvasW - boxW, xPx));
      const padY = Math.max(0, Math.min(canvasH - boxH, yPx));

      const vLabel = `v${clipCounter}`;

      const baseChain =
        clip.type === 'image'
          ? `loop=loop=-1:size=1:start=0,trim=duration=${clipDuration},setpts=PTS-STARTPTS`
          : `trim=start=${clip.sourceStart}:end=${clip.sourceEnd},setpts=PTS-STARTPTS`;

      // Scale into the layout box and pad with transparent background so overlay coordinates are stable.
      let chain = `${baseChain},format=rgba,scale=w=${boxW}:h=${boxH}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${boxW}:${boxH}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;

      // Fade by alpha so overlays fade to transparent (no black boxes).
      if (fadeInSeconds > 0) {
        chain += `,fade=t=in:st=0:d=${fadeInSeconds}:alpha=1`;
      }
      if (fadeOutSeconds > 0) {
        chain += `,fade=t=out:st=${safeFadeOutStart}:d=${fadeOutSeconds}:alpha=1`;
      }

      if (layout.opacity < 1) {
        chain += `,colorchannelmixer=aa=${layout.opacity}`;
      }

      // Place the clip on the global timeline.
      chain += `,setpts=PTS+${Math.max(0, clip.timelineStart)}/TB`;

      filterParts.push(`[${inputIdx}:v]${chain}[${vLabel}]`);
      filterParts.push(`[${baseLabel}][${vLabel}]overlay=x=${padX}:y=${padY}:eof_action=pass:shortest=0[base${clipCounter + 1}]`);
      baseLabel = `base${clipCounter + 1}`;
      clipCounter++;
    }
  }

  if (clipCounter === 0) {
    return { success: false, error: 'No video clips to render' };
  }

  // Final video output label (+ optional scale/pad for export constraints).
  let videoOutLabel = baseLabel;
  const scale = resolutionScaleFilter(resolution);
  if (scale) {
    filterParts.push(`[${videoOutLabel}]${scale}[outv_scaled]`);
    videoOutLabel = 'outv_scaled';
  }
  const pad = aspectPadFilter(options.aspect);
  if (pad) {
    filterParts.push(`[${videoOutLabel}]${pad}[outv_padded]`);
    videoOutLabel = 'outv_padded';
  }

  // Audio: collect sources from audio tracks and from video clips (if the source file has audio).
  const audioParts: string[] = [];
  const audioLabels: string[] = [];

  const shouldNormalizeAudio = !!options.normalizeAudio;
  const shouldCleanAudio = !!options.cleanAudio;

  const addAudioSource = async (params: {
    inputIdx: number;
    clip: TimelineClip;
    gain: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
  }) => {
    const { inputIdx, clip, gain } = params;
    const clipDuration = Math.max(0, clip.sourceEnd - clip.sourceStart);
    if (clipDuration <= 0) return;

    const fadeInSeconds = clamp(Number(params.fadeInSeconds || 0), 0, clipDuration);
    const fadeOutSeconds = clamp(Number(params.fadeOutSeconds || 0), 0, clipDuration);
    const fadeOutStart = Math.max(0, clipDuration - fadeOutSeconds);

    const delayMs = Math.max(0, Math.round((Number(clip.timelineStart) || 0) * 1000));
    const label = `a${audioLabels.length}`;

    let chain = `atrim=start=${clip.sourceStart}:end=${clip.sourceEnd},asetpts=PTS-STARTPTS`;
    if (fadeInSeconds > 0) {
      chain += `,afade=t=in:st=0:d=${fadeInSeconds}`;
    }
    if (fadeOutSeconds > 0) {
      chain += `,afade=t=out:st=${fadeOutStart}:d=${fadeOutSeconds}`;
    }
    chain += `,volume=${gain}`;
    if (delayMs > 0) {
      chain += `,adelay=${delayMs}:all=1`;
    }
    chain += ',aresample=48000';

    audioParts.push(`[${inputIdx}:a]${chain}[${label}]`);
    audioLabels.push(`[${label}]`);
  };

  // Global silence base to keep audio length aligned with video.
  const hasAnyAudioCandidate =
    audioTracks.some((t) => (t.clips || []).length > 0) ||
    videoTracks.some((t) => (t.clips || []).some((c) => c.type === 'video'));

  if (hasAnyAudioCandidate) {
    audioParts.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${durationSeconds}[silence]`);
    audioLabels.push('[silence]');
  }

  // Separate audio tracks
  for (const track of audioTracks) {
    const trackVolume = clamp(Number(track.volume ?? 1), 0, 2);
    for (const clip of track.clips) {
      if (clip.type !== 'audio' && clip.type !== 'video') continue;
      const inputIdx = ensureInput(clip.sourceFilePath);
      const ok = await hasAudioStream(clip.sourceFilePath);
      if (!ok) continue;
      const gain = clamp(Number(clip.volume ?? 1), 0, 2) * trackVolume;
      await addAudioSource({
        inputIdx,
        clip,
        gain,
        fadeInSeconds: Number(clip.fadeInSeconds ?? 0),
        fadeOutSeconds: Number(clip.fadeOutSeconds ?? 0),
      });
    }
  }

  // Audio from video clips (source files with audio streams)
  for (const track of videoTracks) {
    const trackVolume = clamp(Number(track.volume ?? 1), 0, 2);
    const isBaseTrack = track === baseVideoTrack;
    const clipsSorted = [...track.clips]
      .filter((c) => c.type === 'video')
      .sort((a, b) => a.timelineStart - b.timelineStart);

    for (let i = 0; i < clipsSorted.length; i++) {
      const clip = clipsSorted[i];
      const ok = await hasAudioStream(clip.sourceFilePath);
      if (!ok) continue;

      const inputIdx = ensureInput(clip.sourceFilePath);

      const clipDuration = Math.max(0, clip.sourceEnd - clip.sourceStart);
      if (clipDuration <= 0) continue;

      const isFirstBaseClip = isBaseTrack && i === 0;
      const isLastBaseClip = isBaseTrack && i === clipsSorted.length - 1;
      const defaultFade = transitionType !== 'none' && isBaseTrack ? transitionDurationSeconds : 0;

      const fadeInSeconds = clamp(
        Number(clip.fadeInSeconds ?? (isFirstBaseClip ? 0 : defaultFade)),
        0,
        clipDuration
      );
      const fadeOutSeconds = clamp(
        Number(clip.fadeOutSeconds ?? (isLastBaseClip ? 0 : defaultFade)),
        0,
        clipDuration
      );

      const gain = clamp(Number(clip.volume ?? 1), 0, 2) * trackVolume;
      await addAudioSource({
        inputIdx,
        clip,
        gain,
        fadeInSeconds,
        fadeOutSeconds,
      });
    }
  }

  // Build filter_complex
  let filterComplex = filterParts.join(';');
  let audioOutLabel: string | null = null;

  // If we only have silence, skip audio entirely.
  const realAudioInputs = audioLabels.filter((l) => l !== '[silence]');
  if (realAudioInputs.length > 0) {
    filterComplex += ';' + audioParts.join(';');

    const mixLabel = 'mixedaudio';
    filterComplex += `;${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0[${mixLabel}]`;
    filterComplex += `;[${mixLabel}]atrim=duration=${durationSeconds}[outa0]`;
    audioOutLabel = 'outa0';

    // Optional: denoise for speech (pre loudnorm).
    // afftdn is fast and doesn't require external models.
    if (shouldCleanAudio) {
      filterComplex += `;[${audioOutLabel}]afftdn[outa_denoised]`;
      audioOutLabel = 'outa_denoised';
    }

    if (shouldNormalizeAudio) {
      filterComplex += `;[${audioOutLabel}]${loudnormFilter()}[outa_norm]`;
      audioOutLabel = 'outa_norm';
    }
  }

  // Final args: inputs + filter_complex, then map video and (optional) audio.
  const args: string[] = [...inputArgs];
  args.push('-filter_complex', filterComplex);
  args.push('-map', `[${videoOutLabel}]`);
  if (audioOutLabel) {
    args.push('-map', `[${audioOutLabel}]`);
  }

  // Encode with optional max-size constraint (with retries).
  const baseArgs = [...args];
  const maxSizeMb = options.maxSizeMb;
  const maxBytes = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) * 1024 * 1024 : null;
  let limitMb = maxSizeMb ? Math.max(1, Math.floor(maxSizeMb)) : null;
  const attempts = maxBytes && durationSeconds ? 3 : 1;

  console.log(`[VideoProcessor] Rendering timeline: ${clipCounter}/${visualClipCount} visual clips, audio tracks: ${audioTracks.length}, video tracks: ${videoTracks.length}`);

  let lastErr = '';
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }

    const attemptArgs = [...baseArgs];

    if (maxBytes && durationSeconds && limitMb) {
      const enc = getEncodingOptionsForMaxSize({
        durationSeconds,
        maxSizeMb: limitMb,
        audioKbps: options.audioKbps,
      });
      attemptArgs.push(...enc.args);
    } else {
      attemptArgs.push(...getEncodingOptions());
    }

    attemptArgs.push('-movflags', '+faststart');
    attemptArgs.push(outputPath);

    const { code, stderr } = await runFfmpeg(attemptArgs);
    if (code !== 0 || !fs.existsSync(outputPath)) {
      lastErr = `FFmpeg exited with code ${code}: ${stderr.slice(-500)}`;
      continue;
    }

    const stats = fs.statSync(outputPath);
    if (stats.size <= 0) {
      lastErr = 'Output file is empty';
      continue;
    }

    if (maxBytes && durationSeconds && stats.size > maxBytes && attempt < attempts - 1) {
      const ratio = maxBytes / stats.size;
      const nextLimit = Math.max(1, Math.floor((limitMb ?? Math.floor(maxSizeMb!)) * ratio * 0.9));
      lastErr = `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${limitMb ?? Math.floor(maxSizeMb!)}MB)`;
      limitMb = nextLimit;
      continue;
    }

    if (maxBytes && stats.size > maxBytes) {
      return { success: false, error: `Output exceeds max size (${Math.round(stats.size / (1024 * 1024))}MB > ${Math.floor(maxSizeMb!)}MB)` };
    }

    return { success: true, outputPath };
  }

  return { success: false, error: lastErr || 'FFmpeg failed' };
}

async function detectSceneChangesViaShowinfo(inputPath: string, threshold = 0.35): Promise<number[]> {
  // Use the scene score detector and capture timestamps from showinfo.
  // This is "best effort": if it yields no timestamps, caller should fall back.
  const args = [
    '-v', 'info',
    '-i', inputPath,
    '-vf', `select='gt(scene,${threshold})',showinfo`,
    '-an',
    '-f', 'null',
    '-'
  ];

  const { code, stderr } = await runFfmpeg(args);
  if (code !== 0) return [];

  const times: number[] = [];
  const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const t = Number(m[1]);
    if (Number.isFinite(t)) times.push(t);
  }

  // Dedup near-equals.
  times.sort((a, b) => a - b);
  const deduped: number[] = [];
  const eps = 0.05;
  for (const t of times) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || Math.abs(t - last) > eps) deduped.push(t);
  }
  return deduped;
}

export async function syncScreenRecordingToAudio(
  videoPath: string,
  audioChunks: { path: string; durationSeconds: number }[],
  outputPath: string,
  options?: {
    sceneThreshold?: number;
    maxSizeMb?: number;
  }
): Promise<CutResult> {
  const threshold = Number.isFinite(Number(options?.sceneThreshold))
    ? Math.max(0.05, Math.min(0.95, Number(options?.sceneThreshold)))
    : 0.35;

  const videoDuration = await getVideoDuration(videoPath);
  const chunkCount = audioChunks.length;

  console.log(`[SmartSync] Detecting scenes (threshold=${threshold}) for ${chunkCount} chunks...`);

  let marks = await detectSceneChangesViaShowinfo(videoPath, threshold);
  marks = marks.filter((t) => t > 0.01 && t < Math.max(0, videoDuration - 0.01));

  // Build scene marks array including 0 and end.
  let sceneMarks: number[] = [0, ...marks, videoDuration];

  // If not enough scenes: fall back to linear partitioning of the video.
  if (sceneMarks.length < chunkCount + 1) {
    console.warn('[SmartSync] Not enough scene marks; falling back to linear partitioning.');
    sceneMarks = Array.from({ length: chunkCount + 1 }, (_, i) => (videoDuration * i) / chunkCount);
  }

  // Ensure we have at least chunkCount + 1 marks.
  if (sceneMarks.length > chunkCount + 1) {
    // Keep the first N+1 marks (best effort).
    sceneMarks = sceneMarks.slice(0, chunkCount + 1);
    sceneMarks[sceneMarks.length - 1] = videoDuration;
  }

  // Build FFmpeg command:
  // - Input 0: video
  // - Inputs 1..N: audio chunks
  const inputArgs: string[] = ['-i', videoPath];
  for (const ch of audioChunks) inputArgs.push('-i', ch.path);

  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  const targetFps = 30; // stable concat across mixed sources
  const eps = 0.01;

  for (let i = 0; i < chunkCount; i += 1) {
    const vStart = Math.max(0, sceneMarks[i]);
    const vEnd = Math.max(vStart + eps, Math.min(videoDuration, sceneMarks[i + 1] ?? videoDuration));
    const vDur = Math.max(0, vEnd - vStart);
    const aDur = Math.max(0, Number(audioChunks[i]?.durationSeconds) || 0);
    const segDur = Math.max(vDur, aDur, 0.05);
    const freezeDur = Math.max(0, segDur - vDur);

    const vLabel = `sv${i}`;
    const aLabel = `sa${i}`;

    let vChain = `[0:v]trim=start=${vStart}:end=${vEnd},setpts=PTS-STARTPTS`;
    if (freezeDur > 0.001) {
      vChain += `,tpad=stop_mode=clone:stop_duration=${freezeDur}`;
    }
    vChain += `,fps=${targetFps},setsar=1,format=yuv420p`;
    filterParts.push(`${vChain}[${vLabel}]`);

    // Audio input index is i+1. Pad/truncate to segDur to keep A/V aligned for concat.
    const audioInput = `[${i + 1}:a]`;
    let aChain = `${audioInput}atrim=start=0,asetpts=PTS-STARTPTS,aresample=48000`;
    // Ensure audio lasts at least segDur (silence pad), then trim exact.
    aChain += `,apad=pad_dur=${segDur + 0.2},atrim=duration=${segDur}`;
    filterParts.push(`${aChain}[${aLabel}]`);

    concatInputs.push(`[${vLabel}][${aLabel}]`);
  }

  filterParts.push(`${concatInputs.join('')}concat=n=${chunkCount}:v=1:a=1[outv][outa]`);

  const encoding = getEncodingOptions();
  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-map', '[outa]',
    ...encoding,
    '-movflags', '+faststart',
    outputPath,
  ];

  const { code, stderr } = await runFfmpeg(args);
  if (code !== 0 || !fs.existsSync(outputPath)) {
    return { success: false, error: `FFmpeg SmartSync failed: ${String(stderr || '').slice(-800)}` };
  }
  return { success: true, outputPath };
}

/**
 * Create a low-resolution proxy for preview playback
 */
export async function createProxyVideo(
  inputPath: string,
  outputPath: string
): Promise<CutResult> {
  return new Promise((resolve) => {
    const useGpu = checkNvencAvailable();
    const args: string[] = [
      '-y',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', 'scale=-2:360',
    ];

    if (useGpu) {
      args.push(
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-cq', '32',
        '-b:v', '0'
      );
    } else {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28'
      );
    }

    args.push(
      '-c:a', 'aac',
      '-b:a', '64k',
      '-movflags', '+faststart',
      outputPath
    );

    console.log('[VideoProcessor] Creating proxy video');

    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          resolve({ success: true, outputPath });
        } else {
          resolve({ success: false, error: 'Output file is empty' });
        }
      } else {
        resolve({ success: false, error: `FFmpeg exited with code ${code}: ${stderr.slice(-500)}` });
      }
    });

    ffmpeg.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
