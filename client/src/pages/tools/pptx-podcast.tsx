import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import {
  Headphones, Upload, Loader2, Download, Play, Pause, CheckCircle2,
  AlertTriangle, FileText, Clock, Crown, Info, X, Volume2, ChevronDown, ChevronUp,
  MessageSquare, Plus, Trash2
} from "lucide-react";
import { QueuePositionDisplay, useJobPosition } from "@/components/QueueStatus";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget } from "@/hooks/use-storage-target";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

type JobStatus = "queued" | "pending" | "extracting" | "analyzing" | "generating" | "synthesizing" | "assembling" | "completed" | "failed";
type PodcastPhaseCode = "queued" | "extracting" | "analyzing" | "generating" | "synthesizing" | "assembling" | "retrying" | "completed" | "failed";
type StageKey = "queued" | "extracting" | "analyzing" | "generating" | "synthesizing" | "assembling";

interface Chapter {
  title: string;
  start: number;
  duration: number;
}

interface PodcastTimings {
  packMs: number;
  scriptMs: number;
  ttsMs: number;
  totalMs: number;
}

interface PodcastJob {
  id: string;
  status: JobStatus;
  progress: number;
  currentStage: string;
  phaseCode?: PodcastPhaseCode;
  phaseMessage?: string;
  phaseRank?: number;
  pipelinePath?: "pack" | "legacy" | null;
  timings?: PodcastTimings | null;
  chapters?: Chapter[];
  durationSeconds?: number;
  downloadUrl?: string;
  error?: string;
  errorCode?: string | null;
  retryCount?: number;
  gpuWaitMs?: number;
  lastHeartbeatAt?: string | null;
}

type TtsPreset = "klar" | "lebendig" | "dynamisch";

const STAGES: { key: StageKey; label: string; description: string }[] = [
  { key: "queued", label: "Warteschlange", description: "Job wartet auf freie Kapazitäten" },
  { key: "extracting", label: "Extraktion", description: "Folien und Text werden extrahiert" },
  { key: "analyzing", label: "Bildanalyse", description: "Bilder werden mit KI beschrieben" },
  { key: "generating", label: "Skript", description: "Podcast-Skript wird erstellt" },
  { key: "synthesizing", label: "Sprachsynthese", description: "Audio wird generiert" },
  { key: "assembling", label: "Zusammenbau", description: "Podcast wird fertiggestellt" },
];

const TTS_PRESETS: { id: TtsPreset; label: string; description: string }[] = [
  { id: "lebendig", label: "Lebendig", description: "Empfohlen: natuerlich, warm, podcastig" },
  { id: "klar", label: "Klar", description: "Ruhig, praezise, gut fuer Sachinfos" },
  { id: "dynamisch", label: "Dynamisch", description: "Mehr Energie und Tempo" },
];

type RecentJobStatus = "pending" | "active" | "completed" | "failed";

interface RecentJob {
  id: string;
  queue: string;
  status: RecentJobStatus;
  progress?: {
    stage?: string | null;
    percent?: number | null;
  };
  dedupKey?: string | null;
}

const PODCAST_ERROR_TRANSLATIONS: Record<string, string> = {
  gpu_slot_timeout: "GPU ist ausgelastet. Der Job bleibt in der Warteschlange und wird erneut versucht.",
  input_missing: "Die Upload-Datei ist nicht mehr vorhanden. Bitte erneut hochladen.",
  llm_context_overflow: "Die Inhalte waren zu lang fuer das Modell. Der Job wurde mit reduziertem Kontext erneut versucht.",
  provider_timeout: "Ein externer Dienst hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.",
  ffmpeg_oom: "Verarbeitung wegen Speichermangel fehlgeschlagen. Bitte erneut versuchen.",
  file_too_large: "Die Datei ist zu gross fuer diese Verarbeitung.",
};

const PHASE_RANK: Record<PodcastPhaseCode, number> = {
  queued: 0,
  extracting: 10,
  analyzing: 20,
  generating: 30,
  synthesizing: 40,
  assembling: 50,
  retrying: 60,
  completed: 90,
  failed: 100,
};

