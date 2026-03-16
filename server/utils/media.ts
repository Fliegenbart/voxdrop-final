import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export async function getMediaDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { timeout: 15000 }
    );

    const duration = Number.parseFloat(String(stdout || '').trim());
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return duration;
  } catch {
    return 0;
  }
}

async function runFfmpeg(args: string[], timeoutMs = 10 * 60_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, Math.max(1_000, timeoutMs));

    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stderr: err.message });
    });
  });
}

export type ExtractedAudio = {
  path: string;
  mimeType: 'audio/ogg' | 'audio/wav';
  filename: string;
};

export type AudioEnhanceLevel = 'off' | 'standard' | 'strong';

export type AudioChunk = {
  path: string;
  durationSeconds: number;
};

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getSpeechEnhancementFilter(level: AudioEnhanceLevel | undefined): string | null {
  if (!level || level === 'off') return null;
  if (level === 'strong') {
    return 'highpass=f=110,lowpass=f=7600,afftdn=nf=-32,acompressor=threshold=-22dB:ratio=3:attack=20:release=250,dynaudnorm=f=120:g=17';
  }
  return 'highpass=f=120,lowpass=f=7800,afftdn=nf=-24,dynaudnorm=f=150:g=13';
}

/**
 * Extract (or transcode) audio for Whisper:
 * - mono
 * - 16kHz sample rate
 * - preferably Opus-in-Ogg (small for upload), fallback to PCM WAV.
 */
export async function extractAudioForWhisper(params: {
  inputPath: string;
  outputBasePath: string; // without extension
  enhanceAudio?: AudioEnhanceLevel;
}): Promise<ExtractedAudio> {
  const oggPath = `${params.outputBasePath}.ogg`;
  const wavPath = `${params.outputBasePath}.wav`;
  const speechFilter = getSpeechEnhancementFilter(params.enhanceAudio);

  // 1) Try Opus OGG (best for upload size).
  {
    const { code } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', params.inputPath,
      '-vn',
      // Ensure we pick the first audio stream if available.
      '-map', 'a:0?',
      '-ac', '1',
      '-ar', '16000',
      ...(speechFilter ? ['-af', speechFilter] : []),
      '-c:a', 'libopus',
      '-b:a', '24k',
      '-application', 'voip',
      oggPath,
    ]);

    if (code === 0) {
      return { path: oggPath, mimeType: 'audio/ogg', filename: 'audio.ogg' };
    }
    // Opus failed (e.g. no audio stream). We'll retry with WAV.
  }

  // 2) WAV fallback (larger, but should always work).
  {
    const { code, stderr } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', params.inputPath,
      '-vn',
      '-map', 'a:0?',
      '-ac', '1',
      '-ar', '16000',
      ...(speechFilter ? ['-af', speechFilter] : []),
      '-c:a', 'pcm_s16le',
      wavPath,
    ]);

    if (code === 0) {
      return { path: wavPath, mimeType: 'audio/wav', filename: 'audio.wav' };
    }

    throw new Error(`Audio-Extraktion fehlgeschlagen (ffmpeg). ${String(stderr || '').slice(0, 2000)}`);
  }
}

/**
 * Split already-extracted/normalized audio into chunk files for Whisper.
 *
 * We re-encode to Opus-in-Ogg to keep upload size small and chunk boundaries reliable.
 */
