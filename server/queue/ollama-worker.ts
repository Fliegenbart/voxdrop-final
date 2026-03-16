import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { getQueueConcurrency } from './queues';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { simplifyTextWithOllama, checkOllamaHealth } from '../services/ollama';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';

const queueConnection = redisConnection as any;

// Ollama job data interface
interface OllamaJobData {
  jobId: string;
  userId: number;
  taskType: 'simplify' | 'persona-check';
  text: string;
  options?: {
    targetPersona?: string;
    analysisResults?: any;
  };
}

// Process Ollama task
async function processOllamaTask(bullJob: BullJob<OllamaJobData>): Promise<string> {
  const { jobId, userId, taskType, text } = bullJob.data;
  let gpuAllocation: any = null;

  // Update job status to active
  updateJob(jobId, {
    status: 'active',
    progressStage: 'starting',
    progressPercent: 5,
    startedAt: new Date(),
  });

  await publishJobEvent(jobId, userId, 'progress', {
    status: 'active',
    stage: 'starting',
    percent: 5,
  });

  try {
    gpuAllocation = await acquireGpuSlot('ollama', bullJob.id);

    // Check Ollama health first
    const health = await checkOllamaHealth();
    if (!health.available) {
      throw new Error(`Ollama service not available: ${health.error}`);
    }

    if (!health.model) {
      throw new Error(`Ollama model not loaded: ${health.error}`);
    }

    console.log(`[OllamaWorker] Processing ${taskType}: ${text.length} chars`);

    // Update progress
    updateJob(jobId, { progressStage: 'processing', progressPercent: 20 });
    await publishJobEvent(jobId, userId, 'progress', {
      stage: 'processing',
      percent: 20,
    });

    let result: string;

    switch (taskType) {
      case 'simplify':
        result = await simplifyTextWithOllama(text);
        break;

      case 'persona-check':
        // For persona-check, we can add specific handling later
        result = await simplifyTextWithOllama(text);
        break;

      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }

    console.log(`[OllamaWorker] Completed ${taskType}: ${result.length} chars output`);

    // Update job as completed
    updateJob(jobId, {
      status: 'completed',
      progressStage: 'done',
      progressPercent: 100,
      resultData: {
        text: result,
        inputLength: text.length,
        outputLength: result.length,
      },
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'completed', {
      status: 'completed',
      percent: 100,
      result: {
        text: result,
        inputLength: text.length,
        outputLength: result.length,
      },
    });

    return result;

  } catch (error: any) {
    console.error(`[OllamaWorker] Failed: ${jobId}`, error);

    // Update job as failed
    updateJob(jobId, {
      status: 'failed',
      errorMessage: error.message || 'Ollama task failed',
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'failed', {
      status: 'failed',
      error: error.message || 'Ollama task failed',
    });

    throw error;
  } finally {
    releaseGpuSlot(gpuAllocation);
  }
}

// Create and start the worker
export function startOllamaWorker() {
  const worker = new Worker<OllamaJobData>(
    'ollama-tasks',
    processOllamaTask,
    {
      connection: queueConnection,
      concurrency: getQueueConcurrency('ollama'),
    }
  );

  worker.on('ready', () => {
    console.log('[OllamaWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[OllamaWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[OllamaWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[OllamaWorker] Worker error:', err);
  });

  return worker;
}

// Export for direct use
export { processOllamaTask };