function normalizePhaseCode(raw: unknown, statusRaw?: unknown, stageRaw?: unknown): PodcastPhaseCode {
  const value = String(raw || statusRaw || "").trim().toLowerCase();
  if (
    value === "queued" ||
    value === "extracting" ||
    value === "analyzing" ||
    value === "generating" ||
    value === "synthesizing" ||
    value === "assembling" ||
    value === "retrying" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value as PodcastPhaseCode;
  }
  if (value === "pending") return "queued";

  const stageText = String(stageRaw || "").toLowerCase();
  if (stageText.includes("retry") || stageText.includes("erneut")) return "retrying";
  if (stageText.includes("bild") || stageText.includes("analyse")) return "analyzing";
  if (stageText.includes("skript") || stageText.includes("generat") || stageText.includes("präsentation")) return "generating";
  if (stageText.includes("audio") || stageText.includes("tts") || stageText.includes("synth") || stageText.includes("sprach")) return "synthesizing";
  if (stageText.includes("fertig") || stageText.includes("final") || stageText.includes("assem") || stageText.includes("merge")) return "assembling";
  if (stageText.includes("warteschlange")) return "queued";
  return "extracting";
}

function phaseToStageKey(phaseCode: PodcastPhaseCode): StageKey {
  switch (phaseCode) {
    case "queued":
      return "queued";
    case "extracting":
      return "extracting";
    case "analyzing":
      return "analyzing";
    case "generating":
      return "generating";
    case "synthesizing":
      return "synthesizing";
    case "assembling":
      return "assembling";
    case "retrying":
      return "assembling";
    case "completed":
      return "assembling";
    case "failed":
      return "assembling";
    default:
      return "extracting";
  }
}

function toJobStatus(phaseCode: PodcastPhaseCode, statusRaw?: unknown): JobStatus {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (
    status === "queued" ||
    status === "pending" ||
    status === "extracting" ||
    status === "analyzing" ||
    status === "generating" ||
    status === "synthesizing" ||
    status === "assembling" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status as JobStatus;
  }
  if (phaseCode === "retrying") return "queued";
  if (phaseCode === "completed") return "completed";
  if (phaseCode === "failed") return "failed";
  if (phaseCode === "queued") return "queued";
  return phaseCode as JobStatus;
}

function getPodcastErrorMessage(error?: string | null, errorCode?: string | null): string {
  if (errorCode && PODCAST_ERROR_TRANSLATIONS[errorCode]) {
    return PODCAST_ERROR_TRANSLATIONS[errorCode];
  }
  if (!error) return "Konvertierung fehlgeschlagen";
  return error;
}

function normalizePronunciationRulesForDedup(
  rules: Array<{ original: string; spoken: string }>
): string {
  const normalized = rules
    .map((rule) => ({
      original: String(rule.original || "").trim(),
      spoken: String(rule.spoken || "").trim(),
    }))
    .filter((rule) => rule.original.length > 0 && rule.spoken.length > 0)
    .sort((a, b) => {
      const byOriginal = a.original.localeCompare(b.original, "de");
      if (byOriginal !== 0) return byOriginal;
      return a.spoken.localeCompare(b.spoken, "de");
    });
  return normalized.length > 0 ? JSON.stringify(normalized) : "";
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", input);
  return toHex(hashBuffer);
}

