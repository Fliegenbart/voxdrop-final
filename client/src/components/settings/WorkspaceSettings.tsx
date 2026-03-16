import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Copy, FolderPlus, Loader2, Trash2, UserPlus, Users } from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  plan_id: string;
  role?: string;
}

interface WorkspaceMember {
  id: number;
  user_id: number;
  email: string;
  role: "owner" | "creator" | "admin" | "billing_admin" | "reviewer" | "viewer";
  seat_type: "creator" | "reviewer";
  created_at: string;
}

interface WorkspaceInvite {
  id: string;
  email: string;
  role: "owner" | "creator";
  status: "pending" | "accepted" | "revoked" | "expired";
  token?: string;
  created_at: string;
  expires_at: string;
}

interface WorkspaceProject {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

const roleLabel: Record<WorkspaceMember["role"], string> = {
  owner: "Owner",
  creator: "Creator",
  admin: "Admin",
  billing_admin: "Billing",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export function WorkspaceSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "creator">("creator");
  const [inviteLoading, setInviteLoading] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projectLoading, setProjectLoading] = useState(false);

  const activeWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === activeWorkspaceId) || null,
    [workspaces, activeWorkspaceId]
  );

  const currentMember = useMemo(
    () => members.find((member) => member.user_id === user?.id) || null,
    [members, user?.id]
  );

  const isOwner = currentMember?.role === "owner";
  const ownerCount = members.filter((member) => member.role === "owner").length;

  useEffect(() => {
    let cancelled = false;
    const loadWorkspaces = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/workspaces", { credentials: "include" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.error || "Workspaces konnten nicht geladen werden.");
        }
        const data = await response.json();
        if (cancelled) return;
        setWorkspaces(data.workspaces || []);
        const initialId = data.defaultWorkspaceId || data.workspaces?.[0]?.id || null;
        setActiveWorkspaceId(initialId);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Fehler",
            description: err instanceof Error ? err.message : "Workspaces konnten nicht geladen werden.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    const loadWorkspaceDetails = async () => {
      setDetailsLoading(true);
      try {
        const [membersRes, invitesRes, projectsRes] = await Promise.all([
          fetch(`/api/workspaces/${activeWorkspaceId}/members`, { credentials: "include" }),
          fetch(`/api/workspaces/${activeWorkspaceId}/invites`, { credentials: "include" }),
          fetch(`/api/workspaces/${activeWorkspaceId}/projects`, { credentials: "include" }),
        ]);

        if (!membersRes.ok || !invitesRes.ok || !projectsRes.ok) {
          throw new Error("Workspace-Daten konnten nicht geladen werden.");
        }

        const membersData = await membersRes.json();
        const invitesData = await invitesRes.json();
        const projectsData = await projectsRes.json();
        if (cancelled) return;
        setMembers(membersData.members || []);
        setInvites(invitesData.invites || []);
        setProjects(projectsData.projects || []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Fehler",
            description: err instanceof Error ? err.message : "Workspace-Daten konnten nicht geladen werden.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    };

    loadWorkspaceDetails();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, toast]);

  const handleInvite = async () => {
    if (!activeWorkspaceId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Einladung konnte nicht erstellt werden.");
      }
      setInvites((prev) => [data.invite, ...prev]);
      setInviteEmail("");
      toast({
        title: "Einladung versendet",
        description: `Einladungslink wurde an ${data.invite.email} gesendet.`,
      });
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Einladung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!activeWorkspaceId) return;
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/invites/${inviteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Einladung konnte nicht widerrufen werden.");
      }
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Einladung konnte nicht widerrufen werden.",
        variant: "destructive",
      });
    }
  };

  const handleCopyInvite = async (invite: WorkspaceInvite) => {
    if (!invite.token) {
      toast({
        title: "Hinweis",
        description: "Der Einladungslink ist nicht verfügbar.",
      });
      return;
    }
    const link = `${window.location.origin}/workspace-invite?token=${invite.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: "Link kopiert",
        description: "Der Einladungslink wurde in die Zwischenablage kopiert.",
      });
    } catch (err) {
      toast({
        title: "Fehler",
        description: "Link konnte nicht kopiert werden.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!activeWorkspaceId) return;
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/members/${memberId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Mitglied konnte nicht entfernt werden.");
      }
      setMembers((prev) => prev.filter((member) => member.id !== memberId));
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Mitglied konnte nicht entfernt werden.",
        variant: "destructive",
      });
    }
  };

  const handleCreateProject = async () => {
    if (!activeWorkspaceId || !projectName.trim()) return;
    setProjectLoading(true);
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: projectName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Projekt konnte nicht erstellt werden.");
      }
      setProjects((prev) => [data.project, ...prev]);
      setProjectName("");
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Projekt konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setProjectLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!activeWorkspaceId) return;
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Projekt konnte nicht gelöscht werden.");
      }
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Projekt konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Workspace wird geladen...</span>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-600">Es wurde kein Workspace gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Workspace</h2>
            <p className="text-sm text-slate-600">
              Team-Ordner, Mitglieder und Projekte verwalten.
            </p>
          </div>
          {workspaces.length > 1 && (
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={activeWorkspaceId || ""}
              onChange={(event) => setActiveWorkspaceId(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="text-slate-500">Plan</span>
            <div className="font-medium text-slate-900">{activeWorkspace.plan_id}</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="text-slate-500">Mitglieder</span>
            <div className="font-medium text-slate-900">{members.length}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Teammitglieder
          </h3>
          {detailsLoading ? <span className="text-xs text-slate-400">Aktualisiert...</span> : null}
        </div>
        <div className="divide-y divide-slate-100">
          {members.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Noch keine Mitglieder.</p>
          ) : (
            members.map((member) => {
              const disableRemove = !isOwner || member.role === "owner" && ownerCount <= 1;
              const isSelf = member.user_id === user?.id;
              return (
                <div key={member.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{member.email}</p>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{roleLabel[member.role]}</span>
                      {isSelf ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-600">Du</span> : null}
                    </div>
                  </div>
                  {isOwner && !isSelf && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={disableRemove}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Entfernen
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Team einladen
        </h3>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="email"
            placeholder="name@behörde.de"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
          />
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value === "owner" ? "owner" : "creator")}
          >
            <option value="creator">Creator</option>
            <option value="owner">Owner</option>
          </select>
          <Button type="button" onClick={handleInvite} disabled={inviteLoading || !inviteEmail.trim()}>
            {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Einladung senden
          </Button>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {invites.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Keine offenen Einladungen.</p>
          ) : (
            invites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-1">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">{invite.role === "owner" ? "Owner" : "Creator"}</span>
                    <span>Läuft ab: {new Date(invite.expires_at).toLocaleDateString("de-DE")}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleCopyInvite(invite)}>
                    <Copy className="w-3.5 h-3.5" />
                    Link kopieren
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleRevokeInvite(invite.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Widerrufen
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <FolderPlus className="w-4 h-4" />
          Projekte / Ordner
        </h3>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Projektname"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <Button type="button" onClick={handleCreateProject} disabled={projectLoading || !projectName.trim()}>
            {projectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Projekt anlegen
          </Button>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {projects.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Noch keine Projekte angelegt.</p>
          ) : (
            projects.map((project) => (
              <div key={project.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-500">Erstellt: {new Date(project.created_at).toLocaleDateString("de-DE")}</p>
                </div>
                {isOwner && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteProject(project.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Löschen
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
