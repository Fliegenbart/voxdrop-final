import { randomUUID } from 'crypto';

const GPU_SLOT_LIMIT = Math.max(1, Math.min(16, Number(process.env.VOXDROP_GPU_SLOT_LIMIT || 1)));
const GPU_SLOT_ACQUIRE_TIMEOUT_MS = Math.max(
  1000,
  Math.min(2 * 60 * 60 * 1000, Number(process.env.VOXDROP_GPU_SLOT_ACQUIRE_TIMEOUT_MS || 45 * 60 * 1000)),
);

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const parseWeight = (name: string, fallback: number): number => {
  const raw = process.env[`VOXDROP_GPU_WEIGHT_${name}`];
  return clamp(Number.parseFloat(raw || String(fallback)), 0.1, 16);
};

const normalizeQueueNameForEnv = (queueName: string): string => queueName.toUpperCase().replace(/-/g, '_');

const parseQueueCap = (name: string, fallback: number): number => {
  const raw = process.env[`VOXDROP_GPU_QUEUE_CAP_${normalizeQueueNameForEnv(name)}`];
  return clamp(Number.parseFloat(raw || String(fallback)), 0, GPU_SLOT_LIMIT);
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  video: 2,
  transcription: 1,
  'pdfua': 2,
  'pptx-summary': 1,
  ollama: 1,
  podcast: 1,
  'subtitle-embed': 1,
  chapter: 1,
  default: 1,
};

const WEIGHTS: Record<string, number> = {
  video: parseWeight('VIDEO', DEFAULT_WEIGHTS.video),
  transcription: parseWeight('TRANSCRIPTION', DEFAULT_WEIGHTS.transcription),
  pdfua: parseWeight('PDFUA', DEFAULT_WEIGHTS['pdfua']),
  'pptx-summary': parseWeight('PPTX_SUMMARY', DEFAULT_WEIGHTS['pptx-summary']),
  ollama: parseWeight('OLLAMA', DEFAULT_WEIGHTS.ollama),
  podcast: parseWeight('PODCAST', DEFAULT_WEIGHTS.podcast),
  'subtitle-embed': parseWeight('SUBTITLE_EMBED', DEFAULT_WEIGHTS['subtitle-embed']),
  chapter: parseWeight('CHAPTER', DEFAULT_WEIGHTS.chapter),
  default: parseWeight('DEFAULT', DEFAULT_WEIGHTS.default),
};

const DEFAULT_QUEUE_CAPS: Record<string, number> = {
  video: 2,
  transcription: 2,
  // Caps are in "slot" units, not "job" units. Ensure each queue can run at least one job by default.
  pdfua: 2,
  'pptx-summary': 1,
  ollama: 1,
  podcast: 2,
  'subtitle-embed': 1,
  chapter: 1,
  default: 1,
};

const QUEUE_CAPS: Record<string, number> = {
  video: parseQueueCap('VIDEO', DEFAULT_QUEUE_CAPS.video),
  transcription: parseQueueCap('TRANSCRIPTION', DEFAULT_QUEUE_CAPS.transcription),
  pdfua: parseQueueCap('PDFUA', DEFAULT_QUEUE_CAPS.pdfua),
  'pptx-summary': parseQueueCap('PPTX_SUMMARY', DEFAULT_QUEUE_CAPS['pptx-summary']),
  ollama: parseQueueCap('OLLAMA', DEFAULT_QUEUE_CAPS.ollama),
  podcast: parseQueueCap('PODCAST', 1),
  'subtitle-embed': parseQueueCap('SUBTITLE_EMBED', DEFAULT_QUEUE_CAPS['subtitle-embed']),
  chapter: parseQueueCap('CHAPTER', DEFAULT_QUEUE_CAPS.chapter),
  default: parseQueueCap('DEFAULT', DEFAULT_QUEUE_CAPS.default),
};

export const getQueueGpuWeight = (queueName: string): number => {
  return WEIGHTS[queueName] ?? WEIGHTS.default;
};

export const getQueueGpuCap = (queueName: string): number => {
  return Math.max(0, QUEUE_CAPS[queueName] ?? QUEUE_CAPS.default);
};

interface GpuAllocation {
  id: string;
  queueName: string;
  jobId: string | number | undefined;
  slots: number;
  acquiredAt: number;
}

