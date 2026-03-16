import db from '../db/init';

export interface Job {
  id: string;
  queue: string;
  user_id: number | null;
  workspace_id: string | null;
  project_id: string | null;
  storage_scope: 'user' | 'workspace' | null;
  job_type: string | null;
  estimated_credits: number;
  consumed_credits: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
  priority: number;
  input_data: string | null;
  result_data: string | null;
  result_file_path: string | null;
  progress_stage: string | null;
  phase: string | null;
  progress_percent: number;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  gpu_wait_ms: number;
  last_heartbeat_at: string | null;
  queue_attempt: number;
  queued_at: string | null;
  finished_at: string | null;
  input_path: string | null;
  input_checksum: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface CreateJobInput {
  id: string;
  queue: string;
  userId: number | null;
  workspaceId?: string | null;
  projectId?: string | null;
  storageScope?: 'user' | 'workspace';
  jobType?: string | null;
  estimatedCredits?: number;
  priority?: number;
  inputData?: Record<string, any>;
  inputPath?: string | null;
  inputChecksum?: string | null;
  phase?: string | null;
  expiresInHours?: number;
}

export interface UpdateJobInput {
  status?: Job['status'];
  progressStage?: string;
  phase?: string;
  progressPercent?: number;
  resultData?: Record<string, any>;
  resultFilePath?: string;
  errorMessage?: string;
  errorCode?: string | null;
  retryCount?: number;
  gpuWaitMs?: number;
  lastHeartbeatAt?: Date;
  queueAttempt?: number;
  queuedAt?: Date;
  finishedAt?: Date;
  inputPath?: string | null;
  inputChecksum?: string | null;
  startedAt?: Date;
  completedAt?: Date;
  jobType?: string | null;
  estimatedCredits?: number;
  consumedCredits?: number;
}

// Create a new job
export function createJob(input: CreateJobInput): Job {
  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default 24h

  const stmt = db.prepare(`
    INSERT INTO jobs (
      id,
      queue,
      user_id,
      workspace_id,
      project_id,
      storage_scope,
      job_type,
      estimated_credits,
      consumed_credits,
      priority,
      input_data,
      input_path,
      input_checksum,
      phase,
      queued_at,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    input.id,
    input.queue,
    input.userId,
    input.workspaceId || null,
    input.projectId || null,
    input.storageScope || 'user',
    input.jobType || null,
    Math.max(0, Math.floor(input.estimatedCredits || 0)),
    0,
    input.priority || 3,
    input.inputData ? JSON.stringify(input.inputData) : null,
    input.inputPath || null,
    input.inputChecksum || null,
    input.phase || null,
    new Date().toISOString(),
    expiresAt
  );

  return getJob(input.id)!;
}

// Get job by ID
export function getJob(jobId: string): Job | null {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  return stmt.get(jobId) as Job | null;
}

// Get job by ID and user (for security - ensure user owns the job)
export function getJobForUser(jobId: string, userId: number): Job | null {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?');
  return stmt.get(jobId, userId) as Job | null;
}

export function getJobForUserOrWorkspace(jobId: string, userId: number): Job | null {
  const stmt = db.prepare(`
    SELECT j.* FROM jobs j
    WHERE j.id = ?
    AND (
      j.user_id = ?
      OR (
        j.storage_scope = 'workspace'
        AND j.workspace_id IN (
          SELECT workspace_id FROM workspace_members
          WHERE user_id = ? AND status = 'active'
        )
      )
    )
  `);
  return stmt.get(jobId, userId, userId) as Job | null;
}

// Update job
export function updateJob(jobId: string, updates: UpdateJobInput): Job | null {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.progressStage !== undefined) {
    fields.push('progress_stage = ?');
    values.push(updates.progressStage);
  }
  if (updates.phase !== undefined) {
    fields.push('phase = ?');
    values.push(updates.phase);
  }
  if (updates.progressPercent !== undefined) {
    fields.push('progress_percent = ?');
    values.push(updates.progressPercent);
  }
  if (updates.resultData !== undefined) {
    fields.push('result_data = ?');
    values.push(JSON.stringify(updates.resultData));
  }
  if (updates.resultFilePath !== undefined) {
    fields.push('result_file_path = ?');
    values.push(updates.resultFilePath);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }
  if (updates.errorCode !== undefined) {
    fields.push('error_code = ?');
    values.push(updates.errorCode);
  }
  if (updates.retryCount !== undefined) {
    fields.push('retry_count = ?');
    values.push(Math.max(0, Math.floor(updates.retryCount)));
  }
  if (updates.gpuWaitMs !== undefined) {
    fields.push('gpu_wait_ms = ?');
    values.push(Math.max(0, Math.floor(updates.gpuWaitMs)));
  }
  if (updates.lastHeartbeatAt !== undefined) {
    fields.push('last_heartbeat_at = ?');
    values.push(updates.lastHeartbeatAt.toISOString());
  }
  if (updates.queueAttempt !== undefined) {
    fields.push('queue_attempt = ?');
    values.push(Math.max(0, Math.floor(updates.queueAttempt)));
  }
  if (updates.queuedAt !== undefined) {
    fields.push('queued_at = ?');
    values.push(updates.queuedAt.toISOString());
  }
  if (updates.finishedAt !== undefined) {
    fields.push('finished_at = ?');
    values.push(updates.finishedAt.toISOString());
  }
  if (updates.inputPath !== undefined) {
    fields.push('input_path = ?');
    values.push(updates.inputPath);
  }
  if (updates.inputChecksum !== undefined) {
    fields.push('input_checksum = ?');
    values.push(updates.inputChecksum);
  }
  if (updates.startedAt !== undefined) {
    fields.push('started_at = ?');
    values.push(updates.startedAt.toISOString());
  }
  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completedAt.toISOString());
  }
  if (updates.jobType !== undefined) {
    fields.push('job_type = ?');
    values.push(updates.jobType);
  }
  if (updates.estimatedCredits !== undefined) {
    fields.push('estimated_credits = ?');
    values.push(Math.max(0, Math.floor(updates.estimatedCredits)));
  }
  if (updates.consumedCredits !== undefined) {
    fields.push('consumed_credits = ?');
    values.push(Math.max(0, Math.floor(updates.consumedCredits)));
  }

  if (fields.length === 0) {
    return getJob(jobId);
  }

  // Increment attempts if status changes to active
  if (updates.status === 'active') {
    fields.push('attempts = attempts + 1');
    fields.push('queue_attempt = queue_attempt + 1');
  }

  if ((updates.status === 'completed' || updates.status === 'failed') && updates.finishedAt === undefined) {
    fields.push('finished_at = ?');
    values.push((updates.completedAt || new Date()).toISOString());
  }

  values.push(jobId);

  const stmt = db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return getJob(jobId);
}

// Get all jobs for a user
export function getJobsForUser(userId: number, limit: number = 50): Job[] {
  const stmt = db.prepare(`
    SELECT * FROM jobs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit) as Job[];
}

export function getJobsForWorkspace(workspaceId: string, limit: number = 50): Job[] {
  const stmt = db.prepare(`
    SELECT * FROM jobs
    WHERE workspace_id = ? AND storage_scope = 'workspace'
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(workspaceId, limit) as Job[];
}

// Delete expired jobs and their files
export function cleanupExpiredJobs(): number {
  // Delete the records
  const result = db.prepare(`
    DELETE FROM jobs WHERE expires_at < datetime('now')
  `).run();

  // Return file paths for cleanup (handled by caller)
  if (result.changes > 0) {
    console.log(`[JobStore] Cleaned up ${result.changes} expired jobs`);
  }

  return result.changes;
}

// Delete a specific job
export function deleteJob(jobId: string): boolean {
  const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
  return result.changes > 0;
}
