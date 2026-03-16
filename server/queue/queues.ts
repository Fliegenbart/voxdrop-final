import { Queue } from 'bullmq';
import { redisConnection } from './connection';
import { getGpuSchedulerSnapshot } from './gpu-scheduler';

// Skip Redis in development if not available
const SKIP_REDIS = process.env.SKIP_REDIS === 'true' || process.env.NODE_ENV === 'development';

const queueConnection = redisConnection as any;

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(value)));

function parseQueueConcurrencyEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clampInt(parsed, min, max);
}

const VIDEO_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_VIDEO_QUEUE_CONCURRENCY', 2, 1, 8);
const TRANSCRIPTION_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_TRANSCRIPTION_QUEUE_CONCURRENCY', 2, 1, 8);
const CHAPTER_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_CHAPTER_QUEUE_CONCURRENCY', 2, 1, 4);
const PDFUA_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_PDFUA_QUEUE_CONCURRENCY', 2, 1, 4);
const PPTX_SUMMARY_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_PPTX_SUMMARY_QUEUE_CONCURRENCY', 2, 1, 4);
const OLLAMA_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_OLLAMA_QUEUE_CONCURRENCY', 2, 1, 4);
const PODCAST_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_PODCAST_QUEUE_CONCURRENCY', 1, 1, 4);
const SUBTITLE_EMBED_QUEUE_CONCURRENCY = parseQueueConcurrencyEnv('VOXDROP_SUBTITLE_EMBED_QUEUE_CONCURRENCY', 1, 1, 6);

export function getQueueConcurrency(queueName: string): number {
  switch (queueName) {
    case 'video':
      return VIDEO_QUEUE_CONCURRENCY;
    case 'transcription':
      return TRANSCRIPTION_QUEUE_CONCURRENCY;
    case 'chapter':
      return CHAPTER_QUEUE_CONCURRENCY;
    case 'pdfua':
      return PDFUA_QUEUE_CONCURRENCY;
    case 'pptx-summary':
      return PPTX_SUMMARY_QUEUE_CONCURRENCY;
    case 'ollama':
      return OLLAMA_QUEUE_CONCURRENCY;
    case 'podcast':
      return PODCAST_QUEUE_CONCURRENCY;
    case 'subtitle-embed':
      return SUBTITLE_EMBED_QUEUE_CONCURRENCY;
    default:
      return 1;
  }
}

export function getQueueLane(queueName: string): 'gpu_long' | 'gpu_short' | 'cpu' | 'default' {
  if (queueName === 'podcast') return 'gpu_long';
  if (queueName === 'subtitle-embed') return 'gpu_short';
  if (queueName === 'transcription') return 'cpu';
  return 'default';
}

// Create a mock queue for when Redis is not available
function createMockQueue(name: string): any {
  return {
    name,
    add: async () => { console.warn(`[Queue] ${name}: Redis not available, job not queued`); return null; },
    getWaitingCount: async () => 0,
    getActiveCount: async () => 0,
    getJob: async () => null,
    getWaiting: async () => [],
    close: async () => {},
  };
}

// Lazy queue creation - only create real queues if Redis might be available
let _videoConversionQueue: Queue | null = null;
let _transcriptionQueue: Queue | null = null;
let _chapterSplittingQueue: Queue | null = null;
let _pdfuaQueue: Queue | null = null;
let _pptxSummaryQueue: Queue | null = null;
let _ollamaQueue: Queue | null = null;
let _podcastQueue: Queue | null = null;
let _subtitleEmbedQueue: Queue | null = null;
let _queuesInitialized = false;

function initQueues() {
  if (_queuesInitialized) return;
  _queuesInitialized = true;

  if (SKIP_REDIS) {
    // Don't create real queues in dev mode without Redis
    return;
  }

  try {
    _videoConversionQueue = new Queue('video-conversion', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 },
      },
    });

    _transcriptionQueue = new Queue('transcription', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'tiered' },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 },
      },
    });

    _chapterSplittingQueue = new Queue('chapter-splitting', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 172800, count: 50 },
        removeOnFail: { age: 172800 },
      },
    });

    _pdfuaQueue = new Queue('pdfua-conversion', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 7200, count: 50 },
        removeOnFail: { age: 86400 },
      },
    });

    _pptxSummaryQueue = new Queue('pptx-summary', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 7200, count: 50 },
        removeOnFail: { age: 86400 },
      },
    });

    _ollamaQueue = new Queue('ollama-tasks', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 },
      },
    });

    _podcastQueue = new Queue('podcast', {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'tiered' },
        removeOnComplete: { age: 7200, count: 50 },
        removeOnFail: { age: 86400 },
      },
    });

    _subtitleEmbedQueue = new Queue('subtitle-embed', {
      connection: queueConnection,
      defaultJobOptions: {
        // Retry once: "stalled" can happen during deploys/restarts or transient IO/ffmpeg issues.
        attempts: 3,
        backoff: { type: 'tiered' },
        removeOnComplete: { age: 7200, count: 50 },
        removeOnFail: { age: 86400 },
      },
    });
  } catch (err) {
    console.warn('[Queue] Failed to initialize queues:', (err as Error).message);
  }
}

// Export getters that lazily initialize or return mocks
export const videoConversionQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _videoConversionQueue || createMockQueue('video-conversion');
    return (queue as any)[prop];
  }
});

export const transcriptionQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _transcriptionQueue || createMockQueue('transcription');
    return (queue as any)[prop];
  }
});

export const chapterSplittingQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _chapterSplittingQueue || createMockQueue('chapter-splitting');
    return (queue as any)[prop];
  }
});

export const pdfuaQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _pdfuaQueue || createMockQueue('pdfua-conversion');
    return (queue as any)[prop];
  }
});

