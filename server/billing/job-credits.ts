import { getJob, updateJob } from '../queue/job-store';
import { consumeCredits, releaseCredits, hasFinalCreditLedgerEntryForJob } from '../db/queries';

export type JobFinalStatus = 'completed' | 'failed' | 'cancelled';

export function finalizeCreditsForJob(jobId: string, status: JobFinalStatus): void {
  const job = getJob(jobId);
  if (!job) return;
  if (!job.workspace_id) return;

  const estimated = Math.max(0, Math.floor(job.estimated_credits || 0));
  if (estimated <= 0) return;

  if (hasFinalCreditLedgerEntryForJob(job.workspace_id, jobId)) {
    return;
  }

  try {
    if (status === 'completed') {
      consumeCredits(job.workspace_id, estimated, jobId, {
        status,
        queue: job.queue,
        jobType: job.job_type,
      });

      updateJob(jobId, { consumedCredits: estimated });
      return;
    }

    releaseCredits(job.workspace_id, estimated, jobId, {
      status,
      queue: job.queue,
      jobType: job.job_type,
    });
  } catch (error) {
    // If credits were never reserved (or already finalized), don't block job completion.
    console.warn('[Credits] finalizeCreditsForJob failed:', (error as Error)?.message || error);
  }
}

