import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { sendPodcastCompleteEmail } from '../email/service';
import { finalizeCreditsForJob } from '../billing/job-credits';
import fs from 'fs';
import { tmpPath } from '../utils/tmp';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';
import { inferJobErrorCode, isRetryableErrorCode, sanitizeErrorMessage, type JobErrorCode } from './job-error-codes';
import { tieredRetryBackoff } from './retry-policy';
import { preflightInputFile } from '../utils/job-inputs';

const queueConnection = redisConnection as any;

// Podcast service URL (uses Docker service name for container communication)
const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || 'http://podcast:8001';
// PDFUA service URL for fast structured summaries (podcast-pack)
const PDFUA_SERVICE_URL = process.env.PDFUA_SERVICE_URL || 'http://pdfua-service:8000';
const PODCAST_PHASE_V2_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.VOXDROP_PODCAST_PHASE_V2 ?? 'true').trim().toLowerCase(),
);

const PODCAST_POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.PODCAST_POLL_INTERVAL_MS || '1200', 10) || 1200,
);
const PODCAST_POLL_MAX_MINUTES = Math.max(5, parseInt(process.env.PODCAST_POLL_MAX_MINUTES || '90', 10) || 90);
const PODCAST_POLL_MAX_ATTEMPTS = Math.max(1, Math.ceil((PODCAST_POLL_MAX_MINUTES * 60 * 1000) / PODCAST_POLL_INTERVAL_MS));
const PODCAST_WORKER_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.PODCAST_WORKER_CONCURRENCY || '1', 10) || 1,
);

const PODCAST_PACK_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.PODCAST_PACK_ENABLED ?? 'true').trim().toLowerCase(),
);
const PODCAST_PACK_POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.PODCAST_PACK_POLL_INTERVAL_MS || '1500', 10) || 1500,
);
const PODCAST_PACK_POLL_MAX_MINUTES = Math.max(
  1,
  parseInt(process.env.PODCAST_PACK_POLL_MAX_MINUTES || '20', 10) || 20,
);
const PODCAST_PACK_POLL_MAX_ATTEMPTS = Math.max(
  1,
  Math.ceil((PODCAST_PACK_POLL_MAX_MINUTES * 60 * 1000) / PODCAST_PACK_POLL_INTERVAL_MS),
);
const PODCAST_POLL_JITTER_MS = 150;
const PODCAST_PACK_RETRY_ATTEMPTS = 2;
const PODCAST_PACK_RETRY_DELAY_MS = 3000;

type PodcastPhaseCode =
  | 'queued'
  | 'extracting'
  | 'analyzing'
  | 'generating'
  | 'synthesizing'
  | 'assembling'
  | 'retrying'
  | 'completed'
  | 'failed';

type PipelinePath = 'pack' | 'legacy';

interface PodcastTimings {
  packMs: number;
  scriptMs: number;
  ttsMs: number;
  totalMs: number;
}

interface PodcastWorkerObservability {
  statusRegressionBlockedTotal: number;
  podcastPollRequestsTotal: number;
  podcastPackFallbackCount: number;
  podcastJobsCompletedTotal: number;
}

const OBS: PodcastWorkerObservability = {
  statusRegressionBlockedTotal: 0,
  podcastPollRequestsTotal: 0,
  podcastPackFallbackCount: 0,
  podcastJobsCompletedTotal: 0,
};

