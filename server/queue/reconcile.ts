import db from '../db/init';
import { updateJob } from './job-store';
import { publishJobEvent } from './sse-manager';
import { podcastQueue, subtitleEmbedQueue, transcriptionQueue } from './queues';
import fs from 'fs';
import { tmpPath } from '../utils/tmp';
import { inferJobErrorCode, sanitizeErrorMessage } from './job-error-codes';

type ActiveJobRow = {
  id: string;
  queue: string;
  user_id: number | null;
  started_at: string | null;
  last_heartbeat_at: string | null;
  retry_count: number;
};

/**
 * Best-effort reconciliation for jobs that got out of sync:
 * BullMQ can mark jobs as failed (e.g. "stalled") without our processors running,
 * which leaves the SQL job-store in a perpetual "active" state and the UI hanging.
 *
 * We only reconcile jobs older than a threshold to avoid interfering with legitimate long-running jobs.
 */
export async function reconcileStuckSubtitleEmbedJobs(opts?: {
  olderThanMinutes?: number;
  limit?: number;
}) {
  const olderThanMinutes = Math.max(1, Math.floor(opts?.olderThanMinutes ?? 10));
  const limit = Math.max(1, Math.floor(opts?.limit ?? 50));

  const rows = db.prepare(
    `
    SELECT id, queue, user_id, started_at, last_heartbeat_at, retry_count
    FROM jobs
    WHERE queue = 'subtitle-embed'
      AND status = 'active'
      AND started_at IS NOT NULL
      AND datetime(started_at) < datetime('now', ?)
    ORDER BY started_at ASC
    LIMIT ?
    `
  ).all(`-${olderThanMinutes} minutes`, limit) as ActiveJobRow[];

  if (!rows.length) return;

  console.warn(`[Reconcile] Checking ${rows.length} stuck subtitle-embed job(s)`);

  for (const row of rows) {
    try {
      const fallbackResultFilePath = tmpPath(`subtitled_${row.id}.mp4`);
      const bullJob = await subtitleEmbedQueue.getJob(row.id);
      if (!bullJob) {
        if (fs.existsSync(fallbackResultFilePath)) {
          updateJob(row.id, {
            status: 'completed',
            progressStage: 'done',
            progressPercent: 100,
            resultFilePath: fallbackResultFilePath,
            completedAt: new Date(),
          });
          if (typeof row.user_id === 'number') {
            publishJobEvent(row.id, row.user_id, 'completed', {
              status: 'completed',
              percent: 100,
              resultFilePath: fallbackResultFilePath,
            }).catch(() => {});
          }
        } else {
          const reason = 'Embedding job missing from queue (reconciled)';
          updateJob(row.id, {
            status: 'failed',
            progressStage: 'failed',
            errorMessage: reason,
            completedAt: new Date(),
          });
          if (typeof row.user_id === 'number') {
            publishJobEvent(row.id, row.user_id, 'failed', {
              status: 'failed',
              error: reason,
            }).catch(() => {});
          }
        }
        continue;
      }

      const state = await bullJob.getState();
      if (state === 'failed') {
        const reason = bullJob.failedReason || 'Embedding failed';
        updateJob(row.id, {
          status: 'failed',
          progressStage: 'failed',
          errorMessage: reason,
          completedAt: new Date(),
        });
        if (typeof row.user_id === 'number') {
          publishJobEvent(row.id, row.user_id, 'failed', {
            status: 'failed',
            error: reason,
          }).catch(() => {});
        }
      } else if (state === 'completed') {
        const returnValue = (bullJob as any).returnvalue;
        const resultFilePath = typeof returnValue === 'string' ? returnValue : (fs.existsSync(fallbackResultFilePath) ? fallbackResultFilePath : undefined);
        updateJob(row.id, {
          status: 'completed',
          progressStage: 'done',
          progressPercent: 100,
          resultFilePath,
          completedAt: new Date(),
        });
        if (typeof row.user_id === 'number') {
          publishJobEvent(row.id, row.user_id, 'completed', {
            status: 'completed',
            percent: 100,
            resultFilePath,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[Reconcile] Failed to reconcile subtitle-embed job ${row.id}:`, err);
    }
  }
}

function resolveQueue(queueName: string) {
  if (queueName === 'subtitle-embed') return subtitleEmbedQueue;
  if (queueName === 'podcast') return podcastQueue;
  if (queueName === 'transcription') return transcriptionQueue;
  return null;
}

export async function reconcileStaleHeartbeatJobs(opts?: {
  staleAfterMinutes?: number;
  limit?: number;
}) {
  const staleAfterMinutes = Math.max(1, Math.floor(opts?.staleAfterMinutes ?? 10));
  const limit = Math.max(1, Math.floor(opts?.limit ?? 50));
  const rows = db.prepare(
    `
    SELECT id, queue, user_id, started_at, last_heartbeat_at, retry_count
    FROM jobs
    WHERE status = 'active'
      AND queue IN ('podcast', 'subtitle-embed', 'transcription')
      AND last_heartbeat_at IS NOT NULL
      AND datetime(last_heartbeat_at) < datetime('now', ?)
    ORDER BY last_heartbeat_at ASC
    LIMIT ?
    `
  ).all(`-${staleAfterMinutes} minutes`, limit) as ActiveJobRow[];

  if (!rows.length) return;

  console.warn(`[Reconcile] Checking ${rows.length} stale heartbeat job(s)`);

  for (const row of rows) {
    try {
      const queue = resolveQueue(row.queue);
      if (!queue) continue;

      const bullJob = await queue.getJob(row.id);
      if (!bullJob) {
        const message = 'stale_job_missing_queue_entry';
        updateJob(row.id, {
          status: 'failed',
          phase: 'failed',
          progressStage: 'failed',
          errorMessage: message,
          errorCode: inferJobErrorCode(message),
          completedAt: new Date(),
        });
        if (typeof row.user_id === 'number') {
          publishJobEvent(row.id, row.user_id, 'failed', {
            status: 'failed',
            error: message,
            errorCode: inferJobErrorCode(message),
          }).catch(() => {});
        }
        continue;
      }

      const state = await bullJob.getState();
      if (state === 'completed') {
        // Worker may have completed but DB heartbeat/status is stale.
        updateJob(row.id, {
          status: 'completed',
          phase: 'done',
          progressStage: 'done',
          progressPercent: 100,
          completedAt: new Date(),
        });
        if (typeof row.user_id === 'number') {
          publishJobEvent(row.id, row.user_id, 'completed', {
            status: 'completed',
            percent: 100,
          }).catch(() => {});
        }
        continue;
      }

      if (state === 'failed') {
        const failedReason = sanitizeErrorMessage((bullJob as any).failedReason || 'stale_job_failed');
        const errorCode = inferJobErrorCode(failedReason);
        updateJob(row.id, {
          status: 'failed',
          phase: 'failed',
          progressStage: 'failed',
          errorMessage: failedReason,
          errorCode,
          completedAt: new Date(),
        });
        if (typeof row.user_id === 'number') {
          publishJobEvent(row.id, row.user_id, 'failed', {
            status: 'failed',
            error: failedReason,
            errorCode,
          }).catch(() => {});
        }
        continue;
      }

      // For stale active jobs we switch the DB view to pending/retrying.
      // BullMQ will continue lock/stalled handling and pick it up once resources are available.
      if ((row.retry_count || 0) >= 1) {
        const message = 'stale_heartbeat_exceeded';
        updateJob(row.id, {
          status: 'failed',
          phase: 'failed',
          progressStage: 'failed',
          errorMessage: message,
          errorCode: inferJobErrorCode('provider_timeout'),
          completedAt: new Date(),
        });
        if (typeof row.user_id === 'number') {
          publishJobEvent(row.id, row.user_id, 'failed', {
            status: 'failed',
            error: message,
            errorCode: inferJobErrorCode('provider_timeout'),
          }).catch(() => {});
        }
        continue;
      }

      const message = 'stale_heartbeat_detected_requeue_pending';
      updateJob(row.id, {
        status: 'pending',
        phase: 'retrying',
        progressStage: 'retrying',
        progressPercent: 20,
        retryCount: Math.max(0, (row.retry_count || 0) + 1),
        errorMessage: message,
        errorCode: inferJobErrorCode('provider_timeout'),
        lastHeartbeatAt: new Date(),
      });
      if (typeof row.user_id === 'number') {
        publishJobEvent(row.id, row.user_id, 'progress', {
          status: 'pending',
          stage: 'retrying',
          percent: 20,
          errorCode: inferJobErrorCode('provider_timeout'),
          message: 'Job war ohne Heartbeat und wurde in pending/retrying ueberfuehrt.',
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`[Reconcile] Failed stale heartbeat reconcile for job ${row.id}:`, err);
    }
  }
}
