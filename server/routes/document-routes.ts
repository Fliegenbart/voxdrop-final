import { Router, Request, Response } from 'express';
import fs from 'fs';
import { requireAuth } from '../auth/middleware';
import { getUserRecordings, getWorkspaceRecordings } from '../db/queries';
import { getWorkspaceMember } from '../db/queries';
import { getUserFiles, getWorkspaceFiles } from '../services/file-sharing';
import { getJobsForUser, getJobsForWorkspace } from '../queue';

const router = Router();

router.use(requireAuth);

router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const scope = req.query.scope === 'workspace' ? 'workspace' : 'user';
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;

  if (scope === 'workspace') {
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId fehlt' });
    }
    const membership = getWorkspaceMember(workspaceId, userId);
    if (!membership) {
      return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
    }
  }

  const recordings = scope === 'workspace' && workspaceId
    ? getWorkspaceRecordings(workspaceId, projectId)
    : getUserRecordings(userId);

  const sharedFiles = scope === 'workspace' && workspaceId
    ? getWorkspaceFiles(workspaceId, projectId)
    : getUserFiles(userId);

  const jobs = scope === 'workspace' && workspaceId
    ? getJobsForWorkspace(workspaceId, 200)
    : getJobsForUser(userId, 200);

  const jobDocs = jobs
    .filter(job => job.status === 'completed' && job.result_file_path)
    .filter(job => !projectId || job.project_id === projectId)
    .map(job => {
      let title = job.id;
      try {
        const inputData = job.input_data ? JSON.parse(job.input_data) : null;
        if (inputData?.originalName) {
          title = inputData.originalName;
        }
      } catch {
        // ignore parse errors
      }

      let size: number | null = null;
      try {
        if (job.result_file_path && fs.existsSync(job.result_file_path)) {
          size = fs.statSync(job.result_file_path).size;
        }
      } catch {
        size = null;
      }

      return {
        id: job.id,
        type: 'job',
        title,
        size,
        mimeType: null,
        createdAt: job.created_at,
        downloadUrl: `/api/jobs/${job.id}/result`,
        workspaceId: job.workspace_id,
        projectId: job.project_id,
      };
    });

  const recordingDocs = recordings.map(r => ({
    id: r.id,
    type: 'recording',
    title: r.original_name,
    size: r.file_size,
    mimeType: r.mime_type,
    createdAt: r.created_at,
    downloadUrl: `/api/recordings/${r.id}/download`,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
  }));

  const sharedDocs = sharedFiles.map(f => ({
    id: f.id,
    type: 'shared',
    title: f.original_name,
    size: f.file_size,
    mimeType: f.mime_type,
    createdAt: f.created_at,
    downloadUrl: `/f/${f.token}`,
    workspaceId: f.workspace_id,
    projectId: f.project_id,
  }));

  const documents = [...jobDocs, ...recordingDocs, ...sharedDocs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ documents });
});

export default router;

