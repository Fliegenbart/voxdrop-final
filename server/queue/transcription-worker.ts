import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { sendTranscriptionCompleteEmail } from '../email/service';
import { finalizeCreditsForJob } from '../billing/job-credits';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';
import { inferJobErrorCode, isRetryableErrorCode, sanitizeErrorMessage } from './job-error-codes';
import { tieredRetryBackoff } from './retry-policy';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { getTmpDir, tmpPath } from '../utils/tmp';
import { preflightInputFile } from '../utils/job-inputs';
import {
  extractAudioForOpenAI,
  extractAudioForWhisper,
  getMediaDurationSeconds,
  splitAudioForOpenAI,
  splitAudioForWhisper,
  type AudioEnhanceLevel,
} from '../utils/media';

const queueConnection = redisConnection as any;

// Whisper service URL
const WHISPER_SERVICE_URL = process.env.WHISPER_SERVICE_URL || 'http://localhost:8000';

// OpenAI Whisper API (cloud) toggle
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOW_OPENAI_WHISPER = process.env.ALLOW_OPENAI_WHISPER === 'true';
const HARD_DISABLE_EXTERNAL_NETWORK = process.env.HARD_DISABLE_EXTERNAL_NETWORK === 'true';
const USE_OPENAI_WHISPER = !HARD_DISABLE_EXTERNAL_NETWORK && !!OPENAI_API_KEY && ALLOW_OPENAI_WHISPER;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function isTransientWhisperError(err: any): boolean {
  const msg = String(err?.message || err || '');
  // Whisper service indicates temporary unavailability via 503.
  if (msg.includes('Whisper service error: 503')) return true;
  // Whisper service may return "GPU busy" as 503.
  if (msg.toLowerCase().includes('gpu busy')) return true;
  // OpenAI transient errors: rate limiting / overload
  if (msg.includes(' 429 ') || msg.includes('429') || msg.toLowerCase().includes('rate limit')) return true;
  if (msg.toLowerCase().includes('overloaded')) return true;
  if (msg.toLowerCase().includes('timeout')) return true;
  // Network blips / restarts
  if (msg.toLowerCase().includes('econnrefused')) return true;
  if (msg.toLowerCase().includes('socket hang up')) return true;
  return false;
}

function attemptsLeft(bullJob: BullJob<any>): number {
  const maxAttempts = bullJob.opts?.attempts ?? 1;
  const made = bullJob.attemptsMade ?? 0;
  // After a failure, BullMQ increments attemptsMade. While in the catch block, we are still on the current attempt.
  const left = maxAttempts - (made + 1);
  return Math.max(0, left);
}

