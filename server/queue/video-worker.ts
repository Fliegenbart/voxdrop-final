import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { sendVideoCompleteEmail } from '../email/service';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { tmpPath } from '../utils/tmp';
import { checkNvencAvailable } from '../utils/nvenc';
import { getQueueConcurrency } from './queues';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';

const queueConnection = redisConnection as any;

// Get video encoding options
function getVideoEncodingOptions(quality: 'fast' | 'balanced' | 'quality' = 'fast'): string[] {
  if (checkNvencAvailable('[VideoWorker]')) {
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
    console.error(`[VideoWorker] Failed to cleanup ${filePath}:`, err);
  }
}

function normalizeNotifyEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// Video conversion job data interface
interface VideoConversionJobData {
  jobId: string;
  userId: number;
  inputFilePath: string;
  outputFormat: string;
  originalName: string;
  notifyEmail?: string;
}

// Process video conversion
async function processVideoConversion(bullJob: BullJob<VideoConversionJobData>): Promise<string> {
  const { jobId, userId, inputFilePath, outputFormat, originalName, notifyEmail } = bullJob.data;
  const notificationEmail = normalizeNotifyEmail(notifyEmail);
  let gpuAllocation = null;
  const safeFormat = outputFormat === 'mp4' ? 'mp4' : null;
  if (!safeFormat) {
    throw new Error('invalid_format');
  }

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

  const outputPath = tmpPath(`converted_${jobId}.${safeFormat}`);
  const useGpu = checkNvencAvailable('[VideoWorker]');

  try {
    gpuAllocation = await acquireGpuSlot('video', bullJob.id);

    await new Promise<void>((resolve, reject) => {
      let lastPercent = 0;

      ffmpeg(inputFilePath)
        .outputOptions([
          ...getVideoEncodingOptions('fast'),
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('start', () => {
          console.log(`[VideoWorker] Started (${useGpu ? 'GPU' : 'CPU'}): ${jobId}`);
          updateJob(jobId, { progressStage: 'converting', progressPercent: 5 });
          publishJobEvent(jobId, userId, 'progress', {
            stage: 'converting',
            percent: 5,
          });
        })
        .on('progress', (progress) => {
          const percent = Math.min(95, Math.round(progress.percent || 0));
          // Only update if significant change
          if (percent > lastPercent + 5) {
            lastPercent = percent;
            updateJob(jobId, { progressPercent: percent });
            publishJobEvent(jobId, userId, 'progress', {
              stage: 'converting',
              percent,
            });
          }
        })
        .on('end', () => {
          console.log(`[VideoWorker] Finished: ${jobId}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[VideoWorker] Error: ${jobId}`, err);
          reject(err);
        })
        .run();
    });

    // Update job as completed
    updateJob(jobId, {
      status: 'completed',
      progressStage: 'done',
      progressPercent: 100,
      resultFilePath: outputPath,
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'completed', {
      status: 'completed',
      percent: 100,
      resultFilePath: outputPath,
    });

    if (notificationEmail) {
      const emailResult = await sendVideoCompleteEmail(
        notificationEmail,
        originalName || `video_${jobId}`,
        jobId,
        true,
        outputFormat
      );
      if (!emailResult.success) {
        console.error(
          `[VideoWorker] Failed to send completion email for job ${jobId}: ${emailResult.error || 'unknown_error'}`,
        );
      } else {
        console.log(`[VideoWorker] Completion email sent for job ${jobId} to ${notificationEmail}`);
      }
    }

    // Cleanup input file
    cleanupFile(inputFilePath);

    return outputPath;
    } catch (error: any) {
    // Update job as failed
    updateJob(jobId, {
      status: 'failed',
      errorMessage: error.message || 'Conversion failed',
      completedAt: new Date(),
    });

    await publishJobEvent(jobId, userId, 'failed', {
      status: 'failed',
      error: error.message || 'Conversion failed',
    });

    if (notificationEmail) {
      const emailResult = await sendVideoCompleteEmail(
        notificationEmail,
        originalName || `video_${jobId}`,
        jobId,
        false,
        outputFormat
      );
      if (!emailResult.success) {
        console.error(
          `[VideoWorker] Failed to send failure email for job ${jobId}: ${emailResult.error || 'unknown_error'}`,
        );
      } else {
        console.log(`[VideoWorker] Failure email sent for job ${jobId} to ${notificationEmail}`);
      }
    }

    // Cleanup files
    cleanupFile(inputFilePath);
    cleanupFile(outputPath);

    throw error;
  } finally {
    releaseGpuSlot(gpuAllocation);
  }
}

// Create and start the worker
export function startVideoWorker() {
  const worker = new Worker<VideoConversionJobData>(
    'video-conversion',
    processVideoConversion,
    {
      connection: queueConnection,
      concurrency: getQueueConcurrency('video'),
    }
  );

  worker.on('ready', () => {
    console.log('[VideoWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[VideoWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[VideoWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[VideoWorker] Worker error:', err);
  });

  return worker;
}

// Export for use in routes
export { processVideoConversion };
