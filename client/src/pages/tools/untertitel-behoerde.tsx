import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Monitor,
  Scissors,
  Subtitles,
  AlertCircle,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import {
  ScreenRecorder,
  type ChunkInfo,
  type ScreenRecorderRestoreState,
} from "@/components/ScreenRecorder";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { segmentsToTtml, segmentsToVtt } from "@/lib/subtitles/formats";
import { replaceAllWithCount } from "@/lib/text/replace";
import {
  formatMarkerTime,
  segmentsToSrt,
  type SrtSegment,
} from "@/lib/subtitles/srt";

interface RecordingMarker {
  timestampSeconds: number;
  label: string;
}

interface ChapterMarker {
  timestampSeconds: number;
  label: string;
  targetSizeMb?: number;
}

interface ChunkSessionStatus {
  sessionId: string;
  totalChunks: number;
  chunks?: Array<{
    chunkIndex: number;
    chunkId: string;
    startTime: number;
    endTime: number;
    size: number;
  }>;
  isComplete: boolean;
  createdAt?: string;
  completedAt?: string;
}

interface TranscriptionStatus {
  id: string;
  sessionId: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  currentStep: string;
  error?: string;
}

interface TranscriptionResult {
  sessionId: string;
  segments: SrtSegment[];
  chapters: ChapterMarker[];
  recordingMarkers: RecordingMarker[];
  defaultTargetSizeMb: number;
  totalDurationSeconds: number;
}

interface ExportPart {
  partIndex: number;
  filename: string;
  sizeMb: number;
  durationSeconds: number;
  hasSrt: boolean;
}

interface ExportChapterStatus {
  index: number;
  label: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  targetSizeMb: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  parts: ExportPart[];
}

interface ExportJobStatus {
  id: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  currentStep: string;
  subtitleType: "hardcoded" | "soft";
  includeSrt: boolean;
  usesReviewedTranscript: boolean;
  chapters: ExportChapterStatus[];
  error?: string;
}

interface RecoveryPointer {
  version: 1;
  sessionId: string;
  transcriptionJobId: string | null;
  exportJobId: string | null;
  updatedAt: string;
}

interface RecoveryResponse {
  sessionId: string;
  sessionStatus: ChunkSessionStatus;
  totalDurationSeconds: number;
  recordingMarkers: RecordingMarker[];
  segments: SrtSegment[];
  chapters: ChapterMarker[];
  defaultTargetSizeMb: number;
  transcriptionJob: TranscriptionStatus | null;
  exportJob: ExportJobStatus | null;
}

const RECOVERY_STORAGE_KEY = "voxdrop-behoerde-recovery";
const RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DRAFT_AUTOSAVE_DEBOUNCE_MS = 1200;

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatSize(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function normalizeLocalChapters(
  chapters: ChapterMarker[],
  defaultTargetSizeMb: number,
  totalDurationSeconds: number
): ChapterMarker[] {
  const deduped = new Map<string, ChapterMarker>();
  const withStart = chapters.some((chapter) => chapter.timestampSeconds <= 0.1)
    ? chapters
    : [{ timestampSeconds: 0, label: "Kapitel 1" }, ...chapters];

  for (const chapter of withStart) {
    if (chapter.timestampSeconds < 0) continue;
    if (chapter.timestampSeconds >= totalDurationSeconds && chapter.timestampSeconds > 0) continue;
    const key = chapter.timestampSeconds.toFixed(3);
    if (!deduped.has(key)) {
      deduped.set(key, {
        timestampSeconds: chapter.timestampSeconds,
        label: chapter.label?.trim() || "",
        targetSizeMb:
          typeof chapter.targetSizeMb === "number"
            ? Math.max(25, Math.min(500, Math.round(chapter.targetSizeMb)))
            : undefined,
      });
    }
  }

  return [...deduped.values()]
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    .map((chapter, index) => ({
      ...chapter,
      label: chapter.label || `Kapitel ${index + 1}`,
      targetSizeMb:
        typeof chapter.targetSizeMb === "number"
          ? Math.max(25, Math.min(500, chapter.targetSizeMb))
          : undefined,
    }));
}

function buildChapterRanges(chapters: ChapterMarker[], totalDurationSeconds: number, defaultTargetSizeMb: number) {
  const normalized = normalizeLocalChapters(chapters, defaultTargetSizeMb, totalDurationSeconds);
  return normalized.map((chapter, index) => {
    const nextStart = normalized[index + 1]?.timestampSeconds ?? totalDurationSeconds;
    return {
      index,
      label: chapter.label || `Kapitel ${index + 1}`,
      timestampSeconds: chapter.timestampSeconds,
      endSeconds: nextStart,
      durationSeconds: Math.max(0, nextStart - chapter.timestampSeconds),
      targetSizeMb: chapter.targetSizeMb ?? defaultTargetSizeMb,
    };
  });
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadRecoveryPointer(): RecoveryPointer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoveryPointer;
    if (!parsed || parsed.version !== 1 || !parsed.sessionId || !parsed.updatedAt) {
      window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
      return null;
    }
    const ageMs = Date.now() - Date.parse(parsed.updatedAt);
    if (!Number.isFinite(ageMs) || ageMs > RECOVERY_MAX_AGE_MS) {
      window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveRecoveryPointer(pointer: RecoveryPointer) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(pointer));
  } catch {
    // Ignore storage errors
  }
}