// Cleanup file helper
function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[TranscriptionWorker] Failed to cleanup ${filePath}:`, err);
  }
}

// Transcription job data interface
interface TranscriptionJobData {
  jobId: string;
  userId: number;
  inputFilePath: string;
  inputChecksum?: string;
  originalName: string;
  mimeType: string;
  notifyEmail?: string;
  mode?: 'fast' | 'quality' | 'balanced';
  cloudConsent?: boolean;
  enhanceAudio?: AudioEnhanceLevel;
  vocabularyPrompt?: string;
}

function shouldExtractAudio(mimeType: string, inputFilePath: string, fileSizeBytes: number): boolean {
  const mt = String(mimeType || '').toLowerCase();
  if (mt.startsWith('video/')) return true;

  // Large raw audio (e.g. WAV) benefits from re-encoding to Opus for upload.
  if (fileSizeBytes >= 25 * 1024 * 1024) return true;

  const ext = path.extname(inputFilePath).toLowerCase();
  if (['.mp4', '.webm', '.mov', '.mkv', '.mpeg', '.mpg', '.m4v'].includes(ext)) return true;
  return false;
}

type WhisperWord = { word: string; start: number; end: number };

function formatSrtTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSrt(words: WhisperWord[], maxWordsPerLine = 8): string {
  if (!Array.isArray(words) || words.length === 0) return '';

  const lines: string[] = [];
  let index = 1;
  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    const chunk = words.slice(i, i + maxWordsPerLine);
    if (chunk.length === 0) continue;
    const start = formatSrtTime(chunk[0].start);
    const end = formatSrtTime(chunk[chunk.length - 1].end);
    const text = chunk.map((w) => String(w.word || '').trim()).filter(Boolean).join(' ');
    if (!text) continue;
    lines.push(`${index}\n${start} --> ${end}\n${text}\n`);
    index += 1;
  }

  return lines.join('\n');
}

type OpenAISegment = { start: number; end: number; text: string };

function generateSrtFromSegments(segments: OpenAISegment[]): string {
  if (!Array.isArray(segments) || segments.length === 0) return '';

  const lines: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const start = formatSrtTime(seg.start);
    const end = formatSrtTime(seg.end);
    const text = String(seg.text || '').trim();
    if (!text) continue;
    lines.push(`${lines.length + 1}\n${start} --> ${end}\n${text}\n`);
  }

  return lines.join('\n');
}

function cleanupDir(dirPath: string) {
  try {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath)) {
      const p = path.join(dirPath, entry);
      try { fs.unlinkSync(p); } catch {}
    }
    try { fs.rmdirSync(dirPath); } catch {}
  } catch {}
}

function getAttemptNumber(bullJob: BullJob<any>): number {
  return Math.max(1, (bullJob.attemptsMade ?? 0) + 1);
}

// Process transcription
async function processTranscription(bullJob: BullJob<TranscriptionJobData>): Promise<string> {
  const { jobId, userId, inputFilePath, inputChecksum, originalName, mimeType, notifyEmail } = bullJob.data;
  const mode: 'fast' | 'quality' | 'balanced' = (bullJob.data.mode === 'fast' || bullJob.data.mode === 'balanced')
    ? bullJob.data.mode
    : 'quality';
  const enhanceAudio: AudioEnhanceLevel = bullJob.data.enhanceAudio === 'strong'
    ? 'strong'
    : bullJob.data.enhanceAudio === 'off'
      ? 'off'
      : bullJob.data.enhanceAudio === 'standard'
        ? 'standard'
        : 'off';
  const vocabularyPrompt = typeof bullJob.data.vocabularyPrompt === 'string'
    ? bullJob.data.vocabularyPrompt.trim().slice(0, 1800)
    : '';
  let gpuAllocation: Awaited<ReturnType<typeof acquireGpuSlot>> | null = null;
  const attempt = getAttemptNumber(bullJob);
  const attemptDir = path.join(getTmpDir(), 'jobs', jobId, `attempt-${attempt}`);
  try { fs.mkdirSync(attemptDir, { recursive: true }); } catch {}

  const MAX_OPENAI_BYTES = 25 * 1024 * 1024;
  let extractedPathToCleanup: string | null = null;
  let chunksDirToCleanup: string | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let currentPhase = 'uploading';
  let currentPercent = 10;

  // Update job status to active
  updateJob(jobId, {
    status: 'active',
    progressStage: 'uploading',
    phase: 'uploading',
    progressPercent: 10,
    retryCount: Math.max(0, bullJob.attemptsMade ?? 0),
    errorCode: null,
    lastHeartbeatAt: new Date(),
    startedAt: new Date(),
  });

  await publishJobEvent(jobId, userId, 'progress', {
    status: 'active',
    stage: 'uploading',
    percent: 10,
    retryCount: Math.max(0, bullJob.attemptsMade ?? 0),
  });

  try {
    heartbeatTimer = setInterval(() => {
      updateJob(jobId, {
        lastHeartbeatAt: new Date(),
        phase: currentPhase,
        progressStage: currentPhase,
        progressPercent: currentPercent,
      });
    }, 15_000);

    const preflight = preflightInputFile({ filePath: inputFilePath, expectedChecksum: inputChecksum });
    if (!preflight.exists || preflight.reason) {
      throw new Error(preflight.reason || 'input_missing');
    }

    const gpuWaitStartedAt = Date.now();
    gpuAllocation = await acquireGpuSlot('transcription', bullJob.id);
    updateJob(jobId, { gpuWaitMs: Date.now() - gpuWaitStartedAt });

    const fileSize = fs.statSync(inputFilePath).size;

    console.log(`[TranscriptionWorker] Processing: ${originalName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    if (USE_OPENAI_WHISPER && !bullJob.data.cloudConsent) {
      throw new Error('cloud_consent_required');
    }

    let mediaPath = inputFilePath;
    let mediaMimeType = mimeType || 'application/octet-stream';
    let mediaFilename = originalName || path.basename(inputFilePath);

    // For videos (and large audio), extract/normalize audio first. This reduces upload size a lot
    // and avoids Whisper dealing with huge video containers.
    // Optionally run speech-focused enhancement for screen recordings and noisy input.
    if (
      shouldExtractAudio(mimeType, inputFilePath, fileSize) ||
      (USE_OPENAI_WHISPER && fileSize > MAX_OPENAI_BYTES) ||
      enhanceAudio !== 'off'
    ) {
      currentPhase = 'extracting_audio';
      currentPercent = 20;
      updateJob(jobId, { progressStage: currentPhase, phase: currentPhase, progressPercent: currentPercent });
      await publishJobEvent(jobId, userId, 'progress', {
        stage: 'extracting_audio',
        percent: 20,
      });

      if (USE_OPENAI_WHISPER) {
        const outPath = path.join(attemptDir, 'audio_openai.mp3');
        const extracted = await extractAudioForOpenAI({
          inputPath: inputFilePath,
          outputPath: outPath,
          enhanceAudio,
        });
        mediaPath = extracted.path;
        mediaMimeType = extracted.mimeType;
        mediaFilename = extracted.filename;
        extractedPathToCleanup = extracted.path;

        const audioSize = fs.existsSync(mediaPath) ? fs.statSync(mediaPath).size : 0;
        console.log(
          `[TranscriptionWorker] Extracted audio for OpenAI: ${path.basename(mediaPath)} (${(audioSize / 1024 / 1024).toFixed(2)} MB)`
        );
      } else {
        const audioBase = path.join(attemptDir, 'audio_whisper');
        const extracted = await extractAudioForWhisper({
          inputPath: inputFilePath,
          outputBasePath: audioBase,
          enhanceAudio,
        });

        mediaPath = extracted.path;
        mediaMimeType = extracted.mimeType;
        mediaFilename = extracted.filename;
        extractedPathToCleanup = extracted.path;

        const audioSize = fs.existsSync(mediaPath) ? fs.statSync(mediaPath).size : 0;
        console.log(
          `[TranscriptionWorker] Extracted audio for Whisper: ${path.basename(mediaPath)} (${(audioSize / 1024 / 1024).toFixed(2)} MB)`
        );
      }
    }

    // Chunking for long recordings. This improves UX (progress + retries) and reduces GPU-lock starvation
    // because Whisper releases the lock between chunks.
    const totalDurationSeconds = await getMediaDurationSeconds(mediaPath);
    const chunkThresholdSeconds = Number(process.env.VOXDROP_TRANSCRIBE_CHUNK_THRESHOLD_SECONDS || 15 * 60);
    const chunkSeconds = Number(process.env.VOXDROP_TRANSCRIBE_CHUNK_SECONDS || 10 * 60);
    const shouldChunkByDuration = Number.isFinite(totalDurationSeconds)
      && totalDurationSeconds > 0
      && totalDurationSeconds >= Math.max(60, chunkThresholdSeconds)
      && chunkSeconds >= 60;

    // Update progress
    currentPhase = 'transcribing';
    currentPercent = 30;
    updateJob(jobId, { progressStage: currentPhase, phase: currentPhase, progressPercent: currentPercent });
    await publishJobEvent(jobId, userId, 'progress', {
      stage: 'transcribing',
      percent: 30,
    });

    let result: any;
    let mergedWords: WhisperWord[] | null = null;

    if (USE_OPENAI_WHISPER) {
      if (!openai) {
        throw new Error('openai_not_configured');
      }

      const mediaSize = fs.existsSync(mediaPath) ? fs.statSync(mediaPath).size : 0;
      const shouldChunkOpenAI = shouldChunkByDuration || mediaSize > MAX_OPENAI_BYTES;

      let mergedSegments: OpenAISegment[] = [];
      const textParts: string[] = [];
      let language = 'de';
      let totalDuration = 0;

      if (!shouldChunkOpenAI && mediaSize <= MAX_OPENAI_BYTES) {
        const fileBuffer = fs.readFileSync(mediaPath);
        const fileName = path.basename(mediaPath) || 'audio.mp3';
        const file = new File([fileBuffer], fileName, { type: mediaMimeType || 'audio/mpeg' });

        const transcription = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
          prompt: vocabularyPrompt || undefined,
        });

        const segments = Array.isArray((transcription as any)?.segments) ? (transcription as any).segments : [];
        mergedSegments = segments
          .map((s: any) => ({
            start: Number(s?.start) || 0,
            end: Number(s?.end) || 0,
            text: String(s?.text || ''),
          }))
          .filter((s: OpenAISegment) => Number.isFinite(s.start) && Number.isFinite(s.end));

        const text = String((transcription as any)?.text || '').trim();
        if (text) textParts.push(text);
        if (typeof (transcription as any)?.language === 'string' && (transcription as any).language) {
          language = (transcription as any).language;
        }
        const duration = Number((transcription as any)?.duration);
        totalDuration = Number.isFinite(duration) ? duration : (totalDurationSeconds || 0);
      } else {
        currentPhase = 'splitting_audio';
        currentPercent = 25;
        updateJob(jobId, { progressStage: currentPhase, phase: currentPhase, progressPercent: currentPercent });
        await publishJobEvent(jobId, userId, 'progress', {
          stage: 'splitting_audio',
          percent: 25,
        });

        const chunksDir = path.join(attemptDir, 'chunks_openai');
        chunksDirToCleanup = chunksDir;
        const chunks = await splitAudioForOpenAI({
          inputPath: mediaPath,
          outputDir: chunksDir,
          chunkSeconds,
        });

        console.log(`[TranscriptionWorker] OpenAI splitting enabled: ${chunks.length} chunk(s) @ ${chunkSeconds}s (mode=${mode})`);

        let offsetSeconds = 0;

        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i];
          const chunkName = path.basename(chunk.path) || `chunk_${i}.mp3`;

          const chunkProgress = 30 + Math.round((45 * i) / Math.max(1, chunks.length)); // 30..75
          currentPhase = 'transcribing';
          currentPercent = chunkProgress;
          updateJob(jobId, { progressStage: currentPhase, phase: currentPhase, progressPercent: currentPercent });
          await publishJobEvent(jobId, userId, 'progress', {
            stage: 'transcribing',
            percent: chunkProgress,
          });

          const fileBuffer = fs.readFileSync(chunk.path);
          const file = new File([fileBuffer], chunkName, { type: 'audio/mpeg' });

          const transcription = await openai.audio.transcriptions.create({
            file,
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'],
            prompt: vocabularyPrompt || undefined,
          });

          if (typeof (transcription as any)?.language === 'string' && (transcription as any).language) {
            language = (transcription as any).language;
          }

          const text = String((transcription as any)?.text || '').trim();
          if (text) textParts.push(text);

          const segments = Array.isArray((transcription as any)?.segments) ? (transcription as any).segments : [];
          for (const s of segments) {
            const start = Number(s?.start);
            const end = Number(s?.end);
            const text = String(s?.text || '');
            if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
            mergedSegments.push({
              start: Math.max(0, start + offsetSeconds),
              end: Math.max(0, end + offsetSeconds),
              text,
            });
          }

          const duration = Number((transcription as any)?.duration);
          const chunkDuration = Number.isFinite(duration) && duration > 0
            ? duration
            : (chunk.durationSeconds || 0);
          offsetSeconds += Math.max(0, chunkDuration);
          totalDuration = offsetSeconds;
        }

        // Clean up chunks (keep extracted audio and original input until success cleanup below)
        cleanupDir(chunksDir);
        chunksDirToCleanup = null;
      }

      const text = textParts.join('\n\n');
      const srt = mergedSegments.length > 0
        ? generateSrtFromSegments(mergedSegments)
        : (text
          ? `1\n00:00:00,000 --> ${formatSrtTime(totalDuration || totalDurationSeconds || 0)}\n${text}\n`
          : '');

      result = {
        text,
        language,
        duration: totalDuration || totalDurationSeconds || 0,
        words: [],
        segments: mergedSegments,
        srt,
        mode: 'openai',
        chunked: Boolean(shouldChunkOpenAI),
      };
    } else {
      const postToWhisper = async (filePath: string, filename: string, contentType: string) => {
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(filePath), {
          filename,
          contentType: contentType || 'application/octet-stream',
        });
        // Speed/quality mode is handled inside whisper-service by adjusting decoding params (beam size).
        formData.append('mode', mode);
        if (vocabularyPrompt) {
          formData.append('prompt', vocabularyPrompt);
        }

        const response = await axios.post(
          `${WHISPER_SERVICE_URL}/transcribe`,
          formData,
          {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 0,
            validateStatus: () => true,
          }
        );

        if (response.status < 200 || response.status >= 300) {
          const errorText = typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);
          throw new Error(`Whisper service error: ${response.status} - ${errorText.slice(0, 2000)}`);
        }
        return response.data;
      };

      if (!shouldChunkByDuration) {
        result = await postToWhisper(mediaPath, mediaFilename, mediaMimeType);
        result.mode = 'local';
      } else {
        currentPhase = 'splitting_audio';
        currentPercent = 25;
        updateJob(jobId, { progressStage: currentPhase, phase: currentPhase, progressPercent: currentPercent });
        await publishJobEvent(jobId, userId, 'progress', {
          stage: 'splitting_audio',
          percent: 25,
        });

        const chunksDir = path.join(attemptDir, 'chunks');
        chunksDirToCleanup = chunksDir;
        const chunks = await splitAudioForWhisper({
          inputPath: mediaPath,
          outputDir: chunksDir,
          chunkSeconds,
        });

        console.log(`[TranscriptionWorker] Splitting enabled: ${chunks.length} chunk(s) @ ${chunkSeconds}s (mode=${mode})`);

        mergedWords = [];
        const textParts: string[] = [];
        let offsetSeconds = 0;
        let language = 'de';
        let totalDuration = 0;

        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i];
          const chunkName = path.basename(chunk.path);

          const chunkProgress = 30 + Math.round((45 * i) / Math.max(1, chunks.length)); // 30..75
          currentPhase = 'transcribing';
          currentPercent = chunkProgress;
          updateJob(jobId, { progressStage: currentPhase, phase: currentPhase, progressPercent: currentPercent });
          await publishJobEvent(jobId, userId, 'progress', {
            stage: 'transcribing',
            percent: chunkProgress,
          });

          const chunkResult = await postToWhisper(chunk.path, chunkName, 'audio/ogg');
          if (typeof chunkResult?.language === 'string' && chunkResult.language) {
            language = chunkResult.language;
          }
          if (typeof chunkResult?.text === 'string' && chunkResult.text.trim()) {
            textParts.push(chunkResult.text.trim());
          }

          const words = Array.isArray(chunkResult?.words) ? chunkResult.words : [];
          for (const w of words) {
            const word = String(w?.word || '').trim();
            const start = Number(w?.start);
            const end = Number(w?.end);
            if (!word || !Number.isFinite(start) || !Number.isFinite(end)) continue;
            mergedWords.push({
              word,
              start: Math.max(0, start + offsetSeconds),
              end: Math.max(0, end + offsetSeconds),
            });
          }

          const chunkDuration = Number.isFinite(Number(chunkResult?.duration)) ? Number(chunkResult.duration) : (chunk.durationSeconds || 0);
          offsetSeconds += Math.max(0, chunkDuration);
          totalDuration = offsetSeconds;
        }

        // Build a single "result" object compatible with downstream logic.
        result = {
          text: textParts.join('\n\n'),
          language,
          duration: totalDuration,
          words: mergedWords,
          srt: generateSrt(mergedWords),
          mode: 'local',
          chunked: true,
          chunks: chunks.length,
        };

        // Clean up chunks (keep extracted audio and original input until success cleanup below)
        cleanupDir(chunksDir);
        chunksDirToCleanup = null;
      }
    }

    // Save result to file
    const resultPath = tmpPath(`transcription_${jobId}.json`);
    const outputMode = USE_OPENAI_WHISPER ? 'openai' : 'local';
    fs.writeFileSync(resultPath, JSON.stringify({
      text: result.text,
      srt: result.srt,
      duration: result.duration,
      language: result.language,
      words: Array.isArray(result.words) ? result.words : (mergedWords || []),
      mode: outputMode,
      transcribeMode: mode,
      enhanceAudio,
      vocabularyPromptApplied: Boolean(vocabularyPrompt),
      chunked: Boolean(result.chunked),
    }));

    // Update job as completed
    updateJob(jobId, {
      status: 'completed',
      progressStage: 'done',
      phase: 'done',
      progressPercent: 100,
      errorCode: null,
      lastHeartbeatAt: new Date(),
      resultFilePath: resultPath,
      resultData: {
        text: result.text,
        srt: result.srt,
        duration: result.duration,
        language: result.language,
        words: Array.isArray(result.words) ? result.words : (mergedWords || []),
        mode: outputMode,
        transcribeMode: mode,
        enhanceAudio,
        vocabularyPromptApplied: Boolean(vocabularyPrompt),
        chunked: Boolean(result.chunked),
      },
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'completed');

    await publishJobEvent(jobId, userId, 'completed', {
      status: 'completed',
      percent: 100,
      result: {
        text: result.text,
        srt: result.srt,
        duration: result.duration,
        language: result.language,
      },
    });

    console.log(`[TranscriptionWorker] Completed: ${jobId} - ${result.text.length} chars, ${result.language}`);

    // Send email notification if requested
    if (notifyEmail) {
      const emailResult = await sendTranscriptionCompleteEmail(
        notifyEmail,
        originalName,
        jobId,
        true, // success
        result.duration,
        result.language
      );
      if (emailResult.success) {
        console.log(`[TranscriptionWorker] Email notification sent for job ${jobId}`);
      } else {
        console.error(`[TranscriptionWorker] Failed to send email for job ${jobId}:`, emailResult.error);
      }
    }

    // Cleanup input file
    cleanupFile(inputFilePath);
    // Cleanup extracted audio if present
    if (extractedPathToCleanup && extractedPathToCleanup !== inputFilePath) cleanupFile(extractedPathToCleanup);

    return resultPath;
  } catch (error: any) {
    console.error(`[TranscriptionWorker] Failed: ${jobId}`, error);

    const left = attemptsLeft(bullJob);
    const msg = sanitizeErrorMessage(error, 'Transcription failed');
    const errorCode = inferJobErrorCode(msg);
    const retryable = isRetryableErrorCode(errorCode) || (isTransientWhisperError(error) && errorCode !== 'input_missing');

    if (retryable && left > 0) {
      const retriesDone = Math.max(1, (bullJob.attemptsMade ?? 0) + 1);
      updateJob(jobId, {
        status: 'pending',
        progressStage: 'retrying',
        phase: 'retrying',
        progressPercent: 20,
        retryCount: retriesDone,
        errorCode,
        lastHeartbeatAt: new Date(),
        errorMessage: `Transkription fehlgeschlagen, erneuter Versuch folgt (${left} retries verbleibend).`,
      });
      await publishJobEvent(jobId, userId, 'progress', {
        status: 'pending',
        stage: 'retrying',
        percent: 20,
        retryCount: retriesDone,
        errorCode,
        message: 'Temporarer Fehler. Job wird erneut versucht.',
      });
      // Do NOT cleanup inputFilePath here; the next attempt needs it.
      throw error;
    }

    // Final failure (or non-retryable): mark failed and cleanup.
    updateJob(jobId, {
      status: 'failed',
      phase: 'failed',
      errorMessage: msg,
      errorCode,
      retryCount: Math.max(0, (bullJob.attemptsMade ?? 0) + (left === 0 ? 1 : 0)),
      lastHeartbeatAt: new Date(),
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'failed');

    await publishJobEvent(jobId, userId, 'failed', {
      status: 'failed',
      error: msg,
      errorCode,
    });

    if (notifyEmail) {
      const emailResult = await sendTranscriptionCompleteEmail(
        notifyEmail,
        originalName,
        jobId,
        false
      );
      if (emailResult.success) {
        console.log(`[TranscriptionWorker] Failure notification sent for job ${jobId}`);
      } else {
        console.error(`[TranscriptionWorker] Failed to send failure email for job ${jobId}:`, emailResult.error);
      }
    }

    cleanupFile(inputFilePath);
    // Best-effort cleanup for extracted audio on failure (won't exist if we didn't extract).
    try {
      const audioBase = path.join(attemptDir, 'audio_whisper');
      cleanupFile(`${audioBase}.ogg`);
      cleanupFile(`${audioBase}.wav`);
      cleanupFile(path.join(attemptDir, 'audio_openai.mp3'));
      cleanupDir(path.join(attemptDir, 'chunks'));
      cleanupDir(path.join(attemptDir, 'chunks_openai'));
      if (chunksDirToCleanup) cleanupDir(chunksDirToCleanup);
      if (extractedPathToCleanup && extractedPathToCleanup !== inputFilePath) cleanupFile(extractedPathToCleanup);
    } catch {}
    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    releaseGpuSlot(gpuAllocation);
  }
}

// Create and start the worker
export function startTranscriptionWorker() {
  const worker = new Worker<TranscriptionJobData>(
    'transcription',
    processTranscription,
    {
      connection: queueConnection,
      concurrency: 1, // Process one transcription at a time (GPU constraint)
      settings: {
        backoffStrategy: tieredRetryBackoff,
      },
    }
  );

  worker.on('ready', () => {
    console.log('[TranscriptionWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[TranscriptionWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[TranscriptionWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[TranscriptionWorker] Worker error:', err);
  });

  return worker;
}

// Export for use in routes
export { processTranscription };
