import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware';
import {
  getWorkspacesForUser,
  getUserDefaultWorkspaceId,
  getWorkspaceMember,
  getWorkspaceMembersWithUser,
  getWorkspaceMemberById,
  countWorkspaceOwners,
  removeWorkspaceMember,
  createWorkspaceMember,
  getWorkspaceProjects,
  createWorkspaceProject,
  deleteWorkspaceProject,
  getWorkspaceProjectById,
  getUserByEmail,
  createWorkspaceInvite,
  getWorkspaceInvitesForWorkspace,
  getWorkspaceInviteByToken,
  markWorkspaceInviteAccepted,
  revokeWorkspaceInvite,
} from '../db/queries';
import { sendWorkspaceInviteEmail } from '../email/service';

const router = Router();

router.use(requireAuth);

const isWorkspaceOwnerOrCreator = (role?: string | null) => {
  return role === 'owner' || role === 'creator';
};

router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const workspaces = getWorkspacesForUser(userId);
  const defaultWorkspaceId = getUserDefaultWorkspaceId(userId);

  const withRole = workspaces.map((workspace) => {
    const membership = getWorkspaceMember(workspace.id, userId);
    return {
      ...workspace,
      role: membership?.role || 'creator',
    };
  });

  res.json({
    workspaces: withRole,
    defaultWorkspaceId,
  });
});

router.get('/:id/members', (req: Request, res: Response) => {
  const { id } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const members = getWorkspaceMembersWithUser(id);
  res.json({ members });
});

router.delete('/:id/members/:memberId', (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const memberIdNum = Number(memberId);
  if (!Number.isFinite(memberIdNum)) {
    return res.status(400).json({ error: 'Ungültige Mitglieds-ID' });
  }

  const member = getWorkspaceMemberById(memberIdNum);
  if (!member || member.workspace_id !== id || member.status !== 'active') {
    return res.status(404).json({ error: 'Mitglied nicht gefunden' });
  }

  if (member.role === 'owner') {
    const ownerCount = countWorkspaceOwners(id);
    if (ownerCount <= 1) {
      return res.status(400).json({ error: 'Der letzte Owner kann nicht entfernt werden' });
    }
  }

  const success = removeWorkspaceMember(memberIdNum, id);
  if (!success) {
    return res.status(500).json({ error: 'Mitglied konnte nicht entfernt werden' });
  }

  res.json({ success: true });
});

router.post('/:id/members', (req: Request, res: Response) => {
  const { id } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || !isWorkspaceOwnerOrCreator(membership.role)) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json({ error: 'E-Mail fehlt' });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'Nutzer nicht gefunden. Bitte zuerst registrieren.' });
  }

  const member = createWorkspaceMember(id, user.id, 'creator', 'creator', 'active');
  return res.json({ member });
});

router.get('/:id/invites', (req: Request, res: Response) => {
  const { id } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || !isWorkspaceOwnerOrCreator(membership.role)) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const invites = getWorkspaceInvitesForWorkspace(id);
  res.json({ invites });
});

router.post('/:id/invites', async (req: Request, res: Response) => {
  const { id } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || !isWorkspaceOwnerOrCreator(membership.role)) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json({ error: 'E-Mail fehlt' });
  }

  const role = req.body?.role === 'owner' ? 'owner' : 'creator';
  const invite = createWorkspaceInvite(id, email, req.user!.id, role);

  const workspace = getWorkspacesForUser(req.user!.id).find(ws => ws.id === id);
  const name = workspace?.name || 'VoxDrop Workspace';

  const appUrl = process.env.APP_URL || 'https://voxdrop.live';
  const inviteUrl = `${appUrl}/workspace-invite?token=${invite.token}`;
  const inviter = req.user?.email || 'VoxDrop Team';

  try {
    await sendWorkspaceInviteEmail(email, name, inviter, inviteUrl);
  } catch (err) {
    console.error('[Workspace] Failed to send invite email:', err);
  }

  return res.json({ invite: { ...invite, token: invite.token } });
});

router.post('/invites/accept', (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ error: 'Token fehlt' });
  }

  const invite = getWorkspaceInviteByToken(token);
  if (!invite) {
    return res.status(404).json({ error: 'Einladung nicht gefunden' });
  }

  if (invite.status !== 'pending') {
    return res.status(400).json({ error: 'Einladung ist nicht mehr gültig' });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Einladung ist abgelaufen' });
  }

  const userEmail = req.user!.email.toLowerCase();
  if (userEmail !== invite.email.toLowerCase()) {
    return res.status(403).json({ error: 'Diese Einladung gehört zu einer anderen E-Mail-Adresse' });
  }

  createWorkspaceMember(invite.workspace_id, req.user!.id, invite.role, 'creator', 'active');
  markWorkspaceInviteAccepted(invite.id);

  return res.json({ success: true, workspaceId: invite.workspace_id });
});

router.delete('/:id/invites/:inviteId', (req: Request, res: Response) => {
  const { id, inviteId } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || !isWorkspaceOwnerOrCreator(membership.role)) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const success = revokeWorkspaceInvite(inviteId, id);
  if (!success) {
    return res.status(404).json({ error: 'Einladung nicht gefunden' });
  }

  res.json({ success: true });
});

router.get('/:id/projects', (req: Request, res: Response) => {
  const { id } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const projects = getWorkspaceProjects(id);
  res.json({ projects });
});

router.post('/:id/projects', (req: Request, res: Response) => {
  const { id } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || !isWorkspaceOwnerOrCreator(membership.role)) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : null;
  if (!name) {
    return res.status(400).json({ error: 'Projektname fehlt' });
  }

  const project = createWorkspaceProject(id, name, req.user!.id, description || null);
  res.json({ project });
});

router.delete('/:id/projects/:projectId', (req: Request, res: Response) => {
  const { id, projectId } = req.params;
  const membership = getWorkspaceMember(id, req.user!.id);
  if (!membership || !isWorkspaceOwnerOrCreator(membership.role)) {
    return res.status(403).json({ error: 'Kein Zugriff auf den Workspace' });
  }

  const project = getWorkspaceProjectById(projectId);
  if (!project || project.workspace_id !== id) {
    return res.status(404).json({ error: 'Projekt nicht gefunden' });
  }

  const success = deleteWorkspaceProject(projectId, id);
  if (!success) {
    return res.status(500).json({ error: 'Projekt konnte nicht gelöscht werden' });
  }

  res.json({ success: true });
});

export default router;
