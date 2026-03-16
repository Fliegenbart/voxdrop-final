import type { User } from '../types/auth';
import {
  getOrCreateDefaultWorkspaceForUser,
  getUserDefaultWorkspaceId,
  getWorkspaceMember,
  getWorkspaceProjectById,
  type StorageScope,
} from '../db/queries';

export interface StorageTarget {
  scope: StorageScope;
  workspaceId?: string | null;
  projectId?: string | null;
}

export const resolveStorageTarget = (
  user: User,
  input: { scope?: string; workspaceId?: string; projectId?: string }
): StorageTarget => {
  const scope: StorageScope = input.scope === 'workspace' ? 'workspace' : 'user';

  if (scope === 'user') {
    return { scope: 'user' };
  }

  const rawWorkspaceId = input.workspaceId || getUserDefaultWorkspaceId(user.id);
  const workspace = rawWorkspaceId
    ? (getWorkspaceMember(rawWorkspaceId, user.id) ? rawWorkspaceId : null)
    : getOrCreateDefaultWorkspaceForUser(user).id;

  if (!workspace) {
    throw new Error('workspace_forbidden');
  }

  if (input.projectId) {
    const project = getWorkspaceProjectById(input.projectId);
    if (!project || project.workspace_id !== workspace) {
      throw new Error('project_forbidden');
    }
    return { scope, workspaceId: workspace, projectId: input.projectId };
  }

  return { scope, workspaceId: workspace };
};