const PHASE_RANK: Record<PodcastPhaseCode, number> = {
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

// Cleanup file helper
function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[PodcastWorker] Failed to cleanup ${filePath}:`, err);
  }
}

interface PodcastJobData {
  jobId: string;
  userId: number;
  inputFilePath: string;
  inputChecksum?: string;
  originalName: string;
  style: string;
  speakerStyle: string;
  ttsEngine?: string;
  ttsPreset?: string;
  pronunciationRules?: string;
  notifyEmail?: string;
}

function normalizeNotifyEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function attemptsLeft(bullJob: BullJob<any>): number {
  const maxAttempts = bullJob.opts?.attempts ?? 1;
  const made = bullJob.attemptsMade ?? 0;
  return Math.max(0, maxAttempts - (made + 1));
}

function getPhaseRank(code: PodcastPhaseCode): number {
  return PHASE_RANK[code] ?? PHASE_RANK.extracting;
}

function clampPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function withJitter(baseMs: number, jitterMs: number): number {
  const delta = Math.floor((Math.random() * 2 - 1) * Math.max(0, jitterMs));
  return Math.max(200, baseMs + delta);
}

async function sleepWithJitter(baseMs: number, jitterMs = PODCAST_POLL_JITTER_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, withJitter(baseMs, jitterMs)));
}

function mapPodcastServiceStatusToPhaseCode(raw: unknown): PodcastPhaseCode {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'extracting') return 'extracting';
  if (value === 'analyzing') return 'analyzing';
  if (value === 'generating') return 'generating';
  if (value === 'synthesizing') return 'synthesizing';
  if (value === 'assembling') return 'assembling';
  if (value === 'completed') return 'completed';
  if (value === 'failed') return 'failed';
  if (value === 'retrying') return 'retrying';
  if (value === 'queued' || value === 'pending') return 'queued';
  return 'generating';
}

function getDefaultPhaseMessage(code: PodcastPhaseCode): string {
  switch (code) {
    case 'queued':
      return 'In Warteschlange...';
    case 'extracting':
      return 'Folien werden extrahiert...';
    case 'analyzing':
      return 'Bilder werden analysiert...';
    case 'generating':
      return 'Podcast-Skript wird erstellt...';
    case 'synthesizing':
      return 'Audio wird generiert...';
    case 'assembling':
      return 'Podcast wird finalisiert...';
    case 'retrying':
      return 'Erneuter Versuch wird vorbereitet...';
    case 'completed':
      return 'Fertig';
    case 'failed':
      return 'Fehler';
    default:
      return 'Wird verarbeitet...';
  }
}

function isTransientPackError(code: JobErrorCode): boolean {
  return (
    code === 'gpu_slot_timeout' ||
    code === 'provider_timeout' ||
    code === 'provider_5xx' ||
    code === 'network_error' ||
    code === 'ffmpeg_oom'
  );
}

async function processPodcast(bullJob: BullJob<PodcastJobData>): Promise<string> {
  const {
    jobId,
    userId,
    inputFilePath,
    inputChecksum,
    originalName,
    style,
    speakerStyle,
    ttsEngine,
    ttsPreset,
    pronunciationRules,
    notifyEmail,
  } = bullJob.data;
  const notificationEmail = normalizeNotifyEmail(notifyEmail);
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let currentPhaseCode: PodcastPhaseCode = 'extracting';
  let currentPhaseMessage = 'Datei wird hochgeladen...';
  let currentPhaseRank = getPhaseRank(currentPhaseCode);
  let currentPercent = 5;
  let pollEpoch = 0;
  let localStatusRegressionBlocked = 0;
  let localPollRequests = 0;
  const jobStartedAtMs = Date.now();
  const timings: PodcastTimings = {
    packMs: 0,
    scriptMs: 0,
    ttsMs: 0,
    totalMs: 0,
  };
  let pipelinePath: PipelinePath = PODCAST_PACK_ENABLED ? 'pack' : 'legacy';
  let gpuAllocation: any = null;

  updateJob(jobId, {
    status: 'active',
    progressStage: currentPhaseMessage,
    phase: currentPhaseCode,
    progressPercent: 5,
    retryCount: Math.max(0, bullJob.attemptsMade ?? 0),
    errorCode: null,
    lastHeartbeatAt: new Date(),
    startedAt: new Date(),
  });

  await publishJobEvent(jobId, userId, 'progress', {
    status: 'active',
    stage: currentPhaseMessage,
    percent: 5,
    phaseCode: currentPhaseCode,
    phaseRank: currentPhaseRank,
    retryCount: Math.max(0, bullJob.attemptsMade ?? 0),
  });

  const axios = (await import('axios')).default;
  const FormData = (await import('form-data')).default;

  try {
    const applyProgressUpdate = async (params: {
      phaseCode: PodcastPhaseCode;
      phaseMessage?: string;
      percent: number;
      source: string;
      epoch?: number;
      force?: boolean;
    }): Promise<boolean> => {
      if (params.epoch !== undefined && params.epoch !== pollEpoch) {
        return false;
      }

      const incomingCode = params.phaseCode;
      const incomingRank = getPhaseRank(incomingCode);
      const nextMessage = String(params.phaseMessage || '').trim() || getDefaultPhaseMessage(incomingCode);
      const boundedPercent = incomingCode === 'completed'
        ? 100
        : clampPercent(params.percent, 0, 95);

      if (
        PODCAST_PHASE_V2_ENABLED &&
        !params.force &&
        incomingCode !== 'failed' &&
        incomingCode !== 'completed' &&
        incomingRank < currentPhaseRank
      ) {
        localStatusRegressionBlocked += 1;
        OBS.statusRegressionBlockedTotal += 1;
        console.warn(
          `[podcast_phase_transition] blocked_regression job=${jobId} source=${params.source} from=${currentPhaseCode}:${currentPhaseRank} to=${incomingCode}:${incomingRank}`,
        );
        return false;
      }

      const nextPercent = incomingCode === 'completed'
        ? 100
        : Math.max(currentPercent, boundedPercent);

      const phaseChanged = incomingCode !== currentPhaseCode || nextMessage !== currentPhaseMessage;
      const percentChanged = nextPercent !== currentPercent;
      if (!phaseChanged && !percentChanged) {
        return false;
      }

      const prevCode = currentPhaseCode;
      const prevRank = currentPhaseRank;

      currentPhaseCode = incomingCode;
      currentPhaseMessage = nextMessage;
      currentPhaseRank = incomingRank;
      currentPercent = nextPercent;

      if (phaseChanged) {
        console.info(
          `[podcast_phase_transition] job=${jobId} source=${params.source} from=${prevCode}:${prevRank} to=${currentPhaseCode}:${currentPhaseRank}`,
        );
      }

      updateJob(jobId, {
        phase: currentPhaseCode,
        progressStage: currentPhaseMessage,
        progressPercent: currentPercent,
      });

      await publishJobEvent(jobId, userId, 'progress', {
        status: 'active',
        stage: currentPhaseMessage,
        percent: currentPercent,
        phaseCode: currentPhaseCode,
        phaseRank: currentPhaseRank,
      });
      return true;
    };

    heartbeatTimer = setInterval(() => {
      updateJob(jobId, {
        lastHeartbeatAt: new Date(),
        phase: currentPhaseCode,
        progressStage: currentPhaseMessage,
        progressPercent: currentPercent,
      });
    }, 15_000);

    const preflight = preflightInputFile({ filePath: inputFilePath, expectedChecksum: inputChecksum });
    if (!preflight.exists || preflight.reason) {
      throw new Error(preflight.reason || 'input_missing');
    }

    const gpuWaitStartedAt = Date.now();
    gpuAllocation = await acquireGpuSlot('podcast', bullJob.id);
    updateJob(jobId, { gpuWaitMs: Date.now() - gpuWaitStartedAt });

    if (!fs.existsSync(inputFilePath)) {
      throw new Error(`Upload-Datei nicht gefunden (ENOENT): ${inputFilePath}. Bitte erneut hochladen.`);
    }

    // -------------------------------------------------------------
    // Fast path: PPTX -> pdfua-service podcast-pack -> podcast-service
    // Fallback: old behaviour (upload PPTX to podcast-service)
    // -------------------------------------------------------------

    let pack: any | null = null;
    let packJobId: string | null = null;
    const packStartedAtMs = Date.now();

    const pollPdfuaPodcastPackJobStatus = async (serviceJobId: string, epoch: number): Promise<any> => {
      for (let attempt = 0; attempt < PODCAST_PACK_POLL_MAX_ATTEMPTS; attempt++) {
        const pollStartedAt = Date.now();
        OBS.podcastPollRequestsTotal += 1;
        localPollRequests += 1;
        const response = await fetch(`${PDFUA_SERVICE_URL}/jobs/${serviceJobId}`);
        const lagMs = Date.now() - pollStartedAt;
        if (lagMs > Math.max(2000, PODCAST_PACK_POLL_INTERVAL_MS * 2)) {
          console.info(`[podcast_poll_lag] job=${jobId} source=pack ms=${lagMs}`);
        }
        if (!response.ok) {
          throw new Error(`Failed to get PDFUA job status: ${response.status}`);
        }
        const status = await response.json();
        if (status.status === 'completed') {
          return status;
        }
        if (status.status === 'failed') {
          throw new Error(status.error || 'PDFUA podcast-pack failed');
        }

        const pctRaw = typeof status.progress?.percentage === 'number' ? status.progress.percentage : 0;
        const msg = String(status.progress?.message || '').trim();
        const phase = String(status.progress?.phase || 'summary').trim();

        const pct = 10 + Math.floor(Math.max(0, Math.min(100, pctRaw)) * 0.15);
        const stage = msg || phase || 'Podcast-Pack wird erstellt...';
        await applyProgressUpdate({
          phaseCode: 'analyzing',
          phaseMessage: `Podcast-Pack: ${stage}`,
          percent: pct,
          source: 'pack_poll',
          epoch,
        });

        await sleepWithJitter(PODCAST_PACK_POLL_INTERVAL_MS);
      }
      throw new Error(`PDFUA podcast-pack timed out after ~${PODCAST_PACK_POLL_MAX_MINUTES} minutes`);
    };

    const pollPodcastJobStatus = async (serviceJobId: string, base: number, scale: number, epoch: number): Promise<any> => {
      for (let attempt = 0; attempt < PODCAST_POLL_MAX_ATTEMPTS; attempt++) {
        const pollStartedAt = Date.now();
        OBS.podcastPollRequestsTotal += 1;
        localPollRequests += 1;
        const response = await fetch(`${PODCAST_SERVICE_URL}/status/${serviceJobId}`);
        const lagMs = Date.now() - pollStartedAt;
        if (lagMs > Math.max(2000, PODCAST_POLL_INTERVAL_MS * 2)) {
          console.info(`[podcast_poll_lag] job=${jobId} source=podcast ms=${lagMs}`);
        }
        if (!response.ok) {
          throw new Error(`Failed to get job status: ${response.status}`);
        }

        const status = await response.json();
        const statusCode = String(status.status || '').trim().toLowerCase();
        if (statusCode === 'completed') {
          return status;
        }
        if (statusCode === 'failed') {
          throw new Error(status.error || 'Podcast generation failed');
        }

        const progress = typeof status.progress === 'number' ? status.progress : 0;
        const mappedPercent = base + Math.floor(Math.max(0, Math.min(100, progress)) * scale);
        const phaseCode = mapPodcastServiceStatusToPhaseCode(statusCode);
        const phaseMessage = String(status.current_stage || '').trim() || getDefaultPhaseMessage(phaseCode);
        await applyProgressUpdate({
          phaseCode,
          phaseMessage,
          percent: mappedPercent,
          source: 'podcast_poll',
          epoch,
        });

        await sleepWithJitter(PODCAST_POLL_INTERVAL_MS);
      }

      throw new Error(`Job timed out after ${Math.ceil(PODCAST_POLL_MAX_ATTEMPTS * PODCAST_POLL_INTERVAL_MS / 60000)} minutes`);
    };

    if (PODCAST_PACK_ENABLED) {
      for (let attempt = 1; attempt <= PODCAST_PACK_RETRY_ATTEMPTS; attempt++) {
        const epoch = ++pollEpoch;
        try {
          await applyProgressUpdate({
            phaseCode: 'analyzing',
            phaseMessage: attempt === 1
              ? 'Podcast-Pack wird erstellt...'
              : `Podcast-Pack Retry ${attempt}/${PODCAST_PACK_RETRY_ATTEMPTS}`,
            percent: Math.max(currentPercent, 10),
            source: 'pack_start',
            epoch,
          });

          const pdfuaForm = new FormData();
          pdfuaForm.append('file', fs.createReadStream(inputFilePath), {
            filename: originalName,
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          });

          const startResp = await axios.post(`${PDFUA_SERVICE_URL}/podcast-pack`, pdfuaForm, {
            headers: pdfuaForm.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000,
            validateStatus: () => true,
          });

          if (startResp.status < 200 || startResp.status >= 300) {
            const errorText = typeof startResp.data === "string" ? startResp.data : JSON.stringify(startResp.data);
            throw new Error(`pdfua-service podcast-pack error: ${startResp.status} - ${errorText}`);
          }

          packJobId = startResp.data?.job_id;
          if (!packJobId) {
            throw new Error('pdfua-service did not return a job id');
          }

          const finalPackStatus = await pollPdfuaPodcastPackJobStatus(packJobId, epoch);
          pack = finalPackStatus?.result?.pack || null;
          if (!pack || typeof pack !== 'object') {
            throw new Error('pdfua-service returned no pack result');
          }

          pipelinePath = 'pack';
          timings.packMs = Date.now() - packStartedAtMs;
          await applyProgressUpdate({
            phaseCode: 'generating',
            phaseMessage: 'Podcast-Pack erstellt',
            percent: 25,
            source: 'pack_completed',
            epoch,
          });
          break;
        } catch (e: any) {
          const errorMessage = sanitizeErrorMessage(e, 'pdfua podcast-pack failed');
          const errorCode = inferJobErrorCode(errorMessage);
          const shouldRetry = attempt < PODCAST_PACK_RETRY_ATTEMPTS && isTransientPackError(errorCode);
          if (shouldRetry) {
            console.warn(
              `[podcast_pack_retry] job=${jobId} attempt=${attempt}/${PODCAST_PACK_RETRY_ATTEMPTS} errorCode=${errorCode} message=${errorMessage}`,
            );
            await sleepWithJitter(PODCAST_PACK_RETRY_DELAY_MS * attempt, 250);
            continue;
          }
          pipelinePath = 'legacy';
          OBS.podcastPackFallbackCount += 1;
          timings.packMs = Date.now() - packStartedAtMs;
          console.warn(
            `[PodcastWorker] pdfua podcast-pack failed, falling back to legacy path: ${errorMessage} (code=${errorCode})`,
          );
          await applyProgressUpdate({
            phaseCode: 'generating',
            phaseMessage: 'Fallback auf Direktpfad',
            percent: Math.max(currentPercent, 12),
            source: 'pack_fallback',
            epoch,
            force: true,
          });
          pack = null;
          break;
        }
      }
    } else {
      pipelinePath = 'legacy';
      console.info('[PodcastWorker] podcast-pack disabled; using direct path');
    }

    updateJob(jobId, {
      resultData: {
        pipelinePath,
        timings,
      },
    });

    const ttsEngineEffective = (ttsEngine || 'qwen3tts');
    const ttsEngineQuery = ttsEngineEffective ? `&ttsEngine=${encodeURIComponent(ttsEngineEffective)}` : '';
    const validTtsPresets = ['klar', 'lebendig', 'dynamisch'];
    const ttsPresetEffective = ttsPreset && validTtsPresets.includes(ttsPreset) ? ttsPreset : 'lebendig';
    const ttsPresetQuery = `&ttsPreset=${encodeURIComponent(ttsPresetEffective)}`;

    let serviceJobId: string | undefined;
    if (pack) {
      const convertUrl = `${PODCAST_SERVICE_URL}/convert-pack?style=${encodeURIComponent(style)}&speakerStyle=${encodeURIComponent(speakerStyle)}${ttsEngineQuery}${ttsPresetQuery}`;
      const convertResponse = await axios.post(convertUrl, {
        pack,
        pronunciationRules: pronunciationRules || null,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        validateStatus: () => true,
      });

      if (convertResponse.status < 200 || convertResponse.status >= 300) {
        const errorText = typeof convertResponse.data === "string" ? convertResponse.data : JSON.stringify(convertResponse.data);
        throw new Error(`Podcast convert-pack error: ${convertResponse.status} - ${errorText}`);
      }

      serviceJobId = convertResponse.data?.job_id;
    } else {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(inputFilePath), {
        filename: originalName,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      if (pronunciationRules) {
        formData.append('pronunciationRules', pronunciationRules);
      }

      const convertUrl = `${PODCAST_SERVICE_URL}/convert?style=${encodeURIComponent(style)}&speakerStyle=${encodeURIComponent(speakerStyle)}${ttsEngineQuery}${ttsPresetQuery}`;
      const convertResponse = await axios.post(convertUrl, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000,
        validateStatus: () => true,
      });

      if (convertResponse.status < 200 || convertResponse.status >= 300) {
        const errorText = typeof convertResponse.data === "string" ? convertResponse.data : JSON.stringify(convertResponse.data);
        throw new Error(`Podcast convert error: ${convertResponse.status} - ${errorText}`);
      }
      serviceJobId = convertResponse.data?.job_id;
    }

    if (!serviceJobId) {
      throw new Error('Podcast service did not return a job id');
    }

    const startPercent = pack ? 25 : 10;
    await applyProgressUpdate({
      phaseCode: pack ? 'generating' : 'extracting',
      phaseMessage: 'Podcast startet',
      percent: Math.max(currentPercent, startPercent),
      source: 'podcast_start',
      force: true,
    });

    const pollBase = pack ? 25 : 10;
    const pollScale = pack ? 0.75 : 0.85;
    const epoch = ++pollEpoch;
    const finalStatus = await pollPodcastJobStatus(serviceJobId, pollBase, pollScale, epoch);

    const resultPath = tmpPath(`podcast_${jobId}.json`);
    fs.writeFileSync(resultPath, JSON.stringify({ serviceJobId }));

    const statusTimings = finalStatus?.timings && typeof finalStatus.timings === 'object'
      ? finalStatus.timings
      : {};
    timings.scriptMs = Math.max(0, Number(statusTimings.scriptMs || 0));
    timings.ttsMs = Math.max(0, Number(statusTimings.ttsMs || 0));
    timings.totalMs = Date.now() - jobStartedAtMs;

    updateJob(jobId, {
      status: 'completed',
      progressStage: 'Fertig',
      phase: 'completed',
      progressPercent: 100,
      errorCode: null,
      lastHeartbeatAt: new Date(),
      completedAt: new Date(),
      resultFilePath: resultPath,
      resultData: {
        serviceJobId,
        durationSeconds: finalStatus.duration_seconds || 0,
        chapters: finalStatus.chapters || [],
        pipelinePath,
        timings,
      },
    });

    OBS.podcastJobsCompletedTotal += 1;
    console.info(
      `[podcast_runtime_seconds] job=${jobId} queue=podcast total=${(timings.totalMs / 1000).toFixed(2)} pack=${(timings.packMs / 1000).toFixed(2)} script=${(timings.scriptMs / 1000).toFixed(2)} tts=${(timings.ttsMs / 1000).toFixed(2)}`,
    );
    const fallbackRatio = OBS.podcastJobsCompletedTotal > 0
      ? OBS.podcastPackFallbackCount / OBS.podcastJobsCompletedTotal
      : 0;
    console.info(
      `[podcast_pack_fallback_ratio] completed=${OBS.podcastJobsCompletedTotal} fallback=${OBS.podcastPackFallbackCount} ratio=${fallbackRatio.toFixed(4)}`,
    );

    finalizeCreditsForJob(jobId, 'completed');

    await publishJobEvent(jobId, userId, 'completed', {
      stage: 'completed',
      percent: 100,
      phaseCode: 'completed',
      phaseRank: getPhaseRank('completed'),
      result: {
        serviceJobId,
        downloadUrl: `/api/podcast/download/${jobId}`,
        pipelinePath,
        timings,
      },
    });

    if (notificationEmail) {
      const emailResult = await sendPodcastCompleteEmail(
        notificationEmail,
        originalName,
        jobId,
        true,
        finalStatus.duration_seconds,
        finalStatus.chapters?.length
      );
      if (!emailResult.success) {
        console.error(
          `[PodcastWorker] Failed to send completion email for job ${jobId}: ${emailResult.error || 'unknown_error'}`,
        );
      } else {
        console.log(`[PodcastWorker] Completion email sent for job ${jobId} to ${notificationEmail}`);
      }
    }

    cleanupFile(inputFilePath);
    return resultPath;
  } catch (error: any) {
    const retriesLeft = attemptsLeft(bullJob);
    const errorMessage = sanitizeErrorMessage(error, 'Podcast generation failed');
    const errorCode = inferJobErrorCode(errorMessage);
    const retryable = isRetryableErrorCode(errorCode);

    if (retryable && retriesLeft > 0) {
      const retriesDone = Math.max(1, (bullJob.attemptsMade ?? 0) + 1);
      updateJob(jobId, {
        status: 'pending',
        progressStage: 'Erneuter Versuch wird vorbereitet...',
        phase: 'retrying',
        progressPercent: Math.max(10, currentPercent),
        retryCount: retriesDone,
        errorCode,
        lastHeartbeatAt: new Date(),
        errorMessage: `Podcast fehlgeschlagen, erneuter Versuch folgt (${retriesLeft} retries verbleibend).`,
      });

      await publishJobEvent(jobId, userId, 'progress', {
        status: 'pending',
        stage: 'Erneuter Versuch wird vorbereitet...',
        percent: Math.max(10, currentPercent),
        phaseCode: 'retrying',
        phaseRank: getPhaseRank('retrying'),
        retryCount: retriesDone,
        errorCode,
        message: 'Podcast fehlgeschlagen, erneuter Versuch folgt.',
      });

      // Keep input for retry attempts.
      throw error;
    }

    updateJob(jobId, {
      status: 'failed',
      phase: 'failed',
      progressStage: 'Fehler',
      errorMessage,
      errorCode,
      retryCount: Math.max(0, (bullJob.attemptsMade ?? 0) + (retriesLeft === 0 ? 1 : 0)),
      lastHeartbeatAt: new Date(),
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'failed');

    await publishJobEvent(jobId, userId, 'failed', {
      error: errorMessage,
      errorCode,
      phaseCode: 'failed',
      phaseRank: getPhaseRank('failed'),
    });

    console.warn(
      `[podcast_status_regression_blocked_total] total=${OBS.statusRegressionBlockedTotal} local=${localStatusRegressionBlocked} job=${jobId}`,
    );

    if (notificationEmail) {
      const emailResult = await sendPodcastCompleteEmail(
        notificationEmail,
        originalName,
        jobId,
        false
      );
      if (!emailResult.success) {
        console.error(
          `[PodcastWorker] Failed to send failure email for job ${jobId}: ${emailResult.error || 'unknown_error'}`,
        );
      } else {
        console.log(`[PodcastWorker] Failure email sent for job ${jobId} to ${notificationEmail}`);
      }
    }

    cleanupFile(inputFilePath);
    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    console.info(
      `[podcast_poll_requests_total] job=${jobId} local=${localPollRequests} total=${OBS.podcastPollRequestsTotal}`,
    );
    releaseGpuSlot(gpuAllocation);
  }
}

export function startPodcastWorker() {
  const worker = new Worker<PodcastJobData>(
    'podcast',
    processPodcast,
    {
      connection: queueConnection,
      concurrency: PODCAST_WORKER_CONCURRENCY,
      lockDuration: 90 * 60 * 1000,
      maxStalledCount: 3,
      stalledInterval: 30 * 1000,
      settings: {
        backoffStrategy: tieredRetryBackoff,
      },
    }
  );

  worker.on('ready', () => {
    console.log('[PodcastWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[PodcastWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[PodcastWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[PodcastWorker] Worker error:', err);
  });

  return worker;
}

export { processPodcast };
