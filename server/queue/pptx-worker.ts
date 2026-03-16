import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { getQueueConcurrency } from './queues';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { sendConversionCompleteEmail } from '../email/service';
import { finalizeCreditsForJob } from '../billing/job-credits';
import fs from 'fs';
import path from 'path';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';

const queueConnection = redisConnection as any;

// PPTX Summary service URL (uses Docker service name for container communication)
const PPTX_SERVICE_URL = process.env.PPTX_SERVICE_URL || 'http://pptx-service:8003';

const PPTX_POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.PPTX_POLL_INTERVAL_MS || '900', 10) || 900,
);
const PPTX_POLL_MAX_MINUTES = Math.max(1, parseInt(process.env.PPTX_POLL_MAX_MINUTES || '20', 10) || 20);
const PPTX_POLL_MAX_ATTEMPTS = Math.max(
  1,
  Math.ceil((PPTX_POLL_MAX_MINUTES * 60 * 1000) / PPTX_POLL_INTERVAL_MS),
);

// Cleanup file helper
function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[PPTXWorker] Failed to cleanup ${filePath}:`, err);
  }
}

// PPTX job data interface
interface PPTXJobData {
  jobId: string;
  userId: number;
  inputFilePath: string;
  originalName: string;
  notifyEmail?: string;
}

// Poll pptx-service for job status
async function pollPptxJobStatus(serviceJobId: string, maxAttempts: number = PPTX_POLL_MAX_ATTEMPTS): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${PPTX_SERVICE_URL}/jobs/${serviceJobId}`);

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status}`);
    }

    const status = await response.json();

    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'PPTX summary generation failed');
    }

    // Poll with configured interval.
    await new Promise(resolve => setTimeout(resolve, PPTX_POLL_INTERVAL_MS));
  }

  const timeoutMinutes = Math.ceil(PPTX_POLL_MAX_ATTEMPTS * PPTX_POLL_INTERVAL_MS / 60000);
  throw new Error(`Job timed out after ${timeoutMinutes} minutes`);
}

// Process PPTX Summary generation
async function processPPTXSummary(bullJob: BullJob<PPTXJobData>): Promise<string> {
  const { jobId, userId, inputFilePath, originalName, notifyEmail } = bullJob.data;
  let gpuAllocation: any = null;
  const releaseGpu = () => {
    if (gpuAllocation) {
      releaseGpuSlot(gpuAllocation);
      gpuAllocation = null;
    }
  };

  // Update job status to active
  updateJob(jobId, {
    status: 'active',
    progressStage: 'uploading',
    progressPercent: 5,
    startedAt: new Date(),
  });

  await publishJobEvent(jobId, userId, 'progress', {
    status: 'active',
    stage: 'uploading',
    percent: 5,
  });

  try {
    gpuAllocation = await acquireGpuSlot('pptx-summary', bullJob.id);

    // Read PPTX file metadata
    const fileSize = fs.statSync(inputFilePath).size;

    console.log(`[PPTXWorker] Processing: ${originalName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Update progress
    updateJob(jobId, { progressStage: 'converting', progressPercent: 10 });
    await publishJobEvent(jobId, userId, 'progress', {
      stage: 'converting',
      percent: 10,
    });

    // Send to PPTX service using axios for reliable file uploads
    const axios = (await import('axios')).default;
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(inputFilePath), {
      filename: originalName,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    const convertResponse = await axios.post(`${PPTX_SERVICE_URL}/convert`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const serviceJobId = convertResponse.data.job_id;
    console.log(`[PPTXWorker] PPTX service job started: ${serviceJobId}`);

    // External service call phase: GPU not required while waiting for progress.
    releaseGpu();

    // Update progress
    updateJob(jobId, { progressStage: 'processing', progressPercent: 20 });
    await publishJobEvent(jobId, userId, 'progress', {
      stage: 'processing',
      percent: 20,
    });

    // Poll for completion with progress updates
    let lastPercent = 20;
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`${PPTX_SERVICE_URL}/jobs/${serviceJobId}`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          const progress = status.progress || {};
          const phase = progress.phase || 'processing';

          // Map phases to percentages
          let newPercent = lastPercent;
          if (phase === 'pipeline') {
            newPercent = 20 + Math.floor((progress.percent || 0) * 0.3); // 20-50%
          } else if (phase === 'llm') {
            newPercent = 50 + Math.floor((progress.percent || 0) * 0.4); // 50-90%
          }

          if (newPercent > lastPercent) {
            lastPercent = newPercent;

            updateJob(jobId, {
              progressStage: progress.message || phase,
              progressPercent: newPercent
            });
            await publishJobEvent(jobId, userId, 'progress', {
              stage: progress.message || phase,
              percent: newPercent,
              details: progress,
            });
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
	    }, PPTX_POLL_INTERVAL_MS);

	    // Wait for completion
	    try {
	      await pollPptxJobStatus(serviceJobId);
	    } finally {
	      clearInterval(pollInterval);
	    }

    console.log(`[PPTXWorker] PPTX service completed for: ${serviceJobId}`);

    // Download the result JSON
    const downloadResponse = await fetch(`${PPTX_SERVICE_URL}/jobs/${serviceJobId}/download`);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download result: ${downloadResponse.status}`);
    }

    const summaryJson = await downloadResponse.json();

    // Save result to file
    const outputDir = path.join(process.cwd(), 'uploads', 'pptx-summaries');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${jobId}.json`;
    const outputPath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputPath, JSON.stringify(summaryJson, null, 2));

    console.log(`[PPTXWorker] Saved summary to: ${outputPath}`);

    // Update job as completed
    updateJob(jobId, {
      status: 'completed',
      progressStage: 'completed',
      progressPercent: 100,
      completedAt: new Date(),
      resultFilePath: outputPath,
      resultData: {
        language: summaryJson.language,
        hasTimeline: Array.isArray(summaryJson.timeline) && summaryJson.timeline.length > 0,
        hasGlossary: Array.isArray(summaryJson.glossary) && summaryJson.glossary.length > 0,
        qualityFlags: summaryJson.quality_flags || [],
      },
    });

    finalizeCreditsForJob(jobId, 'completed');

    await publishJobEvent(jobId, userId, 'completed', {
      stage: 'completed',
      percent: 100,
      resultFile: outputPath,
    });

    // Cleanup input file
    cleanupFile(inputFilePath);

    // Send email notification if requested
    if (notifyEmail) {
      try {
        await sendConversionCompleteEmail(
          notifyEmail,
          originalName,
          jobId,
          true,
          false
        );
        console.log(`[PPTXWorker] Notification email sent to: ${notifyEmail}`);
      } catch (emailErr) {
        console.error(`[PPTXWorker] Failed to send email:`, emailErr);
      }
    }

    return outputPath;

  } catch (error: any) {
    console.error(`[PPTXWorker] Error processing job ${jobId}:`, error);

    // Cleanup input file on error
    cleanupFile(inputFilePath);

    // Update job as failed
    updateJob(jobId, {
      status: 'failed',
      progressStage: 'failed',
      errorMessage: error.message || 'Unknown error',
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'failed');

    await publishJobEvent(jobId, userId, 'failed', {
      error: error.message || 'Unknown error',
    });

    throw error;
  } finally {
    releaseGpu();
  }
}

// Start worker function (called from routes.ts)
export function startPPTXWorker() {
  const worker = new Worker<PPTXJobData>(
    'pptx-summary',
    processPPTXSummary,
    {
      connection: queueConnection,
      concurrency: getQueueConcurrency('pptx-summary'),
    }
  );

  worker.on('ready', () => {
    console.log('[PPTXWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[PPTXWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[PPTXWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[PPTXWorker] Worker error:', err);
  });

  return worker;
}

// Export for use in routes
export { processPPTXSummary };
