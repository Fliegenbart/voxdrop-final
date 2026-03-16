import { History, Loader2, RefreshCw, Clock3, FolderOpen, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecentSessionSummary } from "@/hooks/use-session";

interface SessionHistoryPanelProps {
  sessions: RecentSessionSummary[];
  currentSessionId: string | null;
  isLoading: boolean;
  openingSessionId?: string | null;
  onRefresh: () => void;
  onOpenSession: (sessionId: string) => void;
  formatFileSize: (bytes: number) => string;
}

function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "laeuft gerade ab";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function SessionHistoryPanel({
  sessions,
  currentSessionId,
  isLoading,
  openingSessionId,
  onRefresh,
  onOpenSession,
  formatFileSize,
}: SessionHistoryPanelProps) {
  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <History className="w-4 h-4 text-violet-600" />
            24h-Sessions
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Hier siehst du alle noch aktiven Videos aus deinen Sessions der letzten 24 Stunden.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {isLoading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Sessions werden geladen
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Noch keine aktiven 24h-Sessions gefunden.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const videoFiles = session.files.filter((file) => file.mimeType.startsWith("video/"));
            const isCurrent = currentSessionId === session.sessionId;

            return (
              <div
                key={session.sessionId}
                className={`rounded-xl border p-4 transition-colors ${
                  isCurrent ? "border-violet-300 bg-violet-50/70" : "border-slate-200 bg-slate-50/70"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        Session {session.sessionId.slice(0, 8)}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white">
                          aktiv
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Clock3 className="w-3 h-3" />
                        aktiv bis in {formatTimeRemaining(session.expiresAt)}
                      </span>
                      <span>{session.videoCount} Videos</span>
                      <span>{session.fileCount} Dateien</span>
                      <span>zuletzt genutzt {formatDate(session.lastAccessedAt)}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isCurrent ? "secondary" : "default"}
                    className={isCurrent ? "" : "bg-violet-600 hover:bg-violet-700"}
                    onClick={() => onOpenSession(session.sessionId)}
                    disabled={openingSessionId === session.sessionId || isCurrent}
                  >
                    {openingSessionId === session.sessionId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Oeffnen
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {videoFiles.length > 0 ? (
                    videoFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 border border-slate-100"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <Video className="w-4 h-4 text-violet-600 flex-shrink-0" />
                          <span className="truncate text-sm text-slate-900">{file.name}</span>
                        </div>
                        <div className="flex-shrink-0 text-xs text-slate-500">
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg bg-white/80 px-3 py-2 border border-slate-100 text-sm text-slate-500">
                      In dieser Session liegen aktuell keine Video-Dateien.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