async function computePodcastDedupKey(params: {
  file: File;
  style: "dialog" | "monolog";
  speakerStyle: "sachlich" | "lebendig" | "lustig" | "locker";
  ttsEngine: "xtts" | "qwen3tts" | "piper";
  ttsPreset: TtsPreset;
  pronunciationRules: Array<{ original: string; spoken: string }>;
  storageScope: "user" | "workspace";
  workspaceId?: string | null;
  projectId?: string | null;
}): Promise<string> {
  const fileBuffer = await params.file.arrayBuffer();
  const fileSha256 = await sha256Hex(fileBuffer);
  const payload = {
    v: 1,
    fileSha256,
    style: params.style,
    speakerStyle: params.speakerStyle,
    ttsEngine: params.ttsEngine || "",
    ttsPreset: params.ttsPreset || "",
    pronunciationRulesNormalized: normalizePronunciationRulesForDedup(params.pronunciationRules),
    storageScope: params.storageScope,
    workspaceId: params.storageScope === "workspace" ? params.workspaceId || "" : "",
    projectId: params.projectId || "",
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  return sha256Hex(payloadBytes);
}

export default function PptxPodcast() {
  const { toast } = useToast();
  const { user, isAuthenticated, openUpgradeModal } = useAuth();
  const { target: storageTarget, setTarget: setStorageTarget } = useStorageTarget("pptx-podcast");

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<PodcastJob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [podcastStyle] = useState<"dialog" | "monolog">("dialog");
  const [speakerStyle] = useState<"sachlich" | "lebendig" | "lustig" | "locker">("sachlich");
  // Default to Qwen3-TTS for quality. Backend will auto-fallback to Piper if Qwen3-TTS OOMs/unavailable.
  const [ttsEngine] = useState<"xtts" | "qwen3tts" | "piper">("qwen3tts");
  const [ttsPreset, setTtsPreset] = useState<TtsPreset>("lebendig");
  const [notifyEmail, setNotifyEmail] = useState<string>("");
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [showPronunciationRules, setShowPronunciationRules] = useState(false);
  const [pronunciationRules, setPronunciationRules] = useState<Array<{original: string, spoken: string}>>([]);
  const [newRuleOriginal, setNewRuleOriginal] = useState("");
  const [newRuleSpoken, setNewRuleSpoken] = useState("");
  const [dedupKey, setDedupKey] = useState<string | null>(null);
  const [isComputingDedupKey, setIsComputingDedupKey] = useState(false);
  const [duplicateJobId, setDuplicateJobId] = useState<string | null>(null);
  const [isCancellingQueuedJob, setIsCancellingQueuedJob] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notifyInitializedRef = useRef(false);
  const maxSeenPhaseRankRef = useRef(0);
  const isQueuedJob = !!job?.id && job.id.startsWith("podcast_");

  const { position, estimatedWait, isProcessing: isQueueProcessing } = useJobPosition(
    "podcast",
    isQueuedJob ? job?.id ?? null : null,
    isAuthenticated
  );

  const isPremium = user?.subscription !== "free";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (notifyInitializedRef.current) return;
    if (user?.email) {
      setNotifyEmail(user.email);
      setNotifyEnabled(true);
      notifyInitializedRef.current = true;
    }
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedFile || !isAuthenticated) {
      setDedupKey(null);
      setDuplicateJobId(null);
      setIsComputingDedupKey(false);
      return;
    }
    if (storageTarget.scope === "workspace" && !storageTarget.workspaceId) {
      setDedupKey(null);
      setDuplicateJobId(null);
      setIsComputingDedupKey(false);
      return;
    }

    setIsComputingDedupKey(true);
    computePodcastDedupKey({
      file: selectedFile,
      style: podcastStyle,
      speakerStyle,
      ttsEngine,
      ttsPreset,
      pronunciationRules,
      storageScope: storageTarget.scope,
      workspaceId: storageTarget.workspaceId || null,
      projectId: storageTarget.projectId || null,
    })
      .then((key) => {
        if (cancelled) return;
        setDedupKey(key);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[PPTX Podcast] Failed to compute dedup key:", error);
        setDedupKey(null);
      })
      .finally(() => {
        if (!cancelled) setIsComputingDedupKey(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedFile,
    isAuthenticated,
    podcastStyle,
    speakerStyle,
    ttsEngine,
    ttsPreset,
    pronunciationRules,
    storageTarget.scope,
    storageTarget.workspaceId,
    storageTarget.projectId,
  ]);

  const resetPhaseTracking = useCallback(() => {
    maxSeenPhaseRankRef.current = 0;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const validateAndSetFile = (file: File) => {
    // Check file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint"
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.pptx') && !file.name.endsWith('.ppt')) {
      toast({
        title: "Ungültiger Dateityp",
        description: "Bitte laden Sie eine PowerPoint-Datei (.pptx oder .ppt) hoch.",
        variant: "destructive",
      });
      return;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "Datei zu groß",
        description: `Die Datei darf maximal ${MAX_FILE_SIZE / 1024 / 1024}MB groß sein.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    resetPhaseTracking();
    setJob(null);
    setAudioUrl(null);
  };

  const handleConvert = async () => {
    if (!selectedFile) return;

    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um diese Funktion zu nutzen.",
        variant: "destructive",
      });
      return;
    }

    if (!isPremium) {
      openUpgradeModal('podcast');
      return;
    }

    if (duplicateJobId) {
      resetPhaseTracking();
      setJob({
        id: duplicateJobId,
        status: "queued",
        progress: 0,
        currentStage: "In Warteschlange...",
        phaseCode: "queued",
        phaseMessage: "In Warteschlange...",
        phaseRank: PHASE_RANK.queued,
      });
      startPolling(duplicateJobId);
      toast({
        title: "Job läuft bereits",
        description: "Wir verbinden Sie mit dem bereits gestarteten Job.",
      });
      return;
    }

    setIsUploading(true);
    resetPhaseTracking();
    setJob({
      id: "",
      status: "pending",
      progress: 0,
      currentStage: "Wird hochgeladen...",
      phaseCode: "queued",
      phaseMessage: "Wird hochgeladen...",
      phaseRank: PHASE_RANK.queued,
    });

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("storageScope", storageTarget.scope);
      if (storageTarget.scope === "workspace") {
        if (storageTarget.workspaceId) {
          formData.append("workspaceId", storageTarget.workspaceId);
        }
        if (storageTarget.projectId) {
          formData.append("projectId", storageTarget.projectId);
        }
      }
      if (notifyEnabled) {
        if (!notifyEmail || !notifyEmail.includes("@")) {
          throw new Error("Bitte geben Sie eine gültige E-Mail-Adresse an.");
        }
        formData.append("notifyEmail", notifyEmail);
      }
      // Add pronunciation rules as JSON
      if (pronunciationRules.length > 0) {
        formData.append("pronunciationRules", JSON.stringify(pronunciationRules));
      }

      const params = new URLSearchParams({
        style: podcastStyle,
        speakerStyle,
        ttsEngine,
        ttsPreset,
      });

      const response = await fetch(`/api/podcast/convert?${params.toString()}`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data?.jobId) {
          const existingJobId = String(data.jobId);
          setDuplicateJobId(existingJobId);
          const dedupedStatus = data?.status === "queued" ? "queued" : "extracting";
          const phaseCode = dedupedStatus === "queued" ? "queued" : "extracting";
          resetPhaseTracking();
          setJob({
            id: existingJobId,
            status: dedupedStatus,
            progress: 0,
            currentStage: data?.message || "In Warteschlange...",
            phaseCode,
            phaseMessage: data?.message || "In Warteschlange...",
            phaseRank: PHASE_RANK[phaseCode],
          });
          startPolling(existingJobId);
          toast({
            title: "Bereits gestartet",
            description: "Ein identischer Podcast-Job läuft bereits und wird weiterverwendet.",
          });
          return;
        }
        throw new Error(data.message || data.error || "Upload fehlgeschlagen");
      }

      // Start polling for status
      const queued = data.status === "queued";
      const phaseCode = queued ? "queued" : "extracting";
      resetPhaseTracking();
      setJob({
        id: data.jobId,
        status: queued ? "queued" : "extracting",
        progress: 0,
        currentStage: queued ? "In Warteschlange..." : "Extraktion gestartet...",
        phaseCode,
        phaseMessage: queued ? "In Warteschlange..." : "Extraktion gestartet...",
        phaseRank: PHASE_RANK[phaseCode],
      });

      startPolling(data.jobId);

      toast({
        title: "Konvertierung gestartet",
        description: "Ihre Präsentation wird in einen Podcast umgewandelt.",
      });

    } catch (error) {
      setJob(null);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Upload fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const startPolling = useCallback((jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/podcast/status/${jobId}`);

        if (!response.ok) {
          throw new Error("Status-Abfrage fehlgeschlagen");
        }

        const data = await response.json();

        const incomingPhaseCode = normalizePhaseCode(
          data.phaseCode || data.phase,
          data.status,
          data.phaseMessage || data.currentStage
        );
        const incomingPhaseRankValue = Number(data.phaseRank);
        const incomingPhaseRank = Number.isFinite(incomingPhaseRankValue)
          ? incomingPhaseRankValue
          : PHASE_RANK[incomingPhaseCode];
        const incomingPhaseMessage = String(data.phaseMessage || data.currentStage || "").trim() || "";
        const nextStatus = toJobStatus(incomingPhaseCode, data.status);

        let shouldApply = true;
        setJob((prev) => {
          const prevRank = prev?.phaseRank ?? (prev?.phaseCode ? PHASE_RANK[prev.phaseCode] : 0);
          const gateRank = Math.max(maxSeenPhaseRankRef.current, prevRank);
          if (incomingPhaseRank < gateRank) {
            shouldApply = false;
            return prev;
          }

          maxSeenPhaseRankRef.current = Math.max(gateRank, incomingPhaseRank);

          return {
            id: jobId,
            status: nextStatus,
            progress: data.progress || 0,
            currentStage: data.currentStage || incomingPhaseMessage,
            phaseCode: incomingPhaseCode,
            phaseMessage: incomingPhaseMessage || data.currentStage || "",
            phaseRank: incomingPhaseRank,
            pipelinePath: data.pipelinePath || null,
            timings: data.timings || null,
            chapters: data.chapters,
            durationSeconds: data.durationSeconds,
            downloadUrl: data.downloadUrl,
            error: data.error,
            errorCode: data.errorCode || null,
            retryCount: data.retryCount,
            gpuWaitMs: data.gpuWaitMs,
            lastHeartbeatAt: data.lastHeartbeatAt || null,
          };
        });

        // Stop polling if completed or failed
        if (shouldApply && (nextStatus === "completed" || nextStatus === "failed")) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          if (nextStatus === "completed") {
            toast({
              title: "Podcast erstellt",
              description: "Ihr Podcast ist bereit zum Download!",
            });
          } else if (nextStatus === "failed") {
            toast({
              title: "Fehler",
              description: getPodcastErrorMessage(data.error, data.errorCode),
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000);
  }, [toast]);

  useEffect(() => {
    if (!isAuthenticated || !dedupKey) {
      setDuplicateJobId(null);
      return;
    }
    if (storageTarget.scope === "workspace" && !storageTarget.workspaceId) {
      setDuplicateJobId(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;

    const checkForDuplicate = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const params = new URLSearchParams({
          limit: "80",
          scope: storageTarget.scope,
        });
        if (storageTarget.scope === "workspace" && storageTarget.workspaceId) {
          params.set("workspaceId", storageTarget.workspaceId);
        }
        const response = await fetch(`/api/jobs?${params.toString()}`, {
          credentials: "include",
        });
        if (!response.ok) return;
        const data = await response.json() as { jobs?: RecentJob[] };
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        const duplicate = jobs.find((candidate) =>
          candidate.queue === "podcast" &&
          (candidate.status === "pending" || candidate.status === "active") &&
          candidate.dedupKey === dedupKey
        );
        if (cancelled) return;
        setDuplicateJobId(duplicate?.id || null);

        if (duplicate && job?.id !== duplicate.id) {
          resetPhaseTracking();
          setJob({
            id: duplicate.id,
            status: duplicate.status === "pending" ? "queued" : "extracting",
            progress: duplicate.progress?.percent || 0,
            currentStage:
              duplicate.progress?.stage ||
              (duplicate.status === "pending" ? "In Warteschlange..." : "Wird verarbeitet..."),
            phaseCode: duplicate.status === "pending" ? "queued" : "extracting",
            phaseMessage:
              duplicate.progress?.stage ||
              (duplicate.status === "pending" ? "In Warteschlange..." : "Wird verarbeitet..."),
            phaseRank: duplicate.status === "pending" ? PHASE_RANK.queued : PHASE_RANK.extracting,
          });
          startPolling(duplicate.id);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[PPTX Podcast] Duplicate check failed:", error);
        }
      } finally {
        inFlight = false;
      }
    };

    void checkForDuplicate();
    timer = window.setInterval(checkForDuplicate, 15000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [
    isAuthenticated,
    dedupKey,
    storageTarget.scope,
    storageTarget.workspaceId,
    startPolling,
    resetPhaseTracking,
    job?.id,
  ]);

  const handleCancelQueuedJob = useCallback(async () => {
    if (!job?.id) return;
    setIsCancellingQueuedJob(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Abbrechen fehlgeschlagen");
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      resetPhaseTracking();
      setJob(null);
      setDuplicateJobId(null);
      toast({
        title: "Job abgebrochen",
        description: "Der wartende Podcast-Job wurde entfernt.",
      });
    } catch (error) {
      toast({
        title: "Abbrechen fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsCancellingQueuedJob(false);
    }
  }, [job?.id, resetPhaseTracking, toast]);

  const handleDownload = async () => {
    if (!job?.id) return;

    try {
      const response = await fetch(`/api/podcast/download/${job.id}`);

      if (!response.ok) {
        throw new Error("Download fehlgeschlagen");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedFile?.name.replace(/\.(pptx?|ppt)$/i, '')}_podcast.m4b`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const handlePlayPreview = async () => {
    if (!job?.id) return;

    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      return;
    }

    try {
      const response = await fetch(`/api/podcast/download/${job.id}`);

      if (!response.ok) {
        throw new Error("Audio laden fehlgeschlagen");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Play after state update
      setTimeout(() => {
        audioRef.current?.play();
      }, 100);
    } catch (error) {
      toast({
        title: "Wiedergabe fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStageIndex = (currentJob: PodcastJob) => {
    const phaseCode = currentJob.phaseCode || normalizePhaseCode(currentJob.status, currentJob.status, currentJob.currentStage);
    const stageKey = phaseToStageKey(phaseCode);
    return STAGES.findIndex((s) => s.key === stageKey);
  };

  const clearFile = () => {
    resetPhaseTracking();
    setSelectedFile(null);
    setJob(null);
    setAudioUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <PageLayout>
      <SEO
        title="PowerPoint to Podcast - VoxDrop"
        description="Manche Präsentationen sind zu komplex, um sie vollständig barrierefrei zu gestalten. Wandeln Sie sie einfach in eine Podcast-Episode um – mit KI-generierten Bildbeschreibungen und natürlicher Sprachausgabe."
      />

      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Headphones className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            PowerPoint to Podcast
          </h1>
          <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
            Komplexe Präsentationen einfach in barrierefreie Podcasts umwandeln
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
          <div className="p-6">
            {!selectedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                  ${isDragging
                    ? "border-amber-500 bg-amber-50"
                    : "border-slate-200 hover:border-amber-300 hover:bg-slate-50"
                  }
                `}
              >
                <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? "text-amber-500" : "text-slate-400"}`} />
                <p className="text-lg font-medium text-slate-700 mb-2">
                  PowerPoint-Datei hochladen
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  Ziehen Sie eine .pptx Datei hierher oder klicken Sie zum Auswählen
                </p>
                <p className="text-xs text-slate-400">
                  Maximal {MAX_FILE_SIZE / 1024 / 1024}MB
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{selectedFile.name}</p>
                  <p className="text-sm text-slate-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  disabled={isUploading || (job?.status !== "completed" && job?.status !== "failed" && job !== null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="mt-6">
              <StorageTargetPicker
                value={storageTarget}
                onChange={setStorageTarget}
                helperText="Wähle, ob der Podcast privat bleibt oder im Workspace verfügbar ist."
              />
            </div>

            {selectedFile && !job && (
              <>
                {/* TTS Presets */}
                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm font-medium text-slate-800">Stimmprofil (Qwen)</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Steuert die Lebendigkeit der Ausgabe. Die Sprecher-Identitaet bleibt zweitrangig.
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {TTS_PRESETS.map((preset) => {
                      const isActive = ttsPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setTtsPreset(preset.id)}
                          className={`text-left p-3 rounded-lg border transition-colors ${
                            isActive
                              ? "border-amber-500 bg-amber-50"
                              : "border-slate-200 bg-white hover:border-amber-300"
                          }`}
                        >
                          <p className={`text-sm font-medium ${isActive ? "text-amber-800" : "text-slate-800"}`}>
                            {preset.label}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">{preset.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pronunciation Rules */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowPronunciationRules(!showPronunciationRules)}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Aussprache-Regeln ({pronunciationRules.length})</span>
                    {showPronunciationRules ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showPronunciationRules && (
                    <div className="mt-3 p-4 bg-slate-50 rounded-xl">
                      <p className="text-xs text-slate-500 mb-3">
                        Definieren Sie, wie Abkürzungen und Fachbegriffe ausgesprochen werden sollen.
                      </p>

                      {/* Existing Rules */}
                      <div className="space-y-2 mb-4">
                        {pronunciationRules.map((rule, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                            <span className="font-mono text-sm text-slate-700 flex-1">{rule.original}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-sm text-slate-600 flex-1">{rule.spoken}</span>
                            <button
                              onClick={() => {
                                setPronunciationRules(rules => rules.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add New Rule */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newRuleOriginal}
                          onChange={(e) => setNewRuleOriginal(e.target.value)}
                          placeholder="Begriff (z.B. API)"
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        />
                        <span className="text-slate-400">→</span>
                        <input
                          type="text"
                          value={newRuleSpoken}
                          onChange={(e) => setNewRuleSpoken(e.target.value)}
                          placeholder="Aussprache (z.B. Eh Pie Ei)"
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            if (newRuleOriginal.trim() && newRuleSpoken.trim()) {
                              setPronunciationRules(rules => [
                                ...rules,
                                { original: newRuleOriginal.trim(), spoken: newRuleSpoken.trim() }
                              ]);
                              setNewRuleOriginal("");
                              setNewRuleSpoken("");
                            }
                          }}
                          disabled={!newRuleOriginal.trim() || !newRuleSpoken.trim()}
                          className="shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Processing Time Warning */}
                <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Verarbeitung dauert einige Minuten
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Die Podcast-Generierung beinhaltet Bildanalyse, Skripterstellung und Sprachsynthese.
                        Je nach Anzahl der Folien kann dies 2-10 Minuten dauern.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Email Notification Option */}
                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={notifyEnabled}
                      onChange={(e) => setNotifyEnabled(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="flex-1">
                      Per E-Mail benachrichtigen, sobald der Podcast fertig ist
                    </span>
                  </label>

                  {notifyEnabled && (
                    <div className="mt-3">
                      <label htmlFor="notify-email" className="block text-sm font-medium text-slate-700 mb-2">
                        E-Mail-Adresse für Benachrichtigung
                      </label>
                      <input
                        id="notify-email"
                        type="email"
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder="ihre@email.de"
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Wir senden Ihnen eine kurze Benachrichtigung inkl. Download-Link.
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleConvert}
                  disabled={isUploading || isComputingDedupKey || !!duplicateJobId}
                  className="w-full h-12 text-base font-medium rounded-xl bg-amber-600 hover:bg-amber-700 mt-4"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : isComputingDedupKey ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Pruefe laufende Jobs...
                    </>
                  ) : duplicateJobId ? (
                    <>
                      <Clock className="w-5 h-5 mr-2" />
                      Bereits gestartet
                    </>
                  ) : (
                    <>
                      <Headphones className="w-5 h-5 mr-2" />
                      In Podcast umwandeln
                      {!isPremium && <Crown className="w-4 h-4 ml-2 text-amber-300" />}
                    </>
                  )}
                </Button>
                {duplicateJobId && (
                  <p className="mt-2 text-xs text-amber-700">
                    Ein identischer Podcast-Job läuft bereits. Job-ID: {duplicateJobId}
                  </p>
                )}
              </>
            )}

            {!isPremium && (
              <p className="text-sm text-slate-600 mt-3 text-center">
                <Crown className="w-4 h-4 inline mr-1 text-amber-500" />
                PowerPoint to Podcast ist eine Premium-Funktion.{" "}
                <button onClick={() => openUpgradeModal('podcast')} className="text-violet-600 hover:underline">
                  Jetzt upgraden
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Progress Section */}
        {job && job.status !== "completed" && job.status !== "failed" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-slate-900">Konvertierung läuft</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    {job.phaseMessage || job.currentStage}
                  </div>
                  {isQueuedJob && (job.status === "queued" || job.status === "pending") && (
                    <Button
                      onClick={handleCancelQueuedJob}
                      variant="outline"
                      size="sm"
                      disabled={isCancellingQueuedJob}
                      className="h-8 rounded-lg"
                    >
                      {isCancellingQueuedJob ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <X className="w-4 h-4 mr-1" />
                      )}
                      Abbrechen
                    </Button>
                  )}
                </div>
              </div>

              {/* Stage Progress */}
              <div className="space-y-3">
                {STAGES.map((stage, index) => {
                  const currentIndex = getStageIndex(job);
                  const isComplete = index < currentIndex;
                  const isCurrent = index === currentIndex;
                  const isPending = index > currentIndex;

                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center shrink-0
                        ${isComplete ? "bg-green-100 text-green-600" :
                          isCurrent ? "bg-amber-100 text-amber-600" :
                          "bg-slate-100 text-slate-400"}
                      `}>
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isCurrent ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <span className="text-sm font-medium">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isPending ? "text-slate-400" : "text-slate-900"}`}>
                          {stage.label}
                        </p>
                        <p className={`text-sm ${isPending ? "text-slate-300" : "text-slate-500"}`}>
                          {stage.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <p className="text-sm text-slate-500 mt-2 text-center">
                  {job.progress}% abgeschlossen
                </p>
              </div>

              {isQueuedJob && position !== null && (
                <div className="mt-4">
                  <QueuePositionDisplay
                    position={position}
                    estimatedWait={estimatedWait}
                    isProcessing={isQueueProcessing}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error State */}
        {job?.status === "failed" && (
          <div className="bg-red-50 rounded-2xl border border-red-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Konvertierung fehlgeschlagen</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    {getPodcastErrorMessage(job.error, job.errorCode)}
                  </p>
                  <Button
                    onClick={clearFile}
                    variant="outline"
                    className="h-10 rounded-lg"
                  >
                    Erneut versuchen
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completed State */}
        {job?.status === "completed" && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Podcast erstellt</h3>
                  <p className="text-sm text-slate-500">
                    {job.durationSeconds && `Dauer: ${formatDuration(job.durationSeconds)}`}
                    {job.chapters && ` | ${job.chapters.length} Kapitel`}
                  </p>
                </div>
              </div>

              {/* Audio Player */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handlePlayPreview}
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </Button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Volume2 className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">
                        {selectedFile?.name.replace(/\.(pptx?|ppt)$/i, '')} - Podcast
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      M4B mit Kapitelmarkern
                    </p>
                  </div>
                </div>

                {audioUrl && (
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                )}
              </div>

              {/* Chapters Preview */}
              {job.chapters && job.chapters.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Kapitel</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {job.chapters.map((chapter, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg text-sm"
                      >
                        <span className="text-slate-400 w-6">{idx + 1}.</span>
                        <span className="flex-1 text-slate-700 truncate">{chapter.title}</span>
                        <span className="text-slate-400">{formatDuration(chapter.start)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Download Button */}
              <Button
                onClick={handleDownload}
                className="w-full h-12 text-base font-medium rounded-xl bg-amber-600 hover:bg-amber-700"
              >
                <Download className="w-5 h-5 mr-2" />
                Podcast herunterladen (.m4b)
              </Button>
            </div>
          </div>
        )}

        {/* Funktionen Section - when no file selected */}
        {!job && !selectedFile && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Funktionen</h3>
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                KI-Bildbeschreibungen für alle Grafiken
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                Natürliche Sprachsynthese auf Deutsch
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                Dialog oder Monolog-Format wählbar
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                Kapitelmarker pro Folie (M4B)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                Eigene Aussprache-Regeln definierbar
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                DSGVO-konforme lokale Verarbeitung
              </li>
            </ul>
          </div>
        )}

        {/* Im Behördenalltag */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-4 text-lg">Im Behördenalltag</h3>
          <div className="prose prose-gray max-w-none text-slate-600">
            <p className="mb-4">
              Manche PowerPoint-Präsentationen sind aufgrund ihrer Komplexität (viele Grafiken, Diagramme,
              Animationen) nur schwer vollständig barrierefrei zu gestalten. In solchen Fällen bietet
              ein Podcast-Format eine sinnvolle Alternative für blinde und sehbehinderte Menschen.
            </p>
            <p className="mb-4">
              Die KI analysiert jede Folie, beschreibt alle visuellen Elemente und generiert ein
              natürlich klingendes Skript. Das Ergebnis ist ein professioneller Podcast mit Kapitelmarkern,
              der in jedem Podcast-Player oder Screenreader abgespielt werden kann.
            </p>
            <p>
              Besonders geeignet für Schulungsunterlagen, Jahresberichte mit vielen Grafiken und
              Informationsveranstaltungen, die als Audio-on-Demand bereitgestellt werden sollen.
            </p>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