export async function splitAudioForWhisper(params: {
  inputPath: string;
  outputDir: string;
  chunkSeconds: number;
  bitrate?: string; // e.g. "24k"
}): Promise<AudioChunk[]> {
  const chunkSeconds = Math.max(30, Math.floor(params.chunkSeconds));
  const bitrate = params.bitrate || '24k';
  ensureDir(params.outputDir);

  const outputPattern = path.join(params.outputDir, 'chunk_%03d.ogg');
  const { code, stderr } = await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', params.inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libopus',
    '-b:a', bitrate,
    '-application', 'voip',
    '-f', 'segment',
    '-segment_time', String(chunkSeconds),
    '-reset_timestamps', '1',
    outputPattern,
  ], 20 * 60_000);

  if (code !== 0) {
    throw new Error(`Audio-Splitting fehlgeschlagen (ffmpeg). ${String(stderr || '').slice(0, 2000)}`);
  }

  const chunkFiles = fs
    .readdirSync(params.outputDir)
    .filter((f) => /^chunk_\d+\.ogg$/.test(f))
    .sort()
    .map((f) => path.join(params.outputDir, f));

  if (chunkFiles.length === 0) {
    throw new Error('Audio-Splitting fehlgeschlagen: keine Chunks erzeugt.');
  }

  const chunks: AudioChunk[] = [];
  for (const filePath of chunkFiles) {
    const durationSeconds = await getMediaDurationSeconds(filePath);
    chunks.push({ path: filePath, durationSeconds });
  }

  return chunks;
}

export type ExtractedAudioForOpenAI = {
  path: string;
  mimeType: 'audio/mpeg';
  filename: string;
};

/**
 * Extract/transcode audio for OpenAI Whisper API:
 * - mp3 (supported by the API)
 * - mono
 * - 16kHz sample rate
 * - low bitrate to stay under the 25MB upload limit
 */
export async function extractAudioForOpenAI(params: {
  inputPath: string;
  outputPath: string; // should end with .mp3
  bitrate?: string; // e.g. "64k"
  enhanceAudio?: AudioEnhanceLevel;
}): Promise<ExtractedAudioForOpenAI> {
  const bitrate = params.bitrate || '64k';
  const speechFilter = getSpeechEnhancementFilter(params.enhanceAudio);
  const { code, stderr } = await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', params.inputPath,
    '-vn',
    '-map', 'a:0?',
    '-ac', '1',
    '-ar', '16000',
    ...(speechFilter ? ['-af', speechFilter] : []),
    '-c:a', 'libmp3lame',
    '-b:a', bitrate,
    params.outputPath,
  ]);

  if (code !== 0) {
    throw new Error(`Audio-Extraktion (OpenAI) fehlgeschlagen (ffmpeg). ${String(stderr || '').slice(0, 2000)}`);
  }

  return {
    path: params.outputPath,
    mimeType: 'audio/mpeg',
    filename: path.basename(params.outputPath),
  };
}

/**
 * Split audio into mp3 chunks for OpenAI Whisper API (25MB per request).
 */
export async function splitAudioForOpenAI(params: {
  inputPath: string;
  outputDir: string;
  chunkSeconds: number;
  bitrate?: string; // e.g. "64k"
}): Promise<AudioChunk[]> {
  const chunkSeconds = Math.max(30, Math.floor(params.chunkSeconds));
  const bitrate = params.bitrate || '64k';
  ensureDir(params.outputDir);

  const outputPattern = path.join(params.outputDir, 'chunk_%03d.mp3');
  const { code, stderr } = await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', params.inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libmp3lame',
    '-b:a', bitrate,
    '-f', 'segment',
    '-segment_time', String(chunkSeconds),
    '-reset_timestamps', '1',
    outputPattern,
  ], 20 * 60_000);

  if (code !== 0) {
    throw new Error(`Audio-Splitting (OpenAI) fehlgeschlagen (ffmpeg). ${String(stderr || '').slice(0, 2000)}`);
  }

  const chunkFiles = fs
    .readdirSync(params.outputDir)
    .filter((f) => /^chunk_\d+\.mp3$/.test(f))
    .sort()
    .map((f) => path.join(params.outputDir, f));

  if (chunkFiles.length === 0) {
    throw new Error('Audio-Splitting (OpenAI) fehlgeschlagen: keine Chunks erzeugt.');
  }

  const chunks: AudioChunk[] = [];
  for (const filePath of chunkFiles) {
    const durationSeconds = await getMediaDurationSeconds(filePath);
    chunks.push({ path: filePath, durationSeconds });
  }

  return chunks;
}
