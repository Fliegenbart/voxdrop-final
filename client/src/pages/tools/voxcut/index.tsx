import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useJob, translateError } from "@/hooks/use-job";
import { useSession, type SessionFile } from "@/hooks/use-session";
import { QueuePositionDisplay, useJobPosition } from "@/components/QueueStatus";
import {
  Upload, Download, Loader2,
  CheckCircle2, Play, Pause, X, AlertCircle,
  Sparkles, Trash2, Eye, EyeOff,
  RotateCcw, Scissors, Hand, Clock, FileText,
  Volume2, VolumeX, SkipBack, SkipForward,
  Accessibility, Languages, ChevronDown, ChevronUp,
  Mic, MicOff, Wand2, Timer,
  Snowflake, FastForward, History,
  Send, Brain, Lightbulb,
  Cloud, Check,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import {
  parseSrt,
  segmentsToSrt,
  type SrtSegment,
} from "@/lib/subtitles/srt";

// ─── Types ───────────────────────────────────────────────────────────────

type EditorStep = "upload" | "transcribing" | "editing" | "exporting";

// AI Effect types that VoxCut supports
interface VoxCutEffect {
  id: string;
  type: "freeze" | "speed" | "cut" | "silence" | "keep_only";
  startSeconds: number;
  endSeconds?: number;
  durationSeconds?: number;
  factor?: number; // for speed effects
  label: string;
  createdAt: number;
}

interface AiCommandHistoryEntry {
  id: string;
  input: string;
  effect: VoxCutEffect | null;
  action: string;
  success: boolean;
  timestamp: number;
}

// German filler word patterns
const FILLER_PATTERNS = [
  /^(äh|ähm|öhm|öh|hm+|mhm|hmm|em|ehm|em)$/i,
  /^(also|halt|quasi|sozusagen|quasi|irgendwie|eigentlich|gewissermaßen)$/i,
  /^(ja|ne|nee|nö|ok|okay|genau|richtig|eben)$/i,
];

function isFiller(word: string): boolean {
  const clean = word.replace(/[.,!?;:"""()[\]{}–—-]/g, "").trim();
  if (!clean) return false;
  return FILLER_PATTERNS.some((p) => p.test(clean));
}

// ─── Formatting ──────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimeFull(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// AI command example suggestions
const AI_SUGGESTIONS = [
  "Hier 3 Sekunden einfrieren",
  "Alle Füllwörter entfernen",
  "Von 0:30 bis 0:45 rausschneiden",
  "Doppelte Geschwindigkeit ab Minute 1",
  "Nur die ersten 2 Minuten behalten",
  "1 Sekunde Pause bei 0:20 einfuegen",
  "Ab Sekunde 10 bis Sekunde 25 entfernen",
  "Alles nach Minute 3 abschneiden",
];

// ─── Main Component ──────────────────────────────────────────────────────

export default function VoxCut() {
  const { toast } = useToast();
  const { isAuthenticated, refreshUser } = useAuth();
  const { sessionId, uploadFile, files: sessionFiles, getFileUrl, formatFileSize } = useSession();

  // ─── Core State ──────────────────────────────────────────────────────

  const [step, setStep] = useState<EditorStep>("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  // Transcription
  const [srtSegments, setSrtSegments] = useState<SrtSegment[]>([]);
  const [deletedSegments, setDeletedSegments] = useState<Set<number>>(new Set());
  const [fillerSegmentIndices, setFillerSegmentIndices] = useState<Set<number>>(new Set());
  const [showFillers, setShowFillers] = useState(true);

  // Video player
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Export
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportedFileId, setExportedFileId] = useState<string | null>(null);

  // Accessibility features
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeSimpleLanguage, setIncludeSimpleLanguage] = useState(false);

  // Drag & drop
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadingSessionFileId, setLoadingSessionFileId] = useState<string | null>(null);

  // Undo stack
  const [undoStack, setUndoStack] = useState<Set<number>[]>([]);

  // Refs for segment scrolling
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const editorScrollRef = useRef<HTMLDivElement>(null);

  // Session file for uploaded video
  const [sessionFileId, setSessionFileId] = useState<string | null>(null);

  // ─── AI Command State ─────────────────────────────────────────────────

  const [aiCommand, setAiCommand] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiEffects, setAiEffects] = useState<VoxCutEffect[]>([]);
  const [commandHistory, setCommandHistory] = useState<AiCommandHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // Voice input
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // ─── Voice-Over (TTS) State ─────────────────────────────────────────
  const [showVoiceover, setShowVoiceover] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  const [voiceoverVoice, setVoiceoverVoice] = useState<"male" | "female">("female");
  const [voiceoverTtsEngine, setVoiceoverTtsEngine] = useState<"qwen3tts" | "xtts" | "piper">("qwen3tts");
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceoverProgress, setVoiceoverProgress] = useState(0);
  const [voiceoverStatus, setVoiceoverStatus] = useState("");
  const [voiceoverAudioUrl, setVoiceoverAudioUrl] = useState<string | null>(null);
  const [voiceoverResultFileId, setVoiceoverResultFileId] = useState<string | null>(null);
  const voiceoverPollTimeoutRef = useRef<number | null>(null);
  const voiceoverImportedJobRef = useRef<string | null>(null);

  // ─── Transcription Job ───────────────────────────────────────────────

  const transcriptionJob = useJob({
    onComplete: async (job) => {
      try {
        const response = await fetch(`/api/jobs/${job.id}/transcription`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Transkription konnte nicht geladen werden");
        const data = await response.json();

        const segments = parseSrt(data.srt);
        setSrtSegments(segments);

        // Detect filler segments
        const fillers = new Set<number>();
        segments.forEach((seg, i) => {
          const words = seg.text.trim().split(/\s+/);
          if (words.length <= 2 && words.every((w) => isFiller(w))) {
            fillers.add(i);
          }
        });
        setFillerSegmentIndices(fillers);

        await refreshUser();
        setStep("editing");
        toast({
          title: "Transkription abgeschlossen",
          description: `${segments.length} Segmente erkannt · ${fillers.size} Füllwörter markiert`,
        });
      } catch (err: any) {
        toast({
          title: "Fehler",
          description: err.message || "Transkription fehlgeschlagen",
          variant: "destructive",
        });
        setStep("upload");
      }
    },
    onError: (error) => {
      toast({
        title: "Transkription fehlgeschlagen",
        description: translateError(error),
        variant: "destructive",
      });
      setStep("upload");
    },
  });

  const {
    position: transcriptionPosition,
    estimatedWait: transcriptionEstimatedWait,
    isProcessing: transcriptionIsProcessing,
  } = useJobPosition("transcription", transcriptionJob.job?.id ?? null, isAuthenticated);

  // ─── File Upload ─────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File, skipTranscription = false) => {
      if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
        toast({
          title: "Ungueltiges Format",
          description: "Bitte eine Video- oder Audiodatei hochladen.",
          variant: "destructive",
        });
        return;
      }

      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      if (!isAuthenticated) {
        toast({
          title: "Anmeldung erforderlich",
          description: "Bitte melden Sie sich an.",
          variant: "destructive",
        });
        return;
      }

      // Skip transcription for videos without audio
      if (skipTranscription) {
        setSrtSegments([]);
        setFillerSegmentIndices(new Set());
        setStep("editing");
        setShowVoiceover(true);
        toast({
          title: "Video geladen",
          description: "Ohne Transkription. Du kannst jetzt eine KI-Stimme drunterlegen oder den Schnitt steuern.",
        });
        return;
      }

      // Start transcription
      setStep("transcribing");

      const formData = new FormData();
      formData.append("audio", file);
      formData.append("mode", "quality");

      const jobId = await transcriptionJob.submitJob("/api/jobs/transcribe", formData);
      if (!jobId) {
        toast({
          title: "Fehler",
          description: "Transkription konnte nicht gestartet werden.",
          variant: "destructive",
        });
        setStep("upload");
      }
    },
    [isAuthenticated, toast, transcriptionJob],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileUploadNoAudio = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file, true);
    },
    [handleFile],
  );

  const playableSessionFiles = useMemo(
    () => sessionFiles.filter((file) => file.mimeType.startsWith("video/") || file.mimeType.startsWith("audio/")),
    [sessionFiles],
  );

  const handleSessionFileSelect = useCallback(async (sessionFile: SessionFile) => {
    setLoadingSessionFileId(sessionFile.id);
    try {
      const response = await fetch(getFileUrl(sessionFile.id), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Session-Datei konnte nicht geladen werden");
      }

      const blob = await response.blob();
      const file = new File([blob], sessionFile.name, {
        type: sessionFile.mimeType || blob.type || "application/octet-stream",
      });

      await handleFile(file);
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err?.message || "Session-Datei konnte nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoadingSessionFileId(null);
    }
  }, [getFileUrl, handleFile, toast]);

  // ─── Voice-Over (TTS) Logic ─────────────────────────────────────────

  const importVoiceoverToSession = useCallback(async (jobId: string) => {
    if (voiceoverImportedJobRef.current === jobId) return null;
    voiceoverImportedJobRef.current = jobId;

    const res = await fetch(`/api/voiceover/download/${jobId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Download fehlgeschlagen");
    const blob = await res.blob();

    const ext = blob.type === "audio/wav" ? "wav" : "mp3";
    const file = new File(
      [blob],
      `voiceover-${voiceoverVoice}-${Date.now()}.${ext}`,
      { type: blob.type || "audio/mpeg" }
    );

    const uploaded = await uploadFile(file, { forceResumable: true });
    if (!uploaded) throw new Error("Upload fehlgeschlagen");

    setVoiceoverResultFileId(uploaded.id);
    return uploaded;
  }, [uploadFile, voiceoverVoice]);

  const startVoiceoverGeneration = useCallback(async () => {
    if (!voiceoverText.trim()) {
      toast({ title: "Kein Text", description: "Bitte gib einen Text fuer das Voice-Over ein.", variant: "destructive" });
      return;
    }

    setIsGeneratingVoiceover(true);
    setVoiceoverProgress(0);
    setVoiceoverStatus("Voice-Over wird generiert...");
    setVoiceoverAudioUrl(null);
    setVoiceoverResultFileId(null);
    voiceoverImportedJobRef.current = null;

    try {
      const res = await fetch("/api/voiceover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: voiceoverText,
          voice: voiceoverVoice,
          ttsEngine: voiceoverTtsEngine,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Voice-Over Generierung fehlgeschlagen");

      const jobId = data.jobId as string;

      const poll = async () => {
        const statusRes = await fetch(`/api/voiceover/status/${jobId}`, { credentials: "include" });
        const status = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) throw new Error(status?.error || "Status-Abfrage fehlgeschlagen");

        setVoiceoverProgress(status.progress || 0);
        setVoiceoverStatus(status.currentStage || "");

        if (status.status === "completed") {
          setVoiceoverAudioUrl(`/api/voiceover/download/${jobId}`);
          try {
            await importVoiceoverToSession(jobId);
            toast({ title: "KI Sprache erzeugt", description: "Audio wurde generiert und kann heruntergeladen werden." });
          } finally {
            setIsGeneratingVoiceover(false);
          }
          return;
        }
        if (status.status === "failed") throw new Error(status.error || "Voice-Over fehlgeschlagen");
        voiceoverPollTimeoutRef.current = window.setTimeout(poll, 1000);
      };

      voiceoverPollTimeoutRef.current = window.setTimeout(poll, 500);
    } catch (err: any) {
      setIsGeneratingVoiceover(false);
      toast({ title: "Voice-Over fehlgeschlagen", description: err?.message || String(err), variant: "destructive" });
    }
  }, [toast, voiceoverText, voiceoverVoice, voiceoverTtsEngine, importVoiceoverToSession]);

  // Cleanup voiceover polling on unmount
  useEffect(() => {
    return () => {
      if (voiceoverPollTimeoutRef.current) window.clearTimeout(voiceoverPollTimeoutRef.current);
    };
  }, []);

  // ─── Video Player Controls ──────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Find active segment
      const idx = srtSegments.findIndex(
        (seg) => video.currentTime >= seg.startSeconds && video.currentTime <= seg.endSeconds,
      );
      setActiveSegmentIndex(idx >= 0 ? idx : null);
    };

    const onDurationChange = () => setVideoDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [srtSegments]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
  };

  const skipSeconds = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + delta, videoDuration));
  };

  // ─── Segment Editing ────────────────────────────────────────────────

  const toggleSegmentDeleted = (index: number) => {
    setUndoStack((prev) => [...prev, new Set(deletedSegments)]);
    setDeletedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const deleteAllFillers = () => {
    setUndoStack((prev) => [...prev, new Set(deletedSegments)]);
    setDeletedSegments((prev) => {
      const next = new Set(prev);
      fillerSegmentIndices.forEach((i) => next.add(i));
      return next;
    });
    toast({
      title: "Füllwörter entfernt",
      description: `${fillerSegmentIndices.size} Segmente markiert`,
    });
  };

  const undoLastEdit = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setDeletedSegments(prev);
    setUndoStack((s) => s.slice(0, -1));
  };

  const resetAllEdits = () => {
    setUndoStack((prev) => [...prev, new Set(deletedSegments)]);
    setDeletedSegments(new Set());
    setAiEffects([]);
  };

  // Scroll to active segment
  useEffect(() => {
    if (activeSegmentIndex === null) return;
    const el = segmentRefs.current.get(activeSegmentIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeSegmentIndex]);

  // ─── AI Command Processing ──────────────────────────────────────────

  const processAiCommand = async (commandText: string) => {
    if (!commandText.trim()) return;

    setIsAiProcessing(true);
    const historyEntry: AiCommandHistoryEntry = {
      id: generateId(),
      input: commandText.trim(),
      effect: null,
      action: "",
      success: false,
      timestamp: Date.now(),
    };

    try {
      // Check for local commands first (no API needed)
      const lowerCmd = commandText.toLowerCase().trim();

      if (lowerCmd.includes("fuellwort") || lowerCmd.includes("füllwort") || lowerCmd.includes("filler")) {
        deleteAllFillers();
        historyEntry.action = "remove_fillers";
        historyEntry.success = true;
        historyEntry.effect = {
          id: generateId(),
          type: "cut",
          startSeconds: 0,
          label: `Füllwörter entfernt (${fillerSegmentIndices.size})`,
          createdAt: Date.now(),
        };
        setCommandHistory((prev) => [historyEntry, ...prev]);
        setAiCommand("");
        setIsAiProcessing(false);
        return;
      }

      // Send to AI backend for interpretation
      const response = await fetch("/api/video-ai/interpret-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: commandText,
          durationSeconds: videoDuration,
          currentTimeSeconds: currentTime,
          mode: "voxcut",
          transcript: srtSegments.map((s) => `[${formatTime(s.startSeconds)}] ${s.text}`).join("\n"),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || err.message || "KI-Befehl fehlgeschlagen");
      }

      const data = await response.json();
      const command = data.command;

      historyEntry.action = command.action;

      // Apply the command
      switch (command.action) {
        case "trim": {
          const { startSeconds, endSeconds } = command.params;
          // Delete segments outside the trim range
          setUndoStack((prev) => [...prev, new Set(deletedSegments)]);
          setDeletedSegments((prev) => {
            const next = new Set(prev);
            srtSegments.forEach((seg, i) => {
              if (seg.endSeconds <= startSeconds || seg.startSeconds >= endSeconds) {
                next.add(i);
              }
            });
            return next;
          });
          historyEntry.success = true;
          historyEntry.effect = {
            id: generateId(),
            type: "keep_only",
            startSeconds,
            endSeconds,
            label: `Behalten: ${formatTime(startSeconds)} – ${formatTime(endSeconds)}`,
            createdAt: Date.now(),
          };
          setAiEffects((prev) => [...prev, historyEntry.effect!]);
          toast({
            title: "Schnitt angewendet",
            description: `Nur ${formatTime(startSeconds)} – ${formatTime(endSeconds)} behalten`,
          });
          break;
        }

        case "cut": {
          const { startSeconds, endSeconds } = command.params;
          // Delete segments within the cut range
          setUndoStack((prev) => [...prev, new Set(deletedSegments)]);
          setDeletedSegments((prev) => {
            const next = new Set(prev);
            srtSegments.forEach((seg, i) => {
              if (seg.startSeconds >= startSeconds && seg.endSeconds <= endSeconds) {
                next.add(i);
              }
            });
            return next;
          });
          historyEntry.success = true;
          historyEntry.effect = {
            id: generateId(),
            type: "cut",
            startSeconds,
            endSeconds,
            label: `Geschnitten: ${formatTime(startSeconds)} – ${formatTime(endSeconds)}`,
            createdAt: Date.now(),
          };
          setAiEffects((prev) => [...prev, historyEntry.effect!]);
          toast({
            title: "Schnitt angewendet",
            description: `${formatTime(startSeconds)} – ${formatTime(endSeconds)} entfernt`,
          });
          break;
        }

        case "seek": {
          const { timeSeconds } = command.params;
          seekTo(timeSeconds);
          historyEntry.success = true;
          toast({
            title: "Navigation",
            description: `Gesprungen zu ${formatTime(timeSeconds)}`,
          });
          break;
        }

        case "freeze_frame": {
          const timeSeconds = command.params.timeSeconds ?? command.params.atSeconds;
          const duration = command.params.durationSeconds ?? 3;
          const effect: VoxCutEffect = {
            id: generateId(),
            type: "freeze",
            startSeconds: timeSeconds,
            durationSeconds: duration,
            label: `Freeze ${duration}s bei ${formatTime(timeSeconds)}`,
            createdAt: Date.now(),
          };
          setAiEffects((prev) => [...prev, effect]);
          historyEntry.success = true;
          historyEntry.effect = effect;
          seekTo(timeSeconds);
          toast({
            title: "Freeze Frame",
            description: `${duration}s Standbild bei ${formatTime(timeSeconds)}`,
          });
          break;
        }

        case "speed": {
          const { startSeconds, endSeconds, factor } = command.params;
          const effect: VoxCutEffect = {
            id: generateId(),
            type: "speed",
            startSeconds,
            endSeconds,
            factor: factor || 2,
            label: `${factor || 2}x Speed: ${formatTime(startSeconds)} – ${formatTime(endSeconds)}`,
            createdAt: Date.now(),
          };
          setAiEffects((prev) => [...prev, effect]);
          historyEntry.success = true;
          historyEntry.effect = effect;
          toast({
            title: "Geschwindigkeit",
            description: `${factor || 2}x ab ${formatTime(startSeconds)}`,
          });
          break;
        }

        case "silence": {
          const atSeconds = command.params.atSeconds ?? command.params.timeSeconds ?? currentTime;
          const duration = command.params.durationSeconds ?? 1;
          const effect: VoxCutEffect = {
            id: generateId(),
            type: "silence",
            startSeconds: atSeconds,
            durationSeconds: duration,
            label: `${duration}s Pause bei ${formatTime(atSeconds)}`,
            createdAt: Date.now(),
          };
          setAiEffects((prev) => [...prev, effect]);
          historyEntry.success = true;
          historyEntry.effect = effect;
          toast({
            title: "Pause eingefuegt",
            description: `${duration}s Stille bei ${formatTime(atSeconds)}`,
          });
          break;
        }

        case "remove_fillers": {
          deleteAllFillers();
          historyEntry.success = true;
          break;
        }

        default: {
          toast({
            title: "Unbekannter Befehl",
            description: `Aktion "${command.action}" wird noch nicht unterstuetzt.`,
            variant: "destructive",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "KI-Befehl fehlgeschlagen",
        description: err.message || "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setCommandHistory((prev) => [historyEntry, ...prev]);
      setAiCommand("");
      setIsAiProcessing(false);
    }
  };

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processAiCommand(aiCommand);
  };

  // ─── Voice Input ──────────────────────────────────────────────────────

  const startVoiceInput = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Nicht unterstuetzt",
        description: "Spracheingabe wird in diesem Browser nicht unterstuetzt. Nutze Chrome oder Edge.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "de-DE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript("");
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setAiCommand(final);
        setInterimTranscript("");
        // Auto-submit voice commands
        processAiCommand(final);
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setInterimTranscript("");
      if (event.error !== "aborted") {
        toast({
          title: "Spracheingabe-Fehler",
          description: event.error === "not-allowed"
            ? "Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff."
            : "Spracheingabe fehlgeschlagen. Bitte erneut versuchen.",
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [toast]);

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  }, [isListening, startVoiceInput, stopVoiceInput]);

  // Remove an AI effect
  const removeEffect = (effectId: string) => {
    setAiEffects((prev) => prev.filter((e) => e.id !== effectId));
  };

  // ─── Stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const kept = srtSegments.filter((_, i) => !deletedSegments.has(i));
    const removed = srtSegments.filter((_, i) => deletedSegments.has(i));

    const keptDuration = kept.reduce((sum, s) => sum + (s.endSeconds - s.startSeconds), 0);
    const removedDuration = removed.reduce((sum, s) => sum + (s.endSeconds - s.startSeconds), 0);
    const fillerCount = [...fillerSegmentIndices].filter((i) => !deletedSegments.has(i)).length;

    return { keptDuration, removedDuration, keptCount: kept.length, removedCount: removed.length, fillerCount };
  }, [srtSegments, deletedSegments, fillerSegmentIndices]);

  // ─── Export ─────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!videoFile || !sessionId) return;

    // Build segments to keep (inverse of deleted)
    const keepSegments = srtSegments
      .map((seg, i) => ({ seg, i }))
      .filter(({ i }) => !deletedSegments.has(i))
      .map(({ seg }) => ({
        start: seg.startSeconds,
        end: seg.endSeconds,
      }));

    if (keepSegments.length === 0) {
      toast({
        title: "Keine Segmente",
        description: "Es sind keine Segmente zum Exportieren uebrig.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    setExportProgress("Video wird hochgeladen...");

    try {
      // First, upload the file to the session if not already done
      let fileId = sessionFileId;

      if (!fileId) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", videoFile);

        const uploadResponse = await fetch("/api/session/files", {
          method: "POST",
          body: uploadFormData,
          credentials: "include",
          headers: { "X-Session-ID": sessionId },
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload fehlgeschlagen");
        }

        const uploadData = await uploadResponse.json();
        fileId = uploadData.file?.id || uploadData.id;
        setSessionFileId(fileId);
      }

      setExportProgress("Video wird geschnitten...");

      // Use the cut endpoint
      const cutResponse = await fetch("/api/video/cut", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": sessionId,
        },
        credentials: "include",
        body: JSON.stringify({
          fileId,
          segments: keepSegments,
          normalizeAudio: true,
          // Pass VoxCut effects for enhanced processing
          effects: aiEffects.length > 0 ? aiEffects : undefined,
        }),
      });

      if (!cutResponse.ok) {
        const err = await cutResponse.json().catch(() => ({}));
        throw new Error(err.error || "Export fehlgeschlagen");
      }

      const cutData = await cutResponse.json();

      if (cutData.files && cutData.files.length > 0) {
        setExportedFileId(cutData.files[0].id);
        setExportProgress("");

        toast({
          title: "Export abgeschlossen",
          description: `Video geschnitten: ${cutData.files.length} Datei(en) erstellt${aiEffects.length > 0 ? ` · ${aiEffects.length} Effekte` : ""}`,
        });
      } else {
        throw new Error("Keine Ausgabedateien erstellt");
      }
    } catch (err: any) {
      toast({
        title: "Export fehlgeschlagen",
        description: err.message || "Unbekannter Fehler",
        variant: "destructive",
      });
      setExportProgress("");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!exportedFileId || !sessionId) return;
    const url = `/api/session/files/${exportedFileId}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoFile?.name?.replace(/\.[^.]+$/, "") || "voxcut"}_geschnitten.mp4`;

    try {
      const response = await fetch(url, {
        credentials: "include",
        headers: { "X-Session-ID": sessionId },
      });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast({ title: "Download fehlgeschlagen", variant: "destructive" });
    }
  };

  const handleDownloadSrt = () => {
    const keptSegments = srtSegments.filter((_, i) => !deletedSegments.has(i));
    const reindexed: SrtSegment[] = keptSegments.map((seg, i) => ({
      ...seg,
      index: i + 1,
    }));
    const srtContent = segmentsToSrt(reindexed);
    const blob = new Blob([srtContent], { type: "text/srt" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoFile?.name?.replace(/\.[^.]+$/, "") || "voxcut"}_untertitel.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Keyboard Shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step !== "editing") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastEdit();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipSeconds(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipSeconds(5);
      } else if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        aiInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, togglePlay, undoLastEdit, skipSeconds]);

  // ─── Cleanup ────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [videoUrl]);

  // Effect icon helper
  const getEffectIcon = (type: string) => {
    switch (type) {
      case "freeze": return <Snowflake className="w-3.5 h-3.5" />;
      case "speed": return <FastForward className="w-3.5 h-3.5" />;
      case "cut": return <Scissors className="w-3.5 h-3.5" />;
      case "silence": return <Timer className="w-3.5 h-3.5" />;
      case "keep_only": return <Eye className="w-3.5 h-3.5" />;
      default: return <Wand2 className="w-3.5 h-3.5" />;
    }
  };

  const getEffectColor = (type: string) => {
    switch (type) {
      case "freeze": return "bg-cyan-100 text-cyan-700 border-cyan-200";
      case "speed": return "bg-orange-100 text-orange-700 border-orange-200";
      case "cut": return "bg-red-100 text-red-700 border-red-200";
      case "silence": return "bg-violet-100 text-violet-700 border-violet-200";
      case "keep_only": return "bg-green-100 text-green-700 border-green-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <PageLayout>
      <SEO
        title="VoxCut – KI-Video-Editor per Text & Stimme"
        description="Video schneiden per KI: Befehle eingeben oder sprechen. Freeze Frames, Speed, Schnitte – alles per natuerlicher Sprache. Barrierefrei und DSGVO-konform."
        canonical="/tools/voxcut"
      />

      <header className="pt-16 pb-8 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 rounded-full text-sm font-medium mb-6 border border-cyan-200/50">
            <Brain className="w-4 h-4" />
            KI-gesteuerter Video-Editor
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-3">
            VoxCut
          </h1>
          <p className="text-lg text-slate-600 font-light max-w-2xl">
            Sag der KI, was du willst. Per Text oder Stimme. Freeze Frames, Schnitte,
            Geschwindigkeit – alles per natuerlicher Sprache. Wie CapCut, nur smarter.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-6xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* ─── Step: Upload ───────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-8">
            {/* Upload zone */}
            <div
              className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
                isDragOver
                  ? "border-cyan-400 bg-cyan-50/70"
                  : "border-slate-300 bg-white hover:border-cyan-300 hover:bg-cyan-50/30"
              }`}
              onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
              onDrop={handleDrop}
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100">
                {isDragOver ? (
                  <Upload className="h-10 w-10 text-cyan-600 animate-bounce" />
                ) : (
                  <Brain className="h-10 w-10 text-cyan-600" />
                )}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Video oder Audio hochladen
              </h3>
              <p className="text-slate-500 mb-6 max-w-md mx-auto">
                Datei hierher ziehen oder klicken. Die KI transkribiert automatisch –
                dann steuerst du den Schnitt per Text oder Stimme.
              </p>
              <label className="cursor-pointer inline-block">
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
                <Button asChild className="bg-cyan-600 hover:bg-cyan-700 text-white pointer-events-none">
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    Datei auswählen
                  </span>
                </Button>
              </label>

              <div className="mt-4">
                <label className="cursor-pointer inline-block">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileUploadNoAudio}
                    className="sr-only"
                  />
                  <span className="text-sm text-slate-500 hover:text-cyan-600 underline underline-offset-2 transition-colors">
                    Video hat keine Tonspur? Ohne Transkription hochladen
                  </span>
                </label>
              </div>

              {!isAuthenticated && (
                <p className="mt-4 text-sm text-slate-400">
                  Anmeldung erforderlich für die Transkription.
                </p>
              )}
            </div>

            {playableSessionFiles.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                    <Cloud className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div className="w-full">
                    <h3 className="text-lg font-semibold text-slate-900">Session-Dateien</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Dateien aus Videoschnitt, Untertitel oder Voiceover direkt übernehmen.
                    </p>
                    <div className="mt-4 space-y-2">
                      {playableSessionFiles.map((file) => {
                        const isLoading = loadingSessionFileId === file.id;
                        return (
                          <button
                            key={file.id}
                            type="button"
                            disabled={isLoading}
                            onClick={() => void handleSessionFileSelect(file)}
                            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{file.name}</p>
                              <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                            </div>
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-600" />
                            ) : (
                              <Check className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">So funktioniert VoxCut</h2>
              <div className="grid md:grid-cols-4 gap-6">
                {[
                  {
                    icon: Upload,
                    title: "1. Hochladen",
                    desc: "Video oder Audio hochladen. Die KI transkribiert automatisch.",
                  },
                  {
                    icon: Brain,
                    title: "2. KI-Befehle",
                    desc: "Sag oder schreib, was passieren soll: \"Hier 5s einfrieren\" oder \"Ab 0:30 schneiden\".",
                  },
                  {
                    icon: Wand2,
                    title: "3. Effekte",
                    desc: "Freeze Frames, Speed-Ramping, Schnitte – die KI setzt alles um.",
                  },
                  {
                    icon: Download,
                    title: "4. Exportieren",
                    desc: "Geschnittenes Video + Untertitel herunterladen. Automatisch barrierefrei.",
                  },
                ].map((item) => (
                  <div key={item.title} className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100">
                      <item.icon className="h-6 w-6 text-cyan-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* AI features showcase */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20">
                  <Sparkles className="h-5 w-5 text-cyan-400" />
                </div>
                <h2 className="text-xl font-semibold">Was du der KI sagen kannst</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  { cmd: "\"Hier 5 Sekunden einfrieren\"", icon: Snowflake, desc: "Freeze Frame an beliebiger Stelle" },
                  { cmd: "\"Doppelte Geschwindigkeit ab Minute 1\"", icon: FastForward, desc: "Speed-Ramping per Sprachbefehl" },
                  { cmd: "\"Von 0:30 bis 0:45 rausschneiden\"", icon: Scissors, desc: "Praezise Schnitte per Zeitangabe" },
                  { cmd: "\"Alle Füllwörter entfernen\"", icon: Trash2, desc: "Äh, ähm, also – automatisch weg" },
                  { cmd: "\"Nur die ersten 2 Minuten behalten\"", icon: Eye, desc: "Alles andere wird entfernt" },
                  { cmd: "\"Pause bei 1:20 einfuegen\"", icon: Timer, desc: "Stille an beliebiger Stelle" },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <item.icon className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-white/90 text-sm font-mono">{item.cmd}</p>
                      <p className="text-white/50 text-xs mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gebaerdensprache coming soon */}
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 shrink-0">
                  <Hand className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-violet-900">Gebaerdensprache</h3>
                    <span className="px-2 py-0.5 bg-violet-200 text-violet-700 text-xs font-medium rounded-full">
                      Kommt bald
                    </span>
                  </div>
                  <p className="text-sm text-violet-700">
                    Automatische Gebaerdensprach-Einblendung per KI-Avatar. Wir arbeiten daran,
                    dieses Feature barrierefrei und datenschutzkonform umzusetzen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step: Transcribing ─────────────────────────────────── */}
        {step === "transcribing" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100">
              <Loader2 className="h-8 w-8 text-cyan-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">
              Transkription laeuft...
            </h2>
            <p className="text-slate-500 mb-6">
              Die KI analysiert Ihre Aufnahme. Das dauert je nach Laenge 1-5 Minuten.
            </p>

            {transcriptionJob.job && (
              <div className="max-w-md mx-auto space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    {transcriptionJob.job.progress?.stage === "queued"
                      ? "In der Warteschlange..."
                      : transcriptionJob.job.progress?.stage || "Verarbeitung..."}
                  </span>
                  <span className="text-cyan-600 font-medium">
                    {Math.round(transcriptionJob.job.progress?.percent || 0)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${transcriptionJob.job.progress?.percent || 0}%` }}
                  />
                </div>
              </div>
            )}

            {transcriptionPosition != null && transcriptionPosition > 0 && (
              <div className="mt-4">
                <QueuePositionDisplay
                  position={transcriptionPosition}
                  estimatedWait={transcriptionEstimatedWait}
                  isProcessing={transcriptionIsProcessing}
                />
              </div>
            )}

            <button
              onClick={() => {
                setSrtSegments([]);
                setFillerSegmentIndices(new Set());
                setStep("editing");
                setShowVoiceover(true);
                toast({ title: "Transkription uebersprungen", description: "Du kannst jetzt manuell bearbeiten oder eine KI-Stimme hinzufuegen." });
              }}
              className="mt-4 text-sm text-slate-400 hover:text-cyan-600 underline underline-offset-2 transition-colors"
            >
              Transkription ueberspringen
            </button>

            {videoUrl && (
              <div className="mt-8 max-w-lg mx-auto">
                <video
                  src={videoUrl}
                  className="w-full rounded-xl border border-slate-200"
                  muted
                  playsInline
                />
              </div>
            )}
          </div>
        )}

        {/* ─── Step: Editing ──────────────────────────────────────── */}
        {step === "editing" && (
          <div className="space-y-4">
            {/* ═══ AI COMMAND BAR ═══ The star feature ═══ */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg border border-slate-700">
              <form onSubmit={handleAiSubmit} className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-cyan-400 shrink-0">
                  <Brain className="w-5 h-5" />
                  <span className="text-sm font-semibold hidden sm:inline">KI-Regie</span>
                </div>

                <div className="flex-1 relative">
                  <input
                    ref={aiInputRef}
                    type="text"
                    value={isListening ? interimTranscript || aiCommand : aiCommand}
                    onChange={(e) => setAiCommand(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={isListening ? "Ich hoere zu..." : "Sag der KI was du willst... z.B. \"Hier 3s einfrieren\""}
                    className={`w-full bg-white/10 text-white placeholder:text-white/40 border-0 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all ${
                      isListening ? "ring-2 ring-red-500/50 bg-red-500/10" : ""
                    }`}
                    disabled={isAiProcessing}
                  />

                  {/* Suggestions dropdown */}
                  {showSuggestions && !aiCommand && !isListening && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Beispiel-Befehle
                      </div>
                      {AI_SUGGESTIONS.slice(0, 6).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setAiCommand(suggestion);
                            setShowSuggestions(false);
                            processAiCommand(suggestion);
                          }}
                        >
                          <Lightbulb className="w-3 h-3 text-cyan-500/60 shrink-0" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Voice input button */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={isAiProcessing}
                  className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                    isListening
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                  }`}
                  title={isListening ? "Spracheingabe stoppen" : "Spracheingabe starten"}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={isAiProcessing || (!aiCommand.trim() && !isListening)}
                  className="shrink-0 bg-cyan-500 hover:bg-cyan-400 text-white gap-1.5 rounded-xl"
                  size="sm"
                >
                  {isAiProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{isAiProcessing ? "Denkt..." : "Ausfuehren"}</span>
                </Button>
              </form>

              {/* Keyboard shortcut hint */}
              <div className="mt-2 flex items-center gap-4 text-[10px] text-white/30">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white/10 rounded text-[9px]">Strg+K</kbd> Befehlseingabe fokussieren
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white/10 rounded text-[9px]">Enter</kbd> Ausfuehren
                </span>
                <span className="flex items-center gap-1">
                  <Mic className="w-2.5 h-2.5" /> oder per Stimme sprechen
                </span>
              </div>
            </div>

            {/* AI Effects chips */}
            {aiEffects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Effekte:</span>
                {aiEffects.map((effect) => (
                  <div
                    key={effect.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getEffectColor(effect.type)}`}
                  >
                    {getEffectIcon(effect.type)}
                    {effect.label}
                    <button
                      onClick={() => removeEffect(effect.id)}
                      className="ml-0.5 hover:opacity-70 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={deleteAllFillers}
                disabled={stats.fillerCount === 0}
                className="gap-1.5 text-cyan-700 border-cyan-200 hover:bg-cyan-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Füllwörter entfernen ({stats.fillerCount})
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={undoLastEdit}
                disabled={undoStack.length === 0}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Rückgängig
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={resetAllEdits}
                disabled={deletedSegments.size === 0 && aiEffects.length === 0}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Alle zurücksetzen
              </Button>

              <div className="flex-1" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className={`gap-1.5 ${showHistory ? "bg-slate-100" : ""}`}
              >
                <History className="w-3.5 h-3.5" />
                Verlauf ({commandHistory.length})
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFillers(!showFillers)}
                className="gap-1.5"
              >
                {showFillers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                Füllwörter {showFillers ? "ausblenden" : "anzeigen"}
              </Button>
            </div>

            {/* Command History (collapsible) */}
            {showHistory && commandHistory.length > 0 && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3 h-3" />
                  KI-Befehlsverlauf
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {commandHistory.slice(0, 20).map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                        entry.success ? "bg-white" : "bg-red-50"
                      }`}
                    >
                      {entry.success ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      )}
                      <span className="text-slate-600 font-mono truncate flex-1">"{entry.input}"</span>
                      {entry.action && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium">
                          {entry.action}
                        </span>
                      )}
                      <span className="text-slate-400 shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="w-4 h-4" />
                <span>Original: <strong>{formatTimeFull(videoDuration)}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>Behalten: <strong>{formatTimeFull(stats.keptDuration)}</strong> ({stats.keptCount} Segmente)</span>
              </div>
              {stats.removedCount > 0 && (
                <div className="flex items-center gap-2 text-red-600">
                  <Trash2 className="w-4 h-4" />
                  <span>Entfernt: <strong>{formatTimeFull(stats.removedDuration)}</strong> ({stats.removedCount})</span>
                </div>
              )}
              {aiEffects.length > 0 && (
                <div className="flex items-center gap-2 text-cyan-600">
                  <Wand2 className="w-4 h-4" />
                  <span><strong>{aiEffects.length}</strong> KI-Effekte</span>
                </div>
              )}
            </div>

            {/* Main editor area */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Video preview */}
              <div className="lg:col-span-2 space-y-3">
                <div className="bg-black rounded-xl overflow-hidden sticky top-4">
                  {videoUrl && (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full aspect-video"
                      playsInline
                      muted={isMuted}
                    />
                  )}

                  {/* Video controls */}
                  <div className="bg-slate-900 px-4 py-2.5 flex items-center gap-3">
                    <button
                      onClick={() => skipSeconds(-5)}
                      className="text-white/70 hover:text-white transition-colors"
                      title="5s zurück"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      onClick={togglePlay}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-cyan-500 hover:bg-cyan-400 text-white transition-colors"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>

                    <button
                      onClick={() => skipSeconds(5)}
                      className="text-white/70 hover:text-white transition-colors"
                      title="5s vor"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>

                    <span className="text-white/80 text-xs font-mono ml-1">
                      {formatTime(currentTime)} / {formatTime(videoDuration)}
                    </span>

                    <div className="flex-1" />

                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="text-white/70 hover:text-white transition-colors"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Effects timeline visualization */}
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1.5 font-medium">Schnitt & Effekte</div>

                  {/* Segment timeline */}
                  <div className="h-6 bg-slate-100 rounded-lg overflow-hidden relative flex mb-1">
                    {srtSegments.map((seg, i) => {
                      const left = videoDuration > 0 ? (seg.startSeconds / videoDuration) * 100 : 0;
                      const width = videoDuration > 0 ? ((seg.endSeconds - seg.startSeconds) / videoDuration) * 100 : 0;
                      const isDeleted = deletedSegments.has(i);
                      const isFillerSeg = fillerSegmentIndices.has(i) && !isDeleted;
                      const isActive = activeSegmentIndex === i;

                      return (
                        <div
                          key={i}
                          className={`absolute top-0 h-full transition-colors cursor-pointer ${
                            isDeleted
                              ? "bg-red-200/60"
                              : isFillerSeg
                                ? "bg-amber-300/60"
                                : isActive
                                  ? "bg-cyan-500"
                                  : "bg-cyan-400/70"
                          }`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
                          onClick={() => seekTo(seg.startSeconds)}
                          title={`${formatTime(seg.startSeconds)} - ${seg.text.slice(0, 40)}`}
                        />
                      );
                    })}
                    {/* Playhead */}
                    {videoDuration > 0 && (
                      <div
                        className="absolute top-0 h-full w-0.5 bg-slate-900 z-10 pointer-events-none"
                        style={{ left: `${(currentTime / videoDuration) * 100}%` }}
                      />
                    )}
                  </div>

                  {/* AI Effects overlay timeline */}
                  {aiEffects.length > 0 && (
                    <div className="h-4 bg-slate-50 rounded-lg overflow-hidden relative mb-1">
                      {aiEffects.map((effect) => {
                        if (effect.type === "freeze" || effect.type === "silence") {
                          const left = videoDuration > 0 ? (effect.startSeconds / videoDuration) * 100 : 0;
                          return (
                            <div
                              key={effect.id}
                              className={`absolute top-0.5 h-3 rounded-sm cursor-pointer ${
                                effect.type === "freeze" ? "bg-cyan-400/80" : "bg-violet-400/80"
                              }`}
                              style={{ left: `${left}%`, width: "4px", minWidth: "4px" }}
                              title={effect.label}
                              onClick={() => seekTo(effect.startSeconds)}
                            >
                              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2">
                                {effect.type === "freeze" ? (
                                  <Snowflake className="w-2.5 h-2.5 text-cyan-600" />
                                ) : (
                                  <Timer className="w-2.5 h-2.5 text-violet-600" />
                                )}
                              </div>
                            </div>
                          );
                        }
                        if (effect.type === "speed" && effect.endSeconds) {
                          const left = videoDuration > 0 ? (effect.startSeconds / videoDuration) * 100 : 0;
                          const width = videoDuration > 0 ? ((effect.endSeconds - effect.startSeconds) / videoDuration) * 100 : 0;
                          return (
                            <div
                              key={effect.id}
                              className="absolute top-0.5 h-3 bg-orange-400/60 rounded-sm cursor-pointer"
                              style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                              title={effect.label}
                              onClick={() => seekTo(effect.startSeconds)}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}

                  <div className="flex justify-between mt-0.5 text-[10px] text-slate-400">
                    <span>0:00</span>
                    <span>{formatTime(videoDuration)}</span>
                  </div>
                </div>

                {/* Keyboard shortcuts */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
                  <div className="font-medium text-slate-700 mb-1">Tastaturkuerzel</div>
                  <div className="grid grid-cols-2 gap-1">
                    <span><kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Leertaste</kbd> Play/Pause</span>
                    <span><kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">←</kbd><kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">→</kbd> 5s springen</span>
                    <span><kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Strg+Z</kbd> Rückgängig</span>
                    <span><kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Strg+K</kbd> KI-Befehl</span>
                  </div>
                </div>
              </div>

              {/* Transcript editor */}
              <div className="lg:col-span-3">
                <div
                  ref={editorScrollRef}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Transkript bearbeiten
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Klicke auf ein Segment um zur Stelle zu springen. Nutze
                      <Scissors className="w-3 h-3 inline mx-1" />
                      zum Entfernen oder die <strong className="text-cyan-600">KI-Regie</strong> oben.
                    </p>
                  </div>

                  <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
                    {srtSegments.map((seg, i) => {
                      const isDeleted = deletedSegments.has(i);
                      const isFillerSeg = fillerSegmentIndices.has(i);
                      const isActive = activeSegmentIndex === i;

                      // Check if this segment has an AI effect
                      const segEffects = aiEffects.filter(
                        (e) => e.startSeconds >= seg.startSeconds && e.startSeconds <= seg.endSeconds
                      );

                      // Hide fillers if toggled off and not deleted
                      if (!showFillers && isFillerSeg && !isDeleted) return null;

                      return (
                        <div
                          key={i}
                          ref={(el) => {
                            if (el) segmentRefs.current.set(i, el);
                            else segmentRefs.current.delete(i);
                          }}
                          className={`group flex items-start gap-3 px-4 py-2.5 transition-all cursor-pointer ${
                            isDeleted
                              ? "bg-red-50/60 opacity-60"
                              : isActive
                                ? "bg-cyan-50 border-l-2 border-l-cyan-500"
                                : isFillerSeg
                                  ? "bg-amber-50/40"
                                  : "hover:bg-slate-50"
                          }`}
                          onClick={() => seekTo(seg.startSeconds)}
                        >
                          {/* Timestamp */}
                          <div className="shrink-0 w-14 text-[11px] text-slate-400 font-mono pt-0.5">
                            {formatTime(seg.startSeconds)}
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm leading-relaxed ${
                                isDeleted
                                  ? "line-through text-red-400"
                                  : isFillerSeg
                                    ? "text-amber-700 italic"
                                    : "text-slate-800"
                              }`}
                            >
                              {seg.text}
                            </p>
                            {/* Effect badges on segments */}
                            {segEffects.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {segEffects.map((eff) => (
                                  <span
                                    key={eff.id}
                                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${getEffectColor(eff.type)}`}
                                  >
                                    {getEffectIcon(eff.type)}
                                    {eff.type === "freeze" ? `${eff.durationSeconds}s Freeze` : eff.type === "speed" ? `${eff.factor}x` : eff.type}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Filler badge */}
                          {isFillerSeg && !isDeleted && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-amber-200 text-amber-700 rounded font-medium">
                              Fuellwort
                            </span>
                          )}

                          {/* Delete/restore button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSegmentDeleted(i);
                            }}
                            className={`shrink-0 p-1.5 rounded-lg transition-all ${
                              isDeleted
                                ? "text-green-600 hover:bg-green-100"
                                : "text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                            }`}
                            title={isDeleted ? "Wiederherstellen" : "Entfernen"}
                          >
                            {isDeleted ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : (
                              <Scissors className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Accessibility section */}
            <div className="bg-white rounded-xl border border-slate-200">
              <button
                onClick={() => setShowAccessibility(!showAccessibility)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <Accessibility className="w-5 h-5 text-violet-600" />
                  <span className="font-semibold text-slate-900">Barrierefreiheit</span>
                </div>
                {showAccessibility ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {showAccessibility && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">Untertitel (SRT) exportieren</div>
                        <div className="text-xs text-slate-500">Bereinigte Untertitel zum Video herunterladen</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSubtitles}
                      onChange={(e) => setIncludeSubtitles(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Languages className="w-4 h-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">Leichte Sprache</div>
                        <div className="text-xs text-slate-500">Vereinfachte Untertitel generieren (mit KI)</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSimpleLanguage}
                      onChange={(e) => setIncludeSimpleLanguage(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      disabled
                    />
                  </label>

                  <div className="flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                      <Hand className="w-4 h-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                          Gebaerdensprache
                          <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[10px] font-medium rounded-full">
                            Kommt bald
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">Automatischer Gebaerdensprach-Avatar einblenden</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled
                      className="w-4 h-4 rounded border-slate-300"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Voice-Over (TTS) panel */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowVoiceover(!showVoiceover)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium text-slate-900">KI Voice-Over</span>
                  <span className="text-xs text-slate-500">KI-Stimme unter das Video legen</span>
                </div>
                {showVoiceover ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showVoiceover && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <textarea
                        value={voiceoverText}
                        onChange={(e) => setVoiceoverText(e.target.value)}
                        className="w-full min-h-[120px] rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                        placeholder="Text fuer die KI Sprache hier einfuegen..."
                      />

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <div className="text-xs text-slate-600">Stimme:</div>
                        <Select value={voiceoverVoice} onValueChange={(v) => setVoiceoverVoice(v as any)}>
                          <SelectTrigger className="w-[150px] bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="female">Weiblich</SelectItem>
                            <SelectItem value="male">Maennlich</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <details className="mt-2">
                        <summary className="text-xs text-slate-600 cursor-pointer select-none">Erweitert</summary>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <div className="text-xs text-slate-600">Engine:</div>
                          <Select value={voiceoverTtsEngine} onValueChange={(v) => setVoiceoverTtsEngine(v as any)}>
                            <SelectTrigger className="w-[190px] bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="qwen3tts">Qwen3-TTS (best)</SelectItem>
                              <SelectItem value="xtts">XTTS (fallback)</SelectItem>
                              <SelectItem value="piper">Piper (fast)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </details>

                      <div className="mt-3">
                        <Button
                          onClick={startVoiceoverGeneration}
                          disabled={isGeneratingVoiceover || !voiceoverText.trim()}
                          className="bg-orange-500 hover:bg-orange-600"
                        >
                          {isGeneratingVoiceover ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Cloud className="w-4 h-4 mr-2" />
                          )}
                          KI Sprache erzeugen
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-slate-900 mb-2">Status</div>
                      <div className="rounded-lg border border-orange-200 bg-orange-50/30 p-3">
                        {isGeneratingVoiceover ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-700">
                              <span>{voiceoverStatus || "In Arbeit..."}</span>
                              <span className="font-medium tabular-nums">{voiceoverProgress}%</span>
                            </div>
                            <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-500 transition-all" style={{ width: `${voiceoverProgress}%` }} />
                            </div>
                          </div>
                        ) : voiceoverResultFileId ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-green-700">
                              <Check className="w-4 h-4 flex-shrink-0" />
                              <span className="text-sm font-medium">Fertig — Audio erzeugt</span>
                            </div>
                            {voiceoverAudioUrl && (
                              <audio controls className="w-full" src={voiceoverAudioUrl} />
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              {voiceoverResultFileId && sessionId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={async () => {
                                    const url = `/api/session/files/${voiceoverResultFileId}`;
                                    try {
                                      const r = await fetch(url, { credentials: "include", headers: { "X-Session-ID": sessionId } });
                                      const blob = await r.blob();
                                      const blobUrl = URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = blobUrl;
                                      a.download = `voiceover-${voiceoverVoice}-${Date.now()}.mp3`;
                                      a.click();
                                      URL.revokeObjectURL(blobUrl);
                                    } catch {
                                      toast({ title: "Download fehlgeschlagen", variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Audio herunterladen
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-600"
                                onClick={() => {
                                  voiceoverImportedJobRef.current = null;
                                  setVoiceoverResultFileId(null);
                                  setVoiceoverAudioUrl(null);
                                  setVoiceoverProgress(0);
                                  setVoiceoverStatus("");
                                }}
                              >
                                Neu generieren
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600">
                            Text eingeben und "KI Sprache erzeugen" starten.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Export buttons */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
              <Button
                onClick={handleExport}
                disabled={isExporting || (deletedSegments.size === 0 && aiEffects.length === 0)}
                className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Scissors className="w-4 h-4" />
                )}
                {isExporting ? exportProgress || "Wird exportiert..." : "Video exportieren"}
              </Button>

              {includeSubtitles && (
                <Button
                  variant="outline"
                  onClick={handleDownloadSrt}
                  className="gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Untertitel (SRT)
                </Button>
              )}

              {exportedFileId && (
                <Button
                  onClick={handleDownload}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  <Download className="w-4 h-4" />
                  Video herunterladen
                </Button>
              )}

              <div className="flex-1" />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("upload");
                  setVideoFile(null);
                  setVideoUrl(null);
                  setSrtSegments([]);
                  setDeletedSegments(new Set());
                  setFillerSegmentIndices(new Set());
                  setUndoStack([]);
                  setExportedFileId(null);
                  setSessionFileId(null);
                  setAiEffects([]);
                  setCommandHistory([]);
                  setShowVoiceover(false);
                  setVoiceoverText("");
                  setVoiceoverAudioUrl(null);
                  setVoiceoverResultFileId(null);
                  voiceoverImportedJobRef.current = null;
                }}
                className="text-slate-500 gap-1.5"
              >
                <X className="w-4 h-4" />
                Neues Video
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step: Exporting ────────────────────────────────────── */}
        {step === "exporting" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Video wird exportiert...</h2>
            <p className="text-slate-500">{exportProgress}</p>
          </div>
        )}
      </main>
    </PageLayout>
  );
}
