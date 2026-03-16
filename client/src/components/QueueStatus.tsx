import { useState, useEffect } from "react";
import { Clock, Users, Loader2, Mail, CheckCircle2 } from "lucide-react";

interface QueueStats {
  waiting: number;
  active: number;
  estimatedWaitMinutes: number;
}

interface QueueStatusResponse {
  transcription: QueueStats;
  pdfua: QueueStats;
  ollama: QueueStats;
  video: QueueStats;
  podcast: QueueStats;
  "pptx-summary": QueueStats;
  "subtitle-embed": QueueStats;
}

type QueueType = "transcription" | "pdfua" | "ollama" | "video" | "podcast" | "pptx-summary" | "subtitle-embed";

// Hook to fetch queue status
export function useQueueStatus(queueType?: QueueType) {
  const [stats, setStats] = useState<QueueStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/queue/status");
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch queue status:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (queueType && stats) {
    return { stats: stats[queueType], loading };
  }

  return { stats, loading };
}

// Hook to track job position in queue
export function useJobPosition(queueType: QueueType, jobId: string | null, isAuthenticated: boolean) {
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!jobId || !isAuthenticated) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const stopPolling = () => {
      stopped = true;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const fallbackToJobStatus = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          credentials: "include",
        });
        if (!response.ok) return;

        const data = await response.json();
        if (data.status === "completed" || data.status === "failed") {
          setPosition(-1);
          setEstimatedWait(0);
          setIsProcessing(false);
          stopPolling();
          return;
        }
        if (data.status === "active") {
          setPosition(0);
          setEstimatedWait(0);
          setIsProcessing(true);
        }
      } catch {
        // Ignore fallback errors; we'll try again on next poll.
      }
    };

    const fetchPosition = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/queue/position/${queueType}/${jobId}`, {
          credentials: "include"
        });
        if (response.status === 404) {
          // Job already completed/expired in Bull; stop polling to avoid log spam.
          setPosition(-1);
          setEstimatedWait(0);
          setIsProcessing(false);
          stopPolling();
          return;
        }
        if (!response.ok) {
          await fallbackToJobStatus();
          return;
        }

        const data = await response.json();
        setPosition(data.position);
        setEstimatedWait(data.estimatedWaitMinutes);
        setIsProcessing(data.isProcessing);

        if (data.isDone || data.position === -1) {
          stopPolling();
        }
      } catch (error) {
        console.error("Failed to fetch job position:", error);
        await fallbackToJobStatus();
      }
    };

    interval = setInterval(fetchPosition, 5000);
    void fetchPosition();
    return () => stopPolling();
  }, [queueType, jobId, isAuthenticated]);

  return { position, estimatedWait, isProcessing };
}

interface QueueStatusBadgeProps {
  queueType: QueueType;
  className?: string;
}

// Badge showing current queue status
export function QueueStatusBadge({ queueType, className = "" }: QueueStatusBadgeProps) {
  const { stats, loading } = useQueueStatus(queueType) as { stats: QueueStats | null; loading: boolean };

  if (loading || !stats) {
    return null;
  }

  const totalInQueue = stats.waiting + stats.active;

  if (totalInQueue === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-green-600 ${className}`}>
        <CheckCircle2 className="w-4 h-4" />
        <span>Keine Wartezeit</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-sm text-amber-600 ${className}`}>
      <Users className="w-4 h-4" />
      <span>
        {totalInQueue} {totalInQueue === 1 ? "Job" : "Jobs"} in Warteschlange
      </span>
      {stats.estimatedWaitMinutes > 0 && (
        <>
          <span className="text-slate-400">•</span>
          <Clock className="w-4 h-4" />
          <span>~{stats.estimatedWaitMinutes} Min</span>
        </>
      )}
    </div>
  );
}

interface QueuePositionDisplayProps {
  position: number | null;
  estimatedWait: number;
  isProcessing: boolean;
  showEmail?: boolean;
  email?: string;
  onEmailChange?: (email: string) => void;
}

// Display showing job position in queue
export function QueuePositionDisplay({
  position,
  estimatedWait,
  isProcessing,
  showEmail = false,
  email = "",
  onEmailChange,
}: QueuePositionDisplayProps) {
  if (position === null) return null;

  if (position === -1) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle2 className="w-4 h-4" />
        <span>Verarbeitung abgeschlossen</span>
      </div>
    );
  }

  if (isProcessing || position === 0) {
    return (
      <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
          <div>
            <p className="text-sm font-medium text-violet-800">Wird verarbeitet...</p>
            <p className="text-xs text-violet-600">Ihr Job wird gerade bearbeitet</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">
            Position {position} in der Warteschlange
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Geschätzte Wartezeit: ~{estimatedWait} {estimatedWait === 1 ? "Minute" : "Minuten"}
          </p>

          {showEmail && onEmailChange && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-medium text-amber-800">
                  Per E-Mail benachrichtigen
                </span>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="ihre@email.de"
                className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
              />
              <p className="text-xs text-amber-600 mt-1">
                Sie erhalten eine E-Mail, sobald Ihr Job fertig ist.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact inline queue status
export function QueueStatusInline({ queueType }: { queueType: QueueType }) {
  const { stats, loading } = useQueueStatus(queueType) as { stats: QueueStats | null; loading: boolean };

  if (loading || !stats) {
    return <span className="text-slate-400 text-xs">Lade...</span>;
  }

  const totalInQueue = stats.waiting + stats.active;

  if (totalInQueue === 0) {
    return <span className="text-green-600 text-xs">Sofort verfügbar</span>;
  }

  return (
    <span className="text-amber-600 text-xs">
      ~{stats.estimatedWaitMinutes} Min Wartezeit
    </span>
  );
}
