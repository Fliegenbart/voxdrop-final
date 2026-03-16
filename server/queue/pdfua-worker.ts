import { Worker, Job as BullJob } from 'bullmq';
import { redisConnection } from './connection';
import { getQueueConcurrency } from './queues';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { sendConversionCompleteEmail } from '../email/service';
import { finalizeCreditsForJob } from '../billing/job-credits';
import fs from 'fs';
import { tmpPath } from '../utils/tmp';
import { acquireGpuSlot, releaseGpuSlot } from './gpu-scheduler';

const queueConnection = redisConnection as any;

// PDFUA service URL (uses Docker service name for container communication)
const PDFUA_SERVICE_URL = process.env.PDFUA_SERVICE_URL || 'http://pdfua-service:8000';
const POLL_INTERVAL_MS = Math.max(500, parseInt(process.env.PDFUA_POLL_INTERVAL_MS || '700', 10) || 700);
const POLL_MAX_MINUTES = Math.max(20, parseInt(process.env.PDFUA_POLL_MAX_MINUTES || '120', 10) || 120);
const POLL_MAX_ATTEMPTS = Math.max(1, Math.ceil((POLL_MAX_MINUTES * 60 * 1000) / POLL_INTERVAL_MS));

// Cleanup file helper
function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[PDFUAWorker] Failed to cleanup ${filePath}:`, err);
  }
}

// PDFUA job data interface
interface PDFUAJobData {
  jobId: string;
  userId: number;
  inputFilePath: string;
  originalName: string;
  notifyEmail?: string;
}

// Poll pdfua-service for job status (configurable max duration)
async function pollPdfuaJobStatus(serviceJobId: string, maxAttempts: number = POLL_MAX_ATTEMPTS): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${PDFUA_SERVICE_URL}/jobs/${serviceJobId}`);

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status}`);
    }

    const status = await response.json();

    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'PDFUA conversion failed');
    }

    // Wait before the next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Job timed out after ~${POLL_MAX_MINUTES} minutes`);
}

// Process PDFUA conversion
async function processPDFUA(bullJob: BullJob<PDFUAJobData>): Promise<string> {
  const { jobId, userId, inputFilePath, originalName, notifyEmail } = bullJob.data;
  let gpuAllocation: Awaited<ReturnType<typeof acquireGpuSlot>> | null = null;

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
    gpuAllocation = await acquireGpuSlot('pdfua', bullJob.id);

    const fileSize = fs.statSync(inputFilePath).size;

    console.log(`[PDFUAWorker] Processing: ${originalName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Update progress
    updateJob(jobId, { progressStage: 'converting', progressPercent: 10 });
    await publishJobEvent(jobId, userId, 'progress', {
      stage: 'converting',
      percent: 10,
    });

    // Send to PDFUA service using axios for reliable file uploads
    const axios = (await import('axios')).default;
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(inputFilePath), {
      filename: originalName,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    const convertResponse = await axios.post(`${PDFUA_SERVICE_URL}/convert`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const serviceJobId = convertResponse.data.job_id;
    console.log(`[PDFUAWorker] PDFUA service job started: ${serviceJobId}`);

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
        const statusResponse = await fetch(`${PDFUA_SERVICE_URL}/jobs/${serviceJobId}`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          const newPercent = Math.min(90, 20 + Math.floor((status.progress?.percentage || 0) * 0.7));

          if (newPercent > lastPercent) {
            lastPercent = newPercent;
            const phase = status.progress?.phase || 'processing';

            updateJob(jobId, {
              progressStage: phase,
              progressPercent: newPercent
            });
            await publishJobEvent(jobId, userId, 'progress', {
              stage: phase,
              percent: newPercent,
              details: status.progress,
            });
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, POLL_INTERVAL_MS);

    // Wait for completion
    let finalStatus;
    try {
      finalStatus = await pollPdfuaJobStatus(serviceJobId);
    } finally {
      clearInterval(pollInterval);
    }

    // Update progress
    updateJob(jobId, { progressStage: 'finalizing', progressPercent: 95 });
    await publishJobEvent(jobId, userId, 'progress', {
      stage: 'finalizing',
      percent: 95,
    });

    // Store result metadata
    const resultPath = tmpPath(`pdfua_${jobId}.json`);
    fs.writeFileSync(resultPath, JSON.stringify({
      serviceJobId,
      pdfuaCompliant: finalStatus.result?.pdfua_compliant || false,
      processingTime: finalStatus.result?.processing_time_seconds || 0,
      originalName,
    }));

    // Update job as completed
    updateJob(jobId, {
      status: 'completed',
      progressStage: 'done',
      progressPercent: 100,
      resultFilePath: resultPath,
      resultData: {
        serviceJobId,
        pdfuaCompliant: finalStatus.result?.pdfua_compliant || false,
        processingTime: finalStatus.result?.processing_time_seconds || 0,
      },
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'completed');

    await publishJobEvent(jobId, userId, 'completed', {
      status: 'completed',
      percent: 100,
      result: {
        serviceJobId,
        pdfuaCompliant: finalStatus.result?.pdfua_compliant || false,
        downloadUrl: `/api/convert-pptx/jobs/${serviceJobId}/download`,
      },
    });

    console.log(`[PDFUAWorker] Completed: ${jobId} - PDF/UA: ${finalStatus.result?.pdfua_compliant}`);

    // Send email notification if requested
    if (notifyEmail) {
      const emailResult = await sendConversionCompleteEmail(
        notifyEmail,
        originalName,
        serviceJobId,
        true, // success
        finalStatus.result?.pdfua_compliant || false
      );
      if (emailResult.success) {
        console.log(`[PDFUAWorker] Email notification sent for job ${jobId}`);
      } else {
        console.error(`[PDFUAWorker] Failed to send email for job ${jobId}:`, emailResult.error);
      }
    }

    // Cleanup input file
    cleanupFile(inputFilePath);

    return resultPath;
  } catch (error: any) {
    console.error(`[PDFUAWorker] Failed: ${jobId}`, error);

    // Update job as failed
    updateJob(jobId, {
      status: 'failed',
      errorMessage: error.message || 'PDFUA conversion failed',
      completedAt: new Date(),
    });

    finalizeCreditsForJob(jobId, 'failed');

    await publishJobEvent(jobId, userId, 'failed', {
      status: 'failed',
      error: error.message || 'PDFUA conversion failed',
    });

    // Send failure email notification if requested
    if (notifyEmail) {
      const emailResult = await sendConversionCompleteEmail(
        notifyEmail,
        originalName,
        jobId,
        false, // failure
        false
      );
      if (emailResult.success) {
        console.log(`[PDFUAWorker] Failure notification sent for job ${jobId}`);
      } else {
        console.error(`[PDFUAWorker] Failed to send failure email for job ${jobId}:`, emailResult.error);
      }
    }

    // Cleanup input file
    cleanupFile(inputFilePath);

    throw error;
  } finally {
    releaseGpuSlot(gpuAllocation);
  }
}

// Create and start the worker
export function startPDFUAWorker() {
  const worker = new Worker<PDFUAJobData>(
    'pdfua-conversion',
    processPDFUA,
    {
      connection: queueConnection,
      concurrency: getQueueConcurrency('pdfua'),
    }
  );

  worker.on('ready', () => {
    console.log('[PDFUAWorker] Ready and waiting for jobs');
  });

  worker.on('completed', (job) => {
    console.log(`[PDFUAWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[PDFUAWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[PDFUAWorker] Worker error:', err);
  });

  return worker;
}

// Export for use in routes
export { processPDFUA };
