import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { StorageTarget } from "@/hooks/use-storage-target";

interface WorkspaceInfo {
  id: string;
  name: string;
  role?: string;
}

interface WorkspaceProject {
  id: string;
  name: string;
}

interface StorageTargetPickerProps {
  value: StorageTarget;
  onChange: (value: StorageTarget) => void;
  label?: string;
  helperText?: string;
}

export function StorageTargetPicker({ value, onChange, label = "Speicherort", helperText }: StorageTargetPickerProps) {
  const { isAuthenticated } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWorkspaceId = value.workspaceId || defaultWorkspaceId || workspaces[0]?.id || null;

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const fetchWithAuthRetry = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const mergedOptions: RequestInit = {
        credentials: "include",
        ...options,
      };

      let response = await fetch(url, mergedOptions);
      if (response.status !== 401) return response;

      const refreshed = await refreshSession();
      if (!refreshed) return response;

      return fetch(url, mergedOptions);
    },
    [refreshSession]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadWorkspaces = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithAuthRetry("/api/workspaces");
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Sitzung abgelaufen. Bitte neu einloggen.");
          }
          throw new Error("Workspace-Liste konnte nicht geladen werden.");
        }
        const data = await response.json();
        if (cancelled) return;
        setWorkspaces(data.workspaces || []);
        setDefaultWorkspaceId(data.defaultWorkspaceId || null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fehler beim Laden der Workspaces.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (value.scope !== "workspace") return;
    if (!activeWorkspaceId) return;

    let cancelled = false;
    const loadProjects = async () => {
      setProjectLoading(true);
      try {
        const response = await fetchWithAuthRetry(`/api/workspaces/${activeWorkspaceId}/projects`);
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Sitzung abgelaufen. Bitte neu einloggen.");
          }
          throw new Error("Projekte konnten nicht geladen werden.");
        }
        const data = await response.json();
        if (cancelled) return;
        setProjects(data.projects || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fehler beim Laden der Projekte.");
        }
      } finally {
        if (!cancelled) setProjectLoading(false);
      }
    };

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, value.scope, activeWorkspaceId]);

  useEffect(() => {
    if (value.scope === "workspace" && activeWorkspaceId && value.workspaceId !== activeWorkspaceId) {
      onChange({ ...value, workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId, onChange, value]);

  const workspaceOptions = useMemo(() => {
    return workspaces.map((ws) => ({ id: ws.id, name: ws.name }));
  }, [workspaces]);

  const handleCreateProject = async () => {
    if (!activeWorkspaceId || !projectName.trim()) return;
    setProjectLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(`/api/workspaces/${activeWorkspaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName.trim() }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sitzung abgelaufen. Bitte neu einloggen.");
        }
        const data = await response.json();
        throw new Error(data?.error || "Projekt konnte nicht erstellt werden.");
      }
      const data = await response.json();
      setProjects((prev) => [data.project, ...prev]);
      setProjectName("");
      onChange({ ...value, projectId: data.project.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projekt konnte nicht erstellt werden.");
    } finally {
      setProjectLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">{label}</Label>
          {helperText ? <p className="text-xs text-slate-500 mt-1">{helperText}</p> : null}
        </div>
        {loading ? <span className="text-xs text-slate-400">Lädt...</span> : null}
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="storage-scope"
            checked={value.scope === "user"}
            onChange={() => onChange({ scope: "user" })}
          />
          Mein Bereich (privat)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="storage-scope"
            checked={value.scope === "workspace"}
            onChange={() => onChange({ scope: "workspace", workspaceId: activeWorkspaceId || undefined, projectId: value.projectId || null })}
          />
          Workspace (Team)
        </label>
      </div>

      {value.scope === "workspace" && (
        <div className="space-y-3">
          {workspaceOptions.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Workspace</Label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={activeWorkspaceId || ""}
                onChange={(e) => onChange({ ...value, workspaceId: e.target.value || undefined })}
              >
                {workspaceOptions.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Projekt / Ordner</Label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={value.projectId || ""}
              onChange={(e) => onChange({ ...value, projectId: e.target.value || null })}
            >
              <option value="">Kein Projekt</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {projectLoading ? <p className="text-xs text-slate-400">Projekte laden...</p> : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Neues Projekt"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCreateProject}
              disabled={projectLoading || !projectName.trim()}
            >
              Erstellen
            </Button>
          </div>
        </div>
      )}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