function clearRecoveryPointer() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function mapChunksToRestoreState(sessionStatus: ChunkSessionStatus | null, durationSeconds: number): ScreenRecorderRestoreState | null {
  if (!sessionStatus || sessionStatus.isComplete || !sessionStatus.chunks?.length) return null;
  const uploadedChunks: ChunkInfo[] = sessionStatus.chunks.map((chunk) => ({
    sessionId: sessionStatus.sessionId,
    chunkIndex: chunk.chunkIndex,
    chunkId: chunk.chunkId,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    sizeMB: chunk.size / 1024 / 1024,
  }));
  return {
    sessionId: sessionStatus.sessionId,
    uploadedChunks,
    durationSeconds,
    isComplete: false,
  };
}

export default function UntertitelBehoerdePage() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const transcriptionStartInFlightRef = useRef(false);
  const hasAttemptedRecoveryRef = useRef(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<ChunkSessionStatus | null>(null);
  const [hasUploadedChunk, setHasUploadedChunk] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingMarkers, setRecordingMarkers] = useState<RecordingMarker[]>([]);
  const [restoreState, setRestoreState] = useState<ScreenRecorderRestoreState | null>(null);
  const [hasRecoveredSession, setHasRecoveredSession] = useState(false);
  const [isRecoveringSession, setIsRecoveringSession] = useState(false);

  const [defaultTargetSizeMb, setDefaultTargetSizeMb] = useState(125);
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus | null>(null);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);

  const [segments, setSegments] = useState<SrtSegment[]>([]);
  const [chapters, setChapters] = useState<ChapterMarker[]>([{ timestampSeconds: 0, label: "Kapitel 1" }]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false);

  const [subtitleType, setSubtitleType] = useState<"hardcoded" | "soft">("soft");
  const [includeSrt, setIncludeSrt] = useState(true);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportJobStatus | null>(null);
  const [isStartingExport, setIsStartingExport] = useState(false);

  const totalDurationSeconds = segments[segments.length - 1]?.endSeconds || recordingDuration;
  const chapterRanges = useMemo(
    () => buildChapterRanges(chapters, totalDurationSeconds || recordingDuration, defaultTargetSizeMb),
    [chapters, defaultTargetSizeMb, totalDurationSeconds, recordingDuration]
  );

  const chapterTimestampSet = useMemo(
    () => new Set(chapters.map((chapter) => chapter.timestampSeconds.toFixed(3))),
    [chapters]
  );

  const resetFlow = useCallback((nextSessionId: string) => {
    setHasRecoveredSession(false);
    setRestoreState(null);
    setSessionId(nextSessionId);
    setSessionStatus(null);
    setHasUploadedChunk(false);
    setRecordingDuration(0);
    setRecordingMarkers([]);
    setDefaultTargetSizeMb(125);
    setTranscriptionJobId(null);
    setTranscriptionStatus(null);
    setSegments([]);
    setChapters([{ timestampSeconds: 0, label: "Kapitel 1" }]);
    setReviewDirty(false);
    setExportJobId(null);
    setExportStatus(null);
    setSubtitleType("soft");
    setIncludeSrt(true);
  }, []);

  const discardRecoveredSession = useCallback(() => {
    clearRecoveryPointer();
    setIsRecoveringSession(false);
    setHasRecoveredSession(false);
    setRestoreState(null);
    setSessionId(null);
    setSessionStatus(null);
    setHasUploadedChunk(false);
    setRecordingDuration(0);
    setRecordingMarkers([]);
    setDefaultTargetSizeMb(125);
    setTranscriptionJobId(null);
    setTranscriptionStatus(null);
    setSegments([]);
    setChapters([{ timestampSeconds: 0, label: "Kapitel 1" }]);
    setReviewDirty(false);
    setExportJobId(null);
    setExportStatus(null);
    setSubtitleType("soft");
    setIncludeSrt(true);
  }, []);

  const hydrateRecoveredSession = useCallback((data: RecoveryResponse) => {
    const recoveredStatus = data.sessionStatus;
    const recoveredDuration =
      data.totalDurationSeconds ||
      recoveredStatus.chunks?.reduce((max, chunk) => Math.max(max, chunk.endTime || 0), 0) ||
      0;
    const normalizedChapters = normalizeLocalChapters(
      data.chapters?.length ? data.chapters : [{ timestampSeconds: 0, label: "Kapitel 1" }],
      data.defaultTargetSizeMb || 125,
      data.totalDurationSeconds || data.segments[data.segments.length - 1]?.endSeconds || recoveredDuration
    );

    setHasRecoveredSession(true);
    setSessionId(data.sessionId);
    setSessionStatus(recoveredStatus);
    setHasUploadedChunk(recoveredStatus.totalChunks > 0);
    setRecordingDuration(recoveredDuration);
    setRecordingMarkers(data.recordingMarkers || []);
    setDefaultTargetSizeMb(data.defaultTargetSizeMb || 125);
    setSegments(data.segments || []);
    setChapters(normalizedChapters);
    setReviewDirty(false);
    setTranscriptionStatus(data.transcriptionJob);
    setTranscriptionJobId(data.transcriptionJob?.status === "processing" ? data.transcriptionJob.id : null);
    setExportStatus(data.exportJob);
    setExportJobId(data.exportJob?.id || null);
    setRestoreState(mapChunksToRestoreState(recoveredStatus, recoveredDuration));
  }, []);

  const saveDraft = useCallback(async (payload: {
    recordingMarkers?: RecordingMarker[];
    reviewedTranscriptSegments?: SrtSegment[];
    chapters?: ChapterMarker[];
    defaultTargetSizeMb?: number;
  }): Promise<boolean> => {
    if (!sessionId) return false;
    try {
      const response = await fetch(`/api/chapter-export/chunk/${sessionId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error("[BehoerdeSubtitleFlow] Draft save failed:", error);
      return false;
    }
  }, [sessionId]);

  const fetchChunkSessionStatus = useCallback(async (targetSessionId: string): Promise<ChunkSessionStatus | null> => {
    const response = await fetch(`/api/recordings/chunk/${targetSessionId}`, {
      credentials: "include",
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as ChunkSessionStatus;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    saveRecoveryPointer({
      version: 1,
      sessionId,
      transcriptionJobId,
      exportJobId,
      updatedAt: new Date().toISOString(),
    });
  }, [exportJobId, sessionId, transcriptionJobId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (hasAttemptedRecoveryRef.current) return;

    const pointer = loadRecoveryPointer();
    hasAttemptedRecoveryRef.current = true;
    if (!pointer?.sessionId) return;

    let cancelled = false;
    setIsRecoveringSession(true);

    const restore = async () => {
      try {
        const response = await fetch(`/api/chapter-export/chunk/${pointer.sessionId}/recover`, {
          credentials: "include",
        });
        if (response.status === 404) {
          clearRecoveryPointer();
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as RecoveryResponse;
        if (cancelled) return;

        hydrateRecoveredSession(data);

        if (!data.transcriptionJob && pointer.transcriptionJobId && !data.segments.length) {
          setTranscriptionJobId(pointer.transcriptionJobId);
        }
        if (!data.exportJob && pointer.exportJobId) {
          setExportJobId(pointer.exportJobId);
        }
      } catch (error) {
        console.error("[BehoerdeSubtitleFlow] Session recovery failed:", error);
      } finally {
        if (!cancelled) {
          setIsRecoveringSession(false);
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [hydrateRecoveredSession, isAuthenticated]);

  useEffect(() => {
    if (!sessionId || !hasUploadedChunk || sessionStatus?.isComplete) return;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const data = await fetchChunkSessionStatus(sessionId);
        if (!cancelled && data) {
          setSessionStatus(data);
          setRestoreState(mapChunksToRestoreState(data, recordingDuration));
        }
      } catch {
        // Keep polling
      }
    };

    void pollStatus();
    const interval = window.setInterval(() => {
      void pollStatus();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchChunkSessionStatus, hasUploadedChunk, recordingDuration, sessionId, sessionStatus?.isComplete]);

  const loadTranscriptionResult = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/chapter-export/transcription/${jobId}/result`, {
      credentials: "include",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as TranscriptionResult;
    const normalizedChapters = normalizeLocalChapters(
      data.chapters?.length ? data.chapters : [{ timestampSeconds: 0, label: "Kapitel 1" }],
      data.defaultTargetSizeMb || 125,
      data.totalDurationSeconds || data.segments[data.segments.length - 1]?.endSeconds || 0
    );

    setSegments(data.segments || []);
    setChapters(normalizedChapters);
    setRecordingMarkers(data.recordingMarkers || []);
    setDefaultTargetSizeMb(data.defaultTargetSizeMb || 125);
    setReviewDirty(false);
    setRestoreState(null);
    setTranscriptionJobId(null);
    toast({
      title: "Transkript bereit",
      description: `${data.segments.length} Segmente geladen. Kapitelmarker können jetzt direkt im Transcript gesetzt werden.`,
    });
  }, [toast]);

  useEffect(() => {
    if (!transcriptionJobId) return;
    if (transcriptionStatus?.status === "completed" || transcriptionStatus?.status === "failed") return;

    let cancelled = false;
    let interval: number | null = null;
    const poll = async () => {
      try {
        const response = await fetch(`/api/chapter-export/transcription/${transcriptionJobId}/status`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Status-Abfrage fehlgeschlagen");
        }
        const data = (await response.json()) as TranscriptionStatus;
        if (cancelled) return;
        setTranscriptionStatus(data);

        if (data.status === "completed") {
          if (interval) window.clearInterval(interval);
          await loadTranscriptionResult(transcriptionJobId);
          return;
        }
        if (data.status === "failed") {
          if (interval) window.clearInterval(interval);
          toast({
            title: "Transkription fehlgeschlagen",
            description: data.error || "Die Session konnte nicht transkribiert werden.",
            variant: "destructive",
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[BehoerdeSubtitleFlow] Transcription status poll failed:", error);
        }
      }
    };

    void poll();
    interval = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [loadTranscriptionResult, toast, transcriptionJobId, transcriptionStatus?.status]);

  useEffect(() => {
    if (!exportJobId) return;
    if (exportStatus?.status === "completed" || exportStatus?.status === "failed") return;

    let cancelled = false;
    let interval: number | null = null;
    const poll = async () => {
      try {
        const response = await fetch(`/api/chapter-export/${exportJobId}/status`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Status-Abfrage fehlgeschlagen");
        }
        const data = (await response.json()) as ExportJobStatus;
        if (!cancelled) {
          setExportStatus(data);
          if (data.status === "completed") {
            if (interval) window.clearInterval(interval);
            toast({
              title: "Kapitel fertig",
              description: `${data.chapters.length} Kapitel stehen direkt zum Download bereit.`,
            });
          }
          if (data.status === "failed" && data.error) {
            if (interval) window.clearInterval(interval);
            toast({
              title: "Kapitel-Export fehlgeschlagen",
              description: data.error,
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[BehoerdeSubtitleFlow] Export status poll failed:", error);
        }
      }
    };

    void poll();
    interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [exportJobId, exportStatus?.status, toast]);

  const handleRecordingMarker = useCallback((timestampSeconds: number) => {
    setRecordingMarkers((current) => [
      ...current,
      {
        timestampSeconds,
        label: `Kapitel ${current.length + 2}`,
      },
    ]);
  }, []);

  const startTranscription = useCallback(async () => {
    if (!sessionId) return;
    if (transcriptionStartInFlightRef.current) return;

    transcriptionStartInFlightRef.current = true;
    setIsStartingTranscription(true);
    try {
      let latestStatus = sessionStatus;
      const waitUntil = Date.now() + 30000;

      while (!latestStatus?.isComplete && Date.now() < waitUntil) {
        latestStatus = await fetchChunkSessionStatus(sessionId);
        if (latestStatus?.isComplete) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }

      if (!latestStatus?.isComplete) {
        throw new Error(
          latestStatus
            ? "Upload läuft noch. Bitte warte einen Moment, bis der finale Chunk vollständig auf dem Server ist."
            : "Auf dem Server ist noch kein Chunk angekommen. Bitte warte kurz oder starte die Aufnahme neu, falls der Upload im Netzwerk blockiert wurde."
        );
      }

      setSessionStatus(latestStatus);

      const response = await fetch(`/api/chapter-export/chunk/${sessionId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          language: "de",
          defaultTargetSizeMb,
          recordingMarkers,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { jobId: string };
      setTranscriptionJobId(data.jobId);
      setTranscriptionStatus({
        id: data.jobId,
        sessionId,
        status: "processing",
        progress: 0,
        currentStep: "Initialisierung",
      });
      toast({
        title: "Transkription gestartet",
        description: "Die Chunk-Session wird serverseitig verarbeitet. Kein Browser-Vollupload nötig.",
      });
    } catch (error) {
      toast({
        title: "Transkription konnte nicht gestartet werden",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsStartingTranscription(false);
      transcriptionStartInFlightRef.current = false;
    }
  }, [defaultTargetSizeMb, fetchChunkSessionStatus, recordingMarkers, sessionId, sessionStatus, toast]);

  const saveReviewState = useCallback(async (silent = false) => {
    if (!sessionId || segments.length === 0) return false;
    setIsSavingReview(true);
    try {
      const saved = await saveDraft({
        recordingMarkers,
        chapters,
        reviewedTranscriptSegments: segments,
        defaultTargetSizeMb,
      });
      if (!saved) {
        throw new Error("Autosave nicht möglich");
      }
      setReviewDirty(false);
      if (!silent) {
        toast({
          title: "Transcript gespeichert",
          description: "Kapitelmarker, Transcript und Zielgrößen wurden serverseitig übernommen.",
        });
      }
      return true;
    } catch (error) {
      toast({
        title: "Speichern fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSavingReview(false);
    }
  }, [chapters, defaultTargetSizeMb, recordingMarkers, saveDraft, segments, sessionId, toast]);

  const startExport = useCallback(async () => {
    if (!sessionId || segments.length === 0) return;

    setIsStartingExport(true);
    try {
      const saved = reviewDirty ? await saveReviewState(true) : true;
      if (!saved) return;

      const response = await fetch(`/api/chapter-export/chunk/${sessionId}/export-chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subtitleType,
          includeSrt,
          defaultTargetSizeMb,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { jobId: string };
      setExportJobId(data.jobId);
      setExportStatus(null);
      toast({
        title: "Kapitel-Export gestartet",
        description: subtitleType === "soft"
          ? "Kapitel werden als MP4 mit Soft-Subtitle-Track erzeugt."
          : "Kapitel werden als MP4 mit eingebrannten Untertiteln erzeugt.",
      });
    } catch (error) {
      toast({
        title: "Kapitel-Export konnte nicht gestartet werden",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsStartingExport(false);
    }
  }, [defaultTargetSizeMb, includeSrt, reviewDirty, saveReviewState, segments.length, sessionId, subtitleType, toast]);

  const updateRecordingMarkerLabel = useCallback((index: number, label: string) => {
    setRecordingMarkers((current) =>
      current.map((marker, markerIndex) => (
        markerIndex === index ? { ...marker, label } : marker
      ))
    );
  }, []);

  const removeRecordingMarker = useCallback((index: number) => {
    setRecordingMarkers((current) => current.filter((_, markerIndex) => markerIndex !== index));
  }, []);

  const updateSegmentText = useCallback((index: number, text: string) => {
    setSegments((current) =>
      current.map((segment) => (
        segment.index === index ? { ...segment, text } : segment
      ))
    );
    setReviewDirty(true);
  }, []);

  const applyFindReplace = useCallback(() => {
    const find = findText.trim();
    if (!find) {
      toast({
        title: "Nichts zu ersetzen",
        description: "Bitte gib einen Suchbegriff ein.",
        variant: "destructive",
      });
      return;
    }

    let total = 0;
    const updated = segments.map((segment) => {
      const { output, count } = replaceAllWithCount({
        input: segment.text,
        find,
        replace: replaceText,
        caseSensitive: replaceCaseSensitive,
      });
      total += count;
      return count > 0 ? { ...segment, text: output } : segment;
    });

    if (total > 0) {
      setSegments(updated);
      setReviewDirty(true);
    }

    toast({
      title: "Suchen/Ersetzen",
      description: total > 0 ? `${total} Treffer ersetzt.` : "Keine Treffer gefunden.",
    });
  }, [findText, replaceCaseSensitive, replaceText, segments, toast]);

  const toggleChapterAtSegment = useCallback((segment: SrtSegment) => {
    if (segment.startSeconds <= 0.1) return;

    setChapters((current) => {
      const exists = current.some(
        (chapter) => Math.abs(chapter.timestampSeconds - segment.startSeconds) < 0.01
      );
      const next = exists
        ? current.filter((chapter) => Math.abs(chapter.timestampSeconds - segment.startSeconds) >= 0.01)
        : [
            ...current,
            {
              timestampSeconds: segment.startSeconds,
              label: `Kapitel ${current.length + 1}`,
            },
          ];

      return normalizeLocalChapters(next, defaultTargetSizeMb, totalDurationSeconds || recordingDuration);
    });
    setReviewDirty(true);
  }, [defaultTargetSizeMb, recordingDuration, totalDurationSeconds]);

  const updateChapter = useCallback((timestampSeconds: number, patch: Partial<ChapterMarker>) => {
    setChapters((current) =>
      normalizeLocalChapters(
        current.map((chapter) => (
          Math.abs(chapter.timestampSeconds - timestampSeconds) < 0.01
            ? { ...chapter, ...patch }
            : chapter
        )),
        defaultTargetSizeMb,
        totalDurationSeconds || recordingDuration
      )
    );
    setReviewDirty(true);
  }, [defaultTargetSizeMb, recordingDuration, totalDurationSeconds]);

  const removeChapter = useCallback((timestampSeconds: number) => {
    if (timestampSeconds <= 0.1) return;
    setChapters((current) =>
      normalizeLocalChapters(
        current.filter((chapter) => Math.abs(chapter.timestampSeconds - timestampSeconds) >= 0.01),
        defaultTargetSizeMb,
        totalDurationSeconds || recordingDuration
      )
    );
    setReviewDirty(true);
  }, [defaultTargetSizeMb, recordingDuration, totalDurationSeconds]);

  useEffect(() => {
    if (!sessionId || !hasUploadedChunk || segments.length > 0 || isSavingReview) return;

    const timeout = window.setTimeout(() => {
      void saveDraft({
        recordingMarkers,
        defaultTargetSizeMb,
      }).then((saved) => {
        if (saved) {
          setReviewDirty(false);
        }
      });
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [defaultTargetSizeMb, hasUploadedChunk, isSavingReview, recordingMarkers, saveDraft, segments.length, sessionId]);

  useEffect(() => {
    if (!sessionId || segments.length === 0 || isSavingReview) return;

    const timeout = window.setTimeout(() => {
      void saveDraft({
        recordingMarkers,
        reviewedTranscriptSegments: segments,
        chapters,
        defaultTargetSizeMb,
      }).then((saved) => {
        if (saved) {
          setReviewDirty(false);
        }
      });
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [chapters, defaultTargetSizeMb, isSavingReview, recordingMarkers, saveDraft, segments, sessionId]);

  const handleDownloadExportFile = useCallback((filename: string) => {
    if (!exportJobId) return;
    const link = document.createElement("a");
    link.href = `/api/chapter-export/${exportJobId}/download/${filename}`;
    link.download = filename;
    link.click();
  }, [exportJobId]);

  const handleDownloadArchive = useCallback(() => {
    if (!exportJobId) return;
    const link = document.createElement("a");
    link.href = `/api/chapter-export/${exportJobId}/download-all`;
    link.download = "kapitel-export.zip";
    link.click();
  }, [exportJobId]);

  const transcriptSrt = useMemo(() => segmentsToSrt(segments), [segments]);
  const transcriptVtt = useMemo(() => segmentsToVtt(segments), [segments]);
  const transcriptTtml = useMemo(() => segmentsToTtml(segments), [segments]);

  return (
    <PageLayout>
      <SEO
        title="Behörden-Untertitel-Flow"
        description="Chunknative Screenrecordings für Behördennetze: aufnehmen, serverseitig transkribieren, Kapitelmarker im Transcript setzen und Kapitel mit Untertiteln herunterladen."
        canonical="/tools/untertitel/behoerde"
      />

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white overflow-hidden">
          <div className="px-8 py-10 md:px-10 md:py-12">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/85">
                  <Building2 className="w-4 h-4" />
                  Behörden-Flow für Proxy-/Whitelist-Szenarien
                </div>
                <h1 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight">
                  Screenrecording, Transcript-Review und Kapitel-Downloads ohne Browser-Vollupload
                </h1>
                <p className="mt-4 max-w-2xl text-base md:text-lg text-slate-300">
                  Für DRV- und Behörden-Demos: Chunk-Upload während der Aufnahme, serverseitige Session-Transkription,
                  Kapitelmarker direkt im Transcript und MP4-Downloads pro Kapitel mit Hard- oder Soft-Untertiteln.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 min-w-[280px]">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Session</div>
                    <div className="mt-1 font-medium">{sessionId ? `${sessionId.slice(0, 8)}…` : "noch keine"}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Kapitel</div>
                    <div className="mt-1 font-medium">{chapterRanges.length}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Dauer</div>
                    <div className="mt-1 font-medium">{formatDuration(totalDurationSeconds || recordingDuration)}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <div className="text-slate-400">Zielgröße</div>
                    <div className="mt-1 font-medium">{defaultTargetSizeMb} MB</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-4">
              {[
                "1. Screenrecording",
                "2. Server-Transkription",
                "3. Kapitelmarker im Transcript",
                "4. Kapitelweise MP4-Downloads",
              ].map((step) => (
                <div key={step} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-2xl font-semibold text-slate-900">Anmeldung erforderlich</h2>
            <p className="mt-3 text-slate-600">
              Der Behörden-Flow nutzt chunkbasierte Upload-Sessions und serverseitige Jobs. Bitte melde dich an.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <a href="/login" className="inline-flex items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
                Anmelden
              </a>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Monitor className="w-4 h-4" />
                      Schritt 1
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900">Screenrecording im Chunk-Modus</h2>
                    <p className="mt-2 text-slate-600">
                      Auto-Chunking ist hier immer aktiv. Kapitelklicks dienen als Vorbelegung und werden nach der Transkription im Transcript bestätigt oder korrigiert.
                    </p>
                  </div>

                  {sessionStatus?.isComplete ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Aufnahme abgeschlossen
                    </div>
                  ) : sessionId ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm text-amber-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Upload-Session aktiv
                    </div>
                  ) : null}
                </div>

                <div className="mt-6">
                  {isRecoveringSession && (
                    <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Letzte 24h-Session wird wiederhergestellt...
                      </div>
                    </div>
                  )}

                  {hasRecoveredSession && sessionId && !isRecoveringSession && (
                    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="text-sm text-violet-800">
                        <div className="font-medium">Session wiederhergestellt</div>
                        <div className="mt-1">
                          {sessionStatus?.isComplete
                            ? "Die Session ist wieder geladen und kann weiter transkribiert oder exportiert werden."
                            : "Die bereits gesicherten Chunks sind wieder da. Die Aufnahme kann in derselben Session fortgesetzt werden."}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-violet-200 bg-white text-violet-700 hover:bg-violet-100"
                        onClick={discardRecoveredSession}
                      >
                        Neue Session starten
                      </Button>
                    </div>
                  )}

                  <ScreenRecorder
                    onRecordingComplete={() => {
                      void startTranscription();
                    }}
                    onChunkUploaded={(chunk) => {
                      setHasUploadedChunk(true);
                      setSessionStatus((current) => {
                        const existingChunks = current?.chunks?.filter((entry) => entry.chunkIndex !== chunk.chunkIndex) || [];
                        const nextChunks = [
                          ...existingChunks,
                          {
                            chunkIndex: chunk.chunkIndex,
                            chunkId: chunk.chunkId,
                            startTime: chunk.startTime,
                            endTime: chunk.endTime,
                            size: Math.round(chunk.sizeMB * 1024 * 1024),
                          },
                        ].sort((a, b) => a.chunkIndex - b.chunkIndex);

                        return {
                          sessionId: chunk.sessionId,
                          totalChunks: nextChunks.length,
                          chunks: nextChunks,
                          isComplete: false,
                          createdAt: current?.createdAt,
                          completedAt: current?.completedAt,
                        };
                      });
                      setRestoreState((current) => {
                        const existingChunks = current?.uploadedChunks.filter((entry) => entry.chunkIndex !== chunk.chunkIndex) || [];
                        const nextUploadedChunks = [...existingChunks, chunk].sort((a, b) => a.chunkIndex - b.chunkIndex);
                        return {
                          sessionId: chunk.sessionId,
                          uploadedChunks: nextUploadedChunks,
                          durationSeconds: Math.max(recordingDuration, chunk.endTime),
                          isComplete: false,
                        };
                      });
                    }}
                    onChapterMark={handleRecordingMarker}
                    onSessionReady={resetFlow}
                    onDurationChange={setRecordingDuration}
                    chapterCount={recordingMarkers.length}
                    showStoragePicker={false}
                    enableAutoChunking={true}
                    autoSaveToServer={false}
                    primaryActionLabel="Session transkribieren"
                    primaryActionIcon="video"
                    primaryActionDisabled={!sessionStatus?.isComplete || isStartingTranscription || !!transcriptionJobId}
                    restoreState={restoreState}
                  />
                </div>

                {sessionStatus && (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                      <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                        {sessionStatus.totalChunks} Chunks
                      </Badge>
                      <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                        Dauer {formatDuration(recordingDuration)}
                      </Badge>
                      {sessionStatus.isComplete ? (
                        <Badge className="bg-emerald-600 text-white">bereit für Transkription</Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white">läuft noch</Badge>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button
                        onClick={() => {
                          void startTranscription();
                        }}
                        disabled={!sessionStatus.isComplete || isStartingTranscription || !!transcriptionJobId}
                        className="rounded-xl bg-slate-900 hover:bg-slate-800"
                      >
                        {isStartingTranscription || transcriptionStatus?.status === "processing" ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Server transkribiert...
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4 mr-2" />
                            Session jetzt transkribieren
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-slate-500">
                        Kein späterer 1.5-GB-Vollupload aus dem Browser.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Scissors className="w-4 h-4" />
                  Aufnahme-Marker
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Vorbelegte Kapitel</h2>
                <p className="mt-2 text-slate-600">
                  Diese Marker stammen aus dem Recording. Verbindlich werden sie erst nach dem Transcript-Review.
                </p>

                <div className="mt-5 space-y-3">
                  {recordingMarkers.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                      Während der Aufnahme auf <span className="font-medium text-slate-700">Kapitel</span> klicken, um Grenzen vorzumerken.
                    </div>
                  )}

                  {recordingMarkers.map((marker, index) => (
                    <div key={`${marker.timestampSeconds}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-mono text-slate-500">{formatMarkerTime(marker.timestampSeconds)}</div>
                        <button
                          type="button"
                          onClick={() => removeRecordingMarker(index)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          entfernen
                        </button>
                      </div>
                      <Input
                        value={marker.label}
                        onChange={(event) => updateRecordingMarkerLabel(index, event.target.value)}
                        className="mt-3"
                        placeholder={`Kapitel ${index + 2}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  Zielgröße pro Kapitel
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      type="number"
                      min={25}
                      max={500}
                      value={defaultTargetSizeMb}
                      onChange={(event) => {
                        setDefaultTargetSizeMb(Math.max(25, Math.min(500, Number(event.target.value) || 125)));
                        setReviewDirty(true);
                      }}
                      className="w-28 bg-white"
                    />
                    <span>MB als Standardwert</span>
                  </div>
                </div>

                {transcriptionStatus?.status === "processing" && (
                  <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-blue-700">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {transcriptionStatus.currentStep}
                      </div>
                      <span className="text-sm font-mono text-blue-700">{transcriptionStatus.progress}%</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${transcriptionStatus.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>

            {segments.length > 0 && (
              <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
                <section className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
                  <div className="border-b border-slate-100 px-6 py-5 md:px-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                          <Subtitles className="w-4 h-4" />
                          Schritt 2
                        </div>
                        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Transcript prüfen und Kapitelmarker setzen</h2>
                        <p className="mt-2 text-slate-600">
                          Kapitelmarker werden direkt an Untertitel-Segmenten gesetzt. Diese Transcript-Marker bestimmen die finalen Splitpunkte.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => downloadTextFile("untertitel.srt", transcriptSrt, "text/srt;charset=utf-8")}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          SRT
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => downloadTextFile("untertitel.vtt", transcriptVtt, "text/vtt;charset=utf-8")}
                        >
                          VTT
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => downloadTextFile("untertitel.ttml", transcriptTtml, "application/ttml+xml;charset=utf-8")}
                        >
                          TTML
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm text-slate-500">
                        Nach der Transkription kannst du Begriffe global suchen und in allen Segmenten auf einmal ersetzen.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setShowFindReplace((prev) => !prev)}
                      >
                        Suchen / Alle ersetzen
                      </Button>
                    </div>

                    {showFindReplace && (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end">
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-slate-700">Suchen</label>
                            <Input
                              value={findText}
                              onChange={(event) => setFindText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  applyFindReplace();
                                }
                              }}
                              placeholder="z.B. Abkürzung oder Tippfehler"
                              className="bg-white"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-slate-700">Ersetzen durch</label>
                            <Input
                              value={replaceText}
                              onChange={(event) => setReplaceText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  applyFindReplace();
                                }
                              }}
                              placeholder="leer lassen zum Entfernen"
                              className="bg-white"
                            />
                          </div>
                          <div className="flex flex-col gap-3 md:w-[240px]">
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                              <input
                                type="checkbox"
                                checked={replaceCaseSensitive}
                                onChange={(event) => setReplaceCaseSensitive(event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Groß/Klein beachten
                            </label>
                            <Button
                              type="button"
                              className="rounded-xl bg-slate-900 hover:bg-slate-800"
                              onClick={applyFindReplace}
                              disabled={!findText.trim()}
                            >
                              Alle ersetzen
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                    {segments.map((segment) => {
                      const hasChapterStart = chapterTimestampSet.has(segment.startSeconds.toFixed(3));
                      return (
                        <div key={segment.index} className="px-6 py-5 md:px-8">
                          <div className="flex items-start gap-4">
                            <div className="min-w-[132px] space-y-2">
                              <div className="text-xs font-mono text-slate-500">{segment.startTime}</div>
                              <div className="text-xs font-mono text-slate-400">bis {segment.endTime}</div>
                              <Button
                                variant={hasChapterStart ? "default" : "outline"}
                                className={`mt-3 h-9 rounded-lg text-xs ${hasChapterStart ? "bg-violet-600 hover:bg-violet-700" : ""}`}
                                onClick={() => toggleChapterAtSegment(segment)}
                                disabled={segment.startSeconds <= 0.1}
                              >
                                <Scissors className="w-3.5 h-3.5 mr-1.5" />
                                {hasChapterStart ? "Kapitel hier" : "Kapitel ab hier"}
                              </Button>
                            </div>

                            <div className="flex-1">
                              <textarea
                                value={segment.text}
                                onChange={(event) => updateSegmentText(segment.index, event.target.value)}
                                className={`min-h-[92px] w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition ${
                                  hasChapterStart
                                    ? "border-violet-300 bg-violet-50 focus:border-violet-500"
                                    : "border-slate-200 bg-white focus:border-slate-400"
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                          <ChevronRight className="w-4 h-4" />
                          Transcript-Kapitel
                        </div>
                        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Kanonische Kapitelgrenzen</h2>
                      </div>
                      {reviewDirty ? (
                        <Badge className="bg-amber-500 text-white">ungespeichert</Badge>
                      ) : (
                        <Badge className="bg-emerald-600 text-white">synchron</Badge>
                      )}
                    </div>

                    <div className="mt-5 space-y-4">
                      {chapterRanges.map((chapter) => (
                        <div key={chapter.timestampSeconds} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs text-slate-500">{formatMarkerTime(chapter.timestampSeconds)}</div>
                              <div className="text-xs text-slate-400 mt-1">
                                Dauer {formatDuration(chapter.durationSeconds)}
                              </div>
                            </div>
                            {chapter.timestampSeconds > 0.1 && (
                              <button
                                type="button"
                                onClick={() => removeChapter(chapter.timestampSeconds)}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                löschen
                              </button>
                            )}
                          </div>

                          <Input
                            value={chapter.label}
                            onChange={(event) => updateChapter(chapter.timestampSeconds, { label: event.target.value })}
                            className="mt-3"
                            placeholder={`Kapitel ${chapter.index + 1}`}
                          />

                          <div className="mt-3 flex items-center gap-3">
                            <Input
                              type="number"
                              min={25}
                              max={500}
                              value={chapter.targetSizeMb}
                              onChange={(event) => updateChapter(chapter.timestampSeconds, {
                                targetSizeMb: Math.max(25, Math.min(500, Number(event.target.value) || defaultTargetSizeMb)),
                              })}
                              className="w-28"
                            />
                            <span className="text-sm text-slate-500">MB für dieses Kapitel</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          void saveReviewState();
                        }}
                        disabled={isSavingReview}
                      >
                        {isSavingReview ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Speichert...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Transcript speichern
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-slate-500">
                        Aufnahme-Marker sind nur Vorbelegung. Diese Liste ist verbindlich.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                    <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Download className="w-4 h-4" />
                      Schritt 3
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900">Kapitel-Export</h2>
                    <p className="mt-2 text-slate-600">
                      MP4 pro Kapitel, wahlweise mit Soft-Track oder eingebrannten Untertiteln. Zu große Kapitel werden automatisch in Teile zerlegt.
                    </p>

                    <div className="mt-5 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setSubtitleType("soft")}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            subtitleType === "soft"
                              ? "border-blue-600 bg-blue-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="font-medium text-slate-900">Soft-Untertitel</div>
                          <div className="mt-1 text-sm text-slate-600">MP4 mit zuschaltbarem Subtitle-Track</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubtitleType("hardcoded")}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            subtitleType === "hardcoded"
                              ? "border-slate-900 bg-slate-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="font-medium text-slate-900">Hardcoded</div>
                          <div className="mt-1 text-sm text-slate-600">Untertitel fest ins Video eingebrannt</div>
                        </button>
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={includeSrt}
                          onChange={(event) => setIncludeSrt(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Separate SRT-Dateien pro Kapitel zusätzlich bereitstellen
                      </label>
                    </div>

                    <div className="mt-5">
                      <Button
                        onClick={() => {
                          void startExport();
                        }}
                        disabled={isStartingExport || isSavingReview || chapterRanges.length === 0}
                        className="w-full rounded-xl bg-slate-900 hover:bg-slate-800"
                        size="lg"
                      >
                        {isStartingExport ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Export startet...
                          </>
                        ) : (
                          <>
                            <Scissors className="w-4 h-4 mr-2" />
                            {chapterRanges.length} Kapitel exportieren
                          </>
                        )}
                      </Button>
                    </div>

                    {exportStatus?.status === "processing" && (
                      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-center justify-between gap-3 text-sm text-blue-700">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {exportStatus.currentStep}
                          </div>
                          <span className="font-mono">{exportStatus.progress}%</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-blue-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${exportStatus.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {exportStatus && (exportStatus.status === "completed" || exportStatus.status === "failed") && (
                      <div className="mt-5 space-y-4">
                        <div className={`rounded-2xl border p-4 ${exportStatus.status === "completed" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {exportStatus.status === "completed" ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                  <span className="text-emerald-800">Kapitel-Export abgeschlossen</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-4 h-4 text-red-700" />
                                  <span className="text-red-800">Kapitel-Export mit Fehlern beendet</span>
                                </>
                              )}
                            </div>

                            {exportStatus.status === "completed" && (
                              <Button variant="outline" className="rounded-xl bg-white" onClick={handleDownloadArchive}>
                                <Archive className="w-4 h-4 mr-2" />
                                ZIP optional
                              </Button>
                            )}
                          </div>
                          {exportStatus.error && (
                            <p className="mt-2 text-sm text-red-700">{exportStatus.error}</p>
                          )}
                        </div>

                        <div className="space-y-3">
                          {exportStatus.chapters.map((chapter) => (
                            <div key={`${chapter.index}-${chapter.label}`} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-medium text-slate-900">{chapter.label}</div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {formatDuration(chapter.startSeconds)} bis {formatDuration(chapter.endSeconds)} · Ziel {chapter.targetSizeMb} MB
                                  </div>
                                </div>
                                <Badge className={
                                  chapter.status === "completed"
                                    ? "bg-emerald-600 text-white"
                                    : chapter.status === "failed"
                                      ? "bg-red-600 text-white"
                                      : chapter.status === "processing"
                                        ? "bg-blue-600 text-white"
                                        : "bg-slate-500 text-white"
                                }>
                                  {chapter.status}
                                </Badge>
                              </div>

                              {chapter.error && (
                                <p className="mt-3 text-sm text-red-700">{chapter.error}</p>
                              )}

                              {chapter.parts.length > 0 && (
                                <div className="mt-4 space-y-2">
                                  {chapter.parts.map((part) => (
                                    <div key={part.filename} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
                                      <div>
                                        <div className="text-sm font-medium text-slate-900">{part.filename}</div>
                                        <div className="text-xs text-slate-500 mt-1">
                                          {formatSize(part.sizeMb)} · {formatDuration(part.durationSeconds)}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                          size="sm"
                                          className="rounded-lg bg-slate-900 hover:bg-slate-800"
                                          onClick={() => handleDownloadExportFile(part.filename)}
                                        >
                                          <Download className="w-3.5 h-3.5 mr-1.5" />
                                          MP4
                                        </Button>
                                        {part.hasSrt && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="rounded-lg"
                                            onClick={() => handleDownloadExportFile(part.filename.replace(/\.mp4$/i, ".srt"))}
                                          >
                                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                                            SRT
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

          </>
        )}
      </div>
    </PageLayout>
  );
}