export const pptxSummaryQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _pptxSummaryQueue || createMockQueue('pptx-summary');
    return (queue as any)[prop];
  }
});

export const ollamaQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _ollamaQueue || createMockQueue('ollama-tasks');
    return (queue as any)[prop];
  }
});

export const podcastQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _podcastQueue || createMockQueue('podcast');
    return (queue as any)[prop];
  }
});

export const subtitleEmbedQueue = new Proxy({} as Queue, {
  get(_, prop) {
    initQueues();
    const queue = _subtitleEmbedQueue || createMockQueue('subtitle-embed');
    return (queue as any)[prop];
  }
});

// Average job duration tracking (in seconds)
export const AVG_JOB_DURATION = {
  transcription: 120,    // ~2 min for typical audio
  pdfua: 180,            // ~3 min for PPTX with images
  ollama: 30,            // ~30 sec for text tasks
  podcast: 300,          // ~5 min for podcast generation
  video: 60,             // ~1 min for video processing
  pptxSummary: 120,      // ~2 min for PPTX summary with LLM
  subtitleEmbed: 180,    // ~3 min for subtitle embedding
} as const;

// Get estimated wait time based on queue position
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  estimatedWaitSeconds: number;
  lane: 'gpu_long' | 'gpu_short' | 'cpu' | 'default';
  gpu: {
    queueName: string;
    totalSlots: number;
    totalUsedSlots: number;
    usedByQueue: number;
  };
}> {
  if (SKIP_REDIS && !_queuesInitialized) {
    return {
      waiting: 0,
      active: 0,
      estimatedWaitSeconds: 0,
      lane: getQueueLane(queueName),
      gpu: {
        queueName,
        totalSlots: 0,
        totalUsedSlots: 0,
        usedByQueue: 0,
      },
    };
  }

  initQueues();

  let queue: Queue | null;
  let avgDuration: number;

  switch (queueName) {
    case 'transcription':
      queue = _transcriptionQueue;
      avgDuration = AVG_JOB_DURATION.transcription;
      break;
    case 'pdfua':
      queue = _pdfuaQueue;
      avgDuration = AVG_JOB_DURATION.pdfua;
      break;
    case 'ollama':
      queue = _ollamaQueue;
      avgDuration = AVG_JOB_DURATION.ollama;
      break;
    case 'pptx-summary':
      queue = _pptxSummaryQueue;
      avgDuration = AVG_JOB_DURATION.pptxSummary;
      break;
    case 'video':
      queue = _videoConversionQueue;
      avgDuration = AVG_JOB_DURATION.video;
      break;
    case 'podcast':
      queue = _podcastQueue;
      avgDuration = AVG_JOB_DURATION.podcast;
      break;
    case 'subtitle-embed':
      queue = _subtitleEmbedQueue;
      avgDuration = AVG_JOB_DURATION.subtitleEmbed;
      break;
    default:
      return {
        waiting: 0,
        active: 0,
        estimatedWaitSeconds: 0,
        lane: getQueueLane(queueName),
        gpu: {
          queueName,
          totalSlots: 0,
          totalUsedSlots: 0,
          usedByQueue: 0,
        },
      };
  }

  if (!queue) {
    return {
      waiting: 0,
      active: 0,
      estimatedWaitSeconds: 0,
      lane: getQueueLane(queueName),
      gpu: {
        queueName,
        totalSlots: 0,
        totalUsedSlots: 0,
        usedByQueue: 0,
      },
    };
  }

  const [waiting, active] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
  ]);

  const concurrency = getQueueConcurrency(queueName);
  const freeSlots = Math.max(0, concurrency - active);
  const queuedBehindRunning = Math.max(0, waiting - freeSlots);
  const waitBatches = Math.ceil(queuedBehindRunning / concurrency);
  const estimatedWaitSeconds = waitBatches * avgDuration;

  const gpuSnapshot = getGpuSchedulerSnapshot();
  const usedByQueue = gpuSnapshot.usedByQueue[queueName] ?? 0;

  return {
    waiting,
    active,
    estimatedWaitSeconds,
    lane: getQueueLane(queueName),
    gpu: {
      queueName,
      totalSlots: gpuSnapshot.totalSlots,
      totalUsedSlots: gpuSnapshot.totalUsedSlots,
      usedByQueue,
    },
  };
}

// Get position of a specific job in queue
export async function getJobPosition(queueName: string, jobId: string): Promise<number | null> {
  if (SKIP_REDIS && !_queuesInitialized) {
    return null;
  }

  initQueues();

  let queue: Queue | null;

  switch (queueName) {
    case 'transcription':
      queue = _transcriptionQueue;
      break;
    case 'pdfua':
      queue = _pdfuaQueue;
      break;
    case 'ollama':
      queue = _ollamaQueue;
      break;
    case 'pptx-summary':
      queue = _pptxSummaryQueue;
      break;
    case 'video':
      queue = _videoConversionQueue;
      break;
    case 'podcast':
      queue = _podcastQueue;
      break;
    case 'subtitle-embed':
      queue = _subtitleEmbedQueue;
      break;
    default:
      return null;
  }

  if (!queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  if (state === 'active') return 0;
  if (state === 'completed' || state === 'failed') return -1;

  const waitingJobs = await queue.getWaiting();
  const position = waitingJobs.findIndex(j => j.id === jobId);

  return position >= 0 ? position + 1 : null;
}

// Job priorities
export const JobPriority = {
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
} as const;

// Get priority based on user subscription
export function getPriorityForSubscription(subscription: string): number {
  switch (subscription) {
    case 'team':
    case 'premium':
    case 'pro':
      return JobPriority.HIGH;
    case 'free':
    default:
      return JobPriority.NORMAL;
  }
}