const queueUsage: Record<string, number> = {};
const allocations = new Map<string, GpuAllocation>();
let usedSlotsTotal = 0;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const roundDownPrecision = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value.toFixed(3)));
};

export const getGpuSchedulerSnapshot = () => {
  const usedByQueue: Record<string, number> = {};
  const queueCaps: Record<string, number> = {};
  Object.entries(queueUsage).forEach(([key, used]) => {
    if (used > 0) {
      usedByQueue[key] = roundDownPrecision(used);
    }
  });

  Object.keys(WEIGHTS).forEach((queueName) => {
    queueCaps[queueName] = roundDownPrecision(getQueueGpuCap(queueName));
  });

  const activeJobs = Array.from(allocations.values()).map((entry) => ({
    queueName: entry.queueName,
    jobId: entry.jobId,
    slots: roundDownPrecision(entry.slots),
    acquiredAt: entry.acquiredAt,
  }));

  return {
    totalSlots: GPU_SLOT_LIMIT,
    totalUsedSlots: roundDownPrecision(usedSlotsTotal),
    usedByQueue,
    activeJobs,
    queueWeights: {
      video: roundDownPrecision(WEIGHTS.video),
      transcription: roundDownPrecision(WEIGHTS.transcription),
      pdfua: roundDownPrecision(WEIGHTS.pdfua),
      'pptx-summary': roundDownPrecision(WEIGHTS['pptx-summary']),
      ollama: roundDownPrecision(WEIGHTS.ollama),
      podcast: roundDownPrecision(WEIGHTS.podcast),
      'subtitle-embed': roundDownPrecision(WEIGHTS['subtitle-embed']),
      chapter: roundDownPrecision(WEIGHTS.chapter),
      default: roundDownPrecision(WEIGHTS.default),
    },
    queueCaps,
  };
};

const normalizeQueueUsage = () => {
  for (const queueName of Object.keys(queueUsage)) {
    if (queueUsage[queueName] <= 0) {
      delete queueUsage[queueName];
    }
  }
};

export async function acquireGpuSlot(queueName: string, jobId?: string | number): Promise<GpuAllocation> {
  const requiredSlots = getQueueGpuWeight(queueName);
  const queueCap = getQueueGpuCap(queueName);
  if (requiredSlots <= 0) {
    return {
      id: `none-${randomUUID()}`,
      queueName,
      jobId,
      slots: 0,
      acquiredAt: Date.now(),
    };
  }

  // Fail fast on impossible configs instead of waiting for gpu_slot_timeout.
  if (requiredSlots > GPU_SLOT_LIMIT) {
    throw new Error('gpu_slot_invalid_config_weight_exceeds_total');
  }
  if (queueCap <= 0) {
    throw new Error('gpu_slot_invalid_config_queue_disabled');
  }
  if (requiredSlots > queueCap) {
    throw new Error('gpu_slot_invalid_config_weight_exceeds_queue_cap');
  }

  const id = randomUUID();
  const start = Date.now();

  while (Date.now() - start < GPU_SLOT_ACQUIRE_TIMEOUT_MS) {
    const currentQueueUsage = queueUsage[queueName] || 0;
    if (usedSlotsTotal + requiredSlots <= GPU_SLOT_LIMIT && currentQueueUsage + requiredSlots <= queueCap) {
      usedSlotsTotal += requiredSlots;
      queueUsage[queueName] = roundDownPrecision((queueUsage[queueName] || 0) + requiredSlots);
      const allocation: GpuAllocation = {
        id,
        queueName,
        jobId,
        slots: roundDownPrecision(requiredSlots),
        acquiredAt: Date.now(),
      };
      allocations.set(id, allocation);
      return allocation;
    }

    await delay(250);
  }

  throw new Error('gpu_slot_timeout');
}

export function releaseGpuSlot(allocation: GpuAllocation | null | undefined): void {
  if (!allocation || !allocation.id || allocation.slots <= 0) return;

  const current = allocations.get(allocation.id);
  if (!current) return;

  allocations.delete(allocation.id);
  usedSlotsTotal = Math.max(0, roundDownPrecision(usedSlotsTotal - current.slots));
  queueUsage[current.queueName] = roundDownPrecision((queueUsage[current.queueName] || 0) - current.slots);
  normalizeQueueUsage();
}
