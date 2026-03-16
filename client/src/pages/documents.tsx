import { useEffect, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget } from "@/hooks/use-storage-target";
import { useToast } from "@/hooks/use-toast";

interface DocumentItem {
  id: string;
  type: "job" | "recording" | "shared";
  title: string;
  size: number | null;
  mimeType: string | null;
  createdAt: string;
  downloadUrl: string;
  workspaceId?: string | null;
  projectId?: string | null;
}

const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
};

const typeLabel: Record<DocumentItem["type"], string> = {
  job: "Ergebnis",
  recording: "Aufnahme",
  shared: "Datei",
};

export default function Documents() {
  const { target, setTarget } = useStorageTarget("documents");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | DocumentItem["type"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [highlightDocId, setHighlightDocId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const loadDocuments = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("scope", target.scope);
        if (target.workspaceId) params.set("workspaceId", target.workspaceId);
        if (target.projectId) params.set("projectId", target.projectId);

        const response = await fetch(`/api/documents?${params.toString()}`, {
          credentials: "include",
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.error || "Dokumente konnten nicht geladen werden.");
        }
        const data = await response.json();
        if (cancelled) return;
        setDocuments(data.documents || []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Fehler",
            description: err instanceof Error ? err.message : "Dokumente konnten nicht geladen werden.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [target, toast]);

  useEffect(() => {
    if (target.scope !== "workspace" || !target.workspaceId) {
      setProjectMap({});
      return;
    }
    let cancelled = false;
    const loadProjects = async () => {
      try {
        const response = await fetch(`/api/workspaces/${target.workspaceId}/projects`, {
          credentials: "include",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const map: Record<string, string> = {};
        (data.projects || []).forEach((project: { id: string; name: string }) => {
          map[project.id] = project.name;
        });
        setProjectMap(map);
      } catch {
        // ignore project loading errors for filters
      }
    };

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, [target.scope, target.workspaceId]);

  useEffect(() => {
    // Allow deep linking from e-mails: /documents#doc-<id>
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (!hash.startsWith("#doc-")) return;
    const id = hash.slice("#doc-".length);
    if (!id) return;
    setHighlightDocId(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading) return;
    if (!highlightDocId) return;
    const el = document.getElementById(`doc-${highlightDocId}`);
    if (!el) return;
    // Defer to ensure layout is stable.
    window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    const timer = window.setTimeout(() => setHighlightDocId(null), 8000);
    return () => window.clearTimeout(timer);
  }, [highlightDocId, loading, documents]);

  const filteredDocuments = documents.filter((doc) => {
    if (typeFilter !== "all" && doc.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      if (!doc.title.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  return (
    <PageLayout>
      <SEO
        title="Dokumente | VoxDrop"
        description="Gemeinsamer Dokumentenordner für Aufnahmen, Dateien und Konvertierungen."
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">Dokumente</h1>
          <p className="text-slate-600">
            Hier findest du alle gespeicherten Aufnahmen, Dateien und Konvertierungen – privat oder im Team.
          </p>
        </div>

        <StorageTargetPicker
          value={target}
          onChange={setTarget}
          helperText="Wähle, ob du private Dokumente oder Workspace-Dateien sehen möchtest."
        />

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["all", "job", "recording", "shared"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTypeFilter(option)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    typeFilter === option
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {option === "all" ? "Alle" : typeLabel[option]}
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Titel durchsuchen..."
              className="w-full md:w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          {target.scope === "workspace" && target.projectId && projectMap[target.projectId] && (
            <div className="mt-3 text-xs text-slate-500">
              Projektfilter aktiv: <span className="font-medium text-slate-700">{projectMap[target.projectId]}</span>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-medium text-slate-900">Übersicht</h2>
            {loading ? <span className="text-xs text-slate-400">Lädt...</span> : null}
          </div>
          <div className="divide-y divide-slate-100">
            {filteredDocuments.length === 0 && !loading ? (
              <div className="px-6 py-10 text-center text-slate-500">
                Keine Dokumente gefunden.
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  id={`doc-${doc.id}`}
                  className={`flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between ${
                    highlightDocId === doc.id ? "bg-orange-50 ring-2 ring-orange-200" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{doc.title}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{typeLabel[doc.type]}</span>
                      {doc.projectId && projectMap[doc.projectId] ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-600">
                          {projectMap[doc.projectId]}
                        </span>
                      ) : null}
                      <span>{new Date(doc.createdAt).toLocaleString("de-DE")}</span>
                      <span>{formatFileSize(doc.size)}</span>
                    </div>
                  </div>
                  <a
                    href={doc.downloadUrl}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    Download
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
