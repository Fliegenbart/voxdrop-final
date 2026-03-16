import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Video, Scissors, Play, Pause,
  Loader2, Trash2, Plus, ChevronDown,
  Merge, SkipBack, SkipForward, Volume2,
  Mic, Square, Crown, Cloud, Subtitles,
  Check, X, Bot, PanelRightClose, PanelRightOpen
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { useJob, translateError } from "@/hooks/use-job";
import { useSession, SessionFile, CutSegment, TimelineTrack, RecentSessionSummary } from "@/hooks/use-session";
import { TimelineEditor } from "@/components/TimelineEditor";
import { ScreenRecorder } from "@/components/ScreenRecorder";
import { formatMarkerTime, parseSrt, segmentsToSrt, type SrtSegment } from "@/lib/subtitles/srt";
import { segmentsToTtml, segmentsToVtt } from "@/lib/subtitles/formats";
import {
  applyVocabularyToSrtContent,
  parseVocabularyCsv,
  type VocabularyEntry,
} from "@/lib/subtitles/vocabulary";
import { wrapSubtitleText } from "@/lib/subtitles/wrap";
import { replaceAllWithCount } from "@/lib/text/replace";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVideoKeyboardShortcuts } from "@/hooks/use-video-keyboard-shortcuts";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { useExportProgress } from "@/hooks/use-export-progress";
import { ExportSettings } from "./ExportSettings";
import { ModeSelector } from "./ModeSelector";
import { FileList } from "./FileList";
import { KeyboardShortcutBar } from "./KeyboardShortcutBar";
import { useTimelineThumbnails } from "@/hooks/use-timeline-thumbnails";
import { usePreviewPlayback } from "@/hooks/use-preview-playback";
import { UploadHero } from "./UploadHero";
import { AiChatPanel } from "./AiChatPanel";
import { SessionHistoryPanel } from "./SessionHistoryPanel";

// Clip type for the clip list
interface Clip {
  id: string;
  start: number;
  end: number;
  selected: boolean;
}

interface SavedEditorState {
  version: 1;
  sessionId: string;
  selectedFileId?: string;
  mode?: 'trim' | 'cut' | 'merge' | 'voiceover' | 'subtitles' | 'timeline' | 'record';
  trimStart?: number;
  trimEnd?: number;
  clips?: Clip[];
  mergeSelection?: string[];
  audioTrackId?: string;
  audioTrimStart?: number;
  audioTrimEnd?: number;
  audioVolume?: number;
}

const SUBTITLE_MAX_LINES = 2;
const SUBTITLE_MAX_LINE_LENGTH = 42;
const SUBTITLE_MAX_CHARS = 90;

interface SubtitleReadabilityIssue {
  segmentPosition: number;
  segmentIndex: number;
  charCount: number;
  lineCount: number;
  maxLineLength: number;
  tooManyChars: boolean;
  tooManyLines: boolean;
  lineTooLong: boolean;
  suggestion: string;
  suggestionOverflow: boolean;
}

function getSubtitleReadabilityIssue(segment: SrtSegment, segmentPosition: number): SubtitleReadabilityIssue | null {
  const lines = segment.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lineCount = lines.length;
  const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const charCount = segment.text.replace(/\s+/g, "").length;

  const tooManyChars = charCount > SUBTITLE_MAX_CHARS;
  const tooManyLines = lineCount > SUBTITLE_MAX_LINES;
  const lineTooLong = maxLineLength > SUBTITLE_MAX_LINE_LENGTH;
  if (!tooManyChars && !tooManyLines && !lineTooLong) return null;

  const wrapped = wrapSubtitleText(segment.text, {
    maxLineLength: SUBTITLE_MAX_LINE_LENGTH,
    maxLines: SUBTITLE_MAX_LINES,
  });

  return {
    segmentPosition,
    segmentIndex: segment.index || segmentPosition + 1,
    charCount,
    lineCount,
    maxLineLength,
    tooManyChars,
    tooManyLines,
    lineTooLong,
    suggestion: wrapped.text,
    suggestionOverflow: wrapped.overflow,
  };
}

export default function Videoschnitt() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();

  // Video edit is available starting from Pro.
  const hasVideoEditAccess = user?.subscription === 'pro' || user?.subscription === 'premium' || user?.subscription === 'team';

  const {
    files,
    isLoading,
    uploadFile,
    deleteFile,
    getProxyUrl,
    ensureProxy,
    getProxyStatus,
    refreshSession,
    getRecentSessions,
    switchSession,
    cutVideo,
    mergeVideos,
    trimVideo,
    combineVideoAudio,
    extractFreezeFrame,
    renderTimeline,
    formatFileSize,
    formatDuration,
    sessionId
  } = useSession();

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedFile, setSelectedFile] = useState<SessionFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'processing' | 'ready' | 'failed'>('idle');
  const [forceProxyPreview, setForceProxyPreview] = useState<Record<string, true>>({});
  const [recentSessions, setRecentSessions] = useState<RecentSessionSummary[]>([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const resumeTimeAfterSrcSwitchRef = useRef<number | null>(null);
  const lastRequestedSeekRef = useRef<number | null>(null);

  // Editing state
  const [mode, setModeRaw] = useState<'trim' | 'cut' | 'merge' | 'voiceover' | 'subtitles' | 'timeline' | 'record'>('record');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [chapterMarkers, setChapterMarkers] = useState<Array<{ timeSeconds: number; title: string }>>([]);

  // Warn before switching modes if there are unsaved edits
  const setMode = useCallback((newMode: typeof mode) => {
    if (newMode === mode) return;
    const hasUnsavedEdits =
      (mode === 'cut' && clips.length > 0) ||
      (mode === 'trim' && (trimStart > 0.5 || (duration > 0 && trimEnd < duration - 0.5)));
    if (hasUnsavedEdits) {
      if (!window.confirm('Aktuelle Bearbeitung verwerfen und Modus wechseln?')) return;
    }
    setModeRaw(newMode);
  }, [mode, clips.length, trimStart, trimEnd, duration]);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [srtGuideFile, setSrtGuideFile] = useState<File | null>(null);
  const [smartCutGapSeconds, setSmartCutGapSeconds] = useState(1.2);
  const [smartCutMinClipSeconds, setSmartCutMinClipSeconds] = useState(2.0);
  const srtGuideInputRef = useRef<HTMLInputElement>(null);

  // Voice-over / Audio track state
  const [audioTrack, setAudioTrack] = useState<SessionFile | null>(null);
  const [audioTrimStart, setAudioTrimStart] = useState(0);
  const [audioTrimEnd, setAudioTrimEnd] = useState(0);
  const [audioWaveform, setAudioWaveform] = useState<number[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportProfileEnabled, setExportProfileEnabled] = useState(true);
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false);
  const [exportAspect, setExportAspect] = useState<'original' | '16:9' | '4:3' | '9:16'>('original');
  const [exportNormalizeAudio, setExportNormalizeAudio] = useState(false);
  const [exportCleanAudio, setExportCleanAudio] = useState(false);
  const [exportFastModeEnabled, setExportFastModeEnabled] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [smartCutOpen, setSmartCutOpen] = useState(false);
  const [pendingTimelineInsertAudioFileId, setPendingTimelineInsertAudioFileId] = useState<string | null>(null);

  // AI-Regie state
  const [regieOpen, setRegieOpen] = useState(false);
  const [regiePrompt, setRegiePrompt] = useState("");
  const [regieWorking, setRegieWorking] = useState(false);

  // Smart-Sync ("Autopilot") state
  const [smartSyncOpen, setSmartSyncOpen] = useState(false);

  // AI Chat panel
  const [chatOpen, setChatOpen] = useState(true);

  // Drag & drop upload
  const [isDragOver, setIsDragOver] = useState(false);

  // KI Voice-Over (TTS) state
  const [voiceoverText, setVoiceoverText] = useState("");
  const [voiceoverVoice, setVoiceoverVoice] = useState<"male" | "female">("female");
  const [voiceoverTtsEngine, setVoiceoverTtsEngine] = useState<"qwen3tts" | "xtts" | "piper">("qwen3tts");
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceoverJobId, setVoiceoverJobId] = useState<string | null>(null);
  const [voiceoverProgress, setVoiceoverProgress] = useState(0);
  const [voiceoverStatus, setVoiceoverStatus] = useState("");
  const [voiceoverAudioUrl, setVoiceoverAudioUrl] = useState<string | null>(null);
  const [voiceoverInsertedFile, setVoiceoverInsertedFile] = useState<SessionFile | null>(null);
  const voiceoverPollTimeoutRef = useRef<number | null>(null);
  const voiceoverImportedJobRef = useRef<string | null>(null);
  const voiceoverTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Native subtitles state
  const [subtitleSrt, setSubtitleSrt] = useState("");
  const [subtitleTranscribeMode, setSubtitleTranscribeMode] = useState<"quality" | "fast">("quality");
  const [subtitleEnhanceAudio, setSubtitleEnhanceAudio] = useState<"off" | "standard" | "strong">("standard");
  const [subtitleType, setSubtitleType] = useState<"hardcoded" | "soft">("hardcoded");
  const [subtitleDownloadName, setSubtitleDownloadName] = useState("video_untertitel.mp4");
  const [subtitleFindText, setSubtitleFindText] = useState("");
  const [subtitleReplaceText, setSubtitleReplaceText] = useState("");
  const [subtitleReplaceCaseSensitive, setSubtitleReplaceCaseSensitive] = useState(false);
  const [subtitleVocabulary, setSubtitleVocabulary] = useState<VocabularyEntry[]>([]);
  const [subtitleVocabularyWrong, setSubtitleVocabularyWrong] = useState("");
  const [subtitleVocabularyCorrect, setSubtitleVocabularyCorrect] = useState("");
  const subtitleVocabularyInputRef = useRef<HTMLInputElement>(null);

  const exportConstraints = {
    maxSizeMb: exportProfileEnabled ? 125 : undefined,
    aspect: exportAspect === 'original' ? undefined : (exportAspect as '16:9' | '4:3' | '9:16'),
    normalizeAudio: exportNormalizeAudio ? true : undefined,
    fastMode: exportFastModeEnabled ? 'auto' as const : undefined,
  };

  const subtitleTargetFile =
    (selectedFile && selectedFile.mimeType.startsWith("video/") ? selectedFile : null) ||
    [...files].reverse().find((file) => file.mimeType.startsWith("video/")) ||
    null;

  const subtitleVocabularyPrompt = useMemo(() => {
    if (subtitleVocabulary.length === 0) return "";
    return subtitleVocabulary
      .map((entry) => `${entry.wrong} -> ${entry.correct}`)
      .join("; ")
      .slice(0, 1800);
  }, [subtitleVocabulary]);

  const subtitleReadabilityIssues = useMemo(() => {
    if (!subtitleSrt.trim()) return [];
    const segments = parseSrt(subtitleSrt);
    return segments
      .map((segment, idx) => getSubtitleReadabilityIssue(segment, idx))
      .filter((issue): issue is SubtitleReadabilityIssue => issue !== null);
  }, [subtitleSrt]);

  const subtitleReadabilitySummary = useMemo(() => {
    let tooManyChars = 0;
    let tooManyLines = 0;
    let lineTooLong = 0;
    for (const issue of subtitleReadabilityIssues) {
      if (issue.tooManyChars) tooManyChars++;
      if (issue.tooManyLines) tooManyLines++;
      if (issue.lineTooLong) lineTooLong++;
    }
    return {
      total: subtitleReadabilityIssues.length,
      tooManyChars,
      tooManyLines,
      lineTooLong,
    };
  }, [subtitleReadabilityIssues]);

  useEffect(() => {
    if (mode !== "subtitles") return;
    if (selectedFile?.mimeType.startsWith("video/")) return;
    if (subtitleTargetFile && selectedFile?.id !== subtitleTargetFile.id) {
      setSelectedFile(subtitleTargetFile);
    }
  }, [mode, selectedFile, subtitleTargetFile]);

  // Undo/Redo for editing state
  const {
    state: undoState,
    setState: setUndoState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo({
    trimStart,
    trimEnd,
    clips,
    mergeSelection,
    audioTrimStart,
    audioTrimEnd,
    audioVolume,
  });

  // Sync undo state → local state when undo/redo changes it
  useEffect(() => {
    if (undoState.trimStart !== trimStart) setTrimStart(undoState.trimStart);
    if (undoState.trimEnd !== trimEnd) setTrimEnd(undoState.trimEnd);
    if (JSON.stringify(undoState.clips) !== JSON.stringify(clips)) setClips(undoState.clips);
    if (JSON.stringify(undoState.mergeSelection) !== JSON.stringify(mergeSelection)) setMergeSelection(undoState.mergeSelection);
    if (undoState.audioTrimStart !== audioTrimStart) setAudioTrimStart(undoState.audioTrimStart);
    if (undoState.audioTrimEnd !== audioTrimEnd) setAudioTrimEnd(undoState.audioTrimEnd);
    if (undoState.audioVolume !== audioVolume) setAudioVolume(undoState.audioVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoState]);

  // Record snapshots on meaningful edit actions (wrapped setters)
  const recordEdit = useCallback((patch: Partial<typeof undoState>) => {
    setUndoState(prev => ({ ...prev, ...patch }));
  }, [setUndoState]);

  // Export progress
  const exportProgress = useExportProgress({
    isProcessing,
    estimatedDurationSeconds: trimEnd > trimStart ? trimEnd - trimStart : duration,
  });

  // Preview playback – plays only selected segments before export
  const previewSegments = mode === 'trim'
    ? [{ start: trimStart, end: trimEnd }]
    : mode === 'cut'
    ? clips.filter(c => c.selected).map(c => ({ start: c.start, end: c.end }))
    : [];

  const preview = usePreviewPlayback({
    videoRef,
    segments: previewSegments,
  });

  // Timeline thumbnails
  const timelineThumbnails = useTimelineThumbnails({
    videoUrl: previewUrl || (selectedFile ? `/api/session/files/${selectedFile.id}?session=${sessionId}` : null),
    duration,
    enabled: !!selectedFile && duration > 0 && mode !== 'timeline' && mode !== 'record',
  });

  // Audio recording state
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecordingTime, setAudioRecordingTime] = useState(0);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTimerRef = useRef<number | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const proxyPollRef = useRef<number | null>(null);

  // Timeline ref for click handling
  const timelineRef = useRef<HTMLDivElement>(null);

  // FileList ref for scroll-to-files + highlight after export
  const fileListRef = useRef<HTMLDivElement>(null);
  const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null);

  const scrollToFiles = useCallback(() => {
    fileListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const highlightNewFile = useCallback((fileId: string) => {
    setHighlightedFileId(fileId);
    setTimeout(() => setHighlightedFileId(null), 3000);
    // Slight delay so the file renders before scrolling
    setTimeout(() => scrollToFiles(), 100);
  }, [scrollToFiles]);

  // Allow state restore again when switching sessions
  useEffect(() => {
    hasRestoredRef.current = false;
    isRestoringRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!selectedFile) return;
    if (files.some((file) => file.id === selectedFile.id)) return;
    setSelectedFile(null);
    setPreviewUrl(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [files, selectedFile]);

  useEffect(() => {
    if (!audioTrack) return;
    if (files.some((file) => file.id === audioTrack.id)) return;
    setAudioTrack(null);
    setAudioWaveform([]);
    setAudioDuration(0);
    setAudioTrimStart(0);
    setAudioTrimEnd(0);
  }, [audioTrack, files]);

  const loadRecentSessions = useCallback(async () => {
    setRecentSessionsLoading(true);
    try {
      const data = await getRecentSessions();
      setRecentSessions(data);
    } finally {
      setRecentSessionsLoading(false);
    }
  }, [getRecentSessions]);

  useEffect(() => {
    void loadRecentSessions();
  }, [loadRecentSessions, sessionId, files.length]);

  const isSeekingRef = useRef(false);
  const handledInsertAudioRef = useRef(false);

  // Allow deep-link insertion of an audio track (e.g. from /tools/voiceover).
  useEffect(() => {
    if (handledInsertAudioRef.current) return;
    if (!sessionId) return;
    if (!files || files.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const insertAudioId = params.get("insertAudio");
    if (!insertAudioId) return;

    const match = files.find((f) => f.id === insertAudioId);
    if (!match) return;

    handledInsertAudioRef.current = true;
    setVoiceoverInsertedFile(match);
    setAudioTrack(match);
    toast({
      title: "Voiceover eingefügt",
      description: match.name,
    });

    // Remove the query param to avoid re-inserting on refresh.
    params.delete("insertAudio");
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", newUrl);
  }, [files, sessionId, toast]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file, { forceResumable: true });
    if (result) {
      toast({
        title: "Video hochgeladen",
        description: file.name,
      });
      setSelectedFile(result);
    } else {
      toast({
        title: "Fehler beim Upload",
        description: "Das Video konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    }

    // Reset input
    e.target.value = '';
  };

  const uploadAnyFiles = useCallback(async (fileList: FileList | File[]) => {
    const list = Array.isArray(fileList) ? fileList : Array.from(fileList);
    if (!list.length) return;

    // Prefer: upload one at a time so we don't melt the network and to keep UX predictable.
    for (const file of list) {
      const shouldForceResumable = file.type?.startsWith("video/") || file.type?.startsWith("audio/");
      const result = await uploadFile(file, shouldForceResumable ? { forceResumable: true } : undefined);
      if (result) {
        toast({ title: "Datei hochgeladen", description: file.name });
        // Auto-select the last uploaded video.
        if (result.mimeType?.startsWith("video/")) {
          setSelectedFile(result);
        }
      } else {
        toast({
          title: "Fehler beim Upload",
          description: `Konnte "${file.name}" nicht hochladen.`,
          variant: "destructive",
        });
        break;
      }
    }
  }, [toast, uploadFile]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const dropped = e.dataTransfer?.files;
    if (!dropped || dropped.length === 0) return;
    await uploadAnyFiles(dropped);
  }, [uploadAnyFiles]);

  const handleScreenRecordingComplete = useCallback(async (file: File) => {
    // Upload into the current session so it shows up under "Dateien" and can be edited immediately.
    const result = await uploadFile(file, { forceResumable: true });
    if (result) {
      toast({ title: "Aufnahme gespeichert", description: result.name });
      setSelectedFile(result);
      setMode('trim');
      return;
    }
    toast({
      title: "Upload fehlgeschlagen",
      description: "Die Aufnahme konnte nicht hochgeladen werden.",
      variant: "destructive",
    });
  }, [toast, uploadFile]);

  const handleOpenRecentSession = useCallback(async (targetSessionId: string) => {
    if (!targetSessionId || targetSessionId === sessionId) {
      scrollToFiles();
      return;
    }

    const hasPendingEdits =
      (mode === 'cut' && clips.length > 0) ||
      (mode === 'trim' && (trimStart > 0.5 || (duration > 0 && trimEnd < duration - 0.5))) ||
      (mode === 'merge' && mergeSelection.length > 0) ||
      chapterMarkers.length > 0;

    if (
      hasPendingEdits &&
      !window.confirm('Zur anderen Session wechseln? Deine aktuelle Bearbeitung bleibt lokal gespeichert.')
    ) {
      return;
    }

    setOpeningSessionId(targetSessionId);
    setPreviewUrl(null);
    setSelectedFile(null);
    setAudioTrack(null);

    try {
      const data = await switchSession(targetSessionId) as { sessionId?: string; files?: SessionFile[] } | null;
      if (!data?.sessionId) {
        throw new Error('Session konnte nicht geladen werden');
      }

      const nextFiles = Array.isArray(data.files) ? data.files : [];
      const nextVideo = nextFiles.find((file) => file.mimeType.startsWith('video/')) || nextFiles[0] || null;

      if (nextVideo) {
        setSelectedFile(nextVideo);
        setModeRaw(nextVideo.mimeType.startsWith('video/') ? 'trim' : 'voiceover');
      } else {
        setModeRaw('record');
      }

      toast({
        title: "Session geladen",
        description: `Session ${data.sessionId.slice(0, 8)} ist jetzt aktiv.`,
      });
      scrollToFiles();
    } catch (err) {
      toast({
        title: "Session konnte nicht geladen werden",
        description: err instanceof Error ? err.message : "Bitte erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setOpeningSessionId(null);
    }
  }, [
    chapterMarkers.length,
    clips.length,
    duration,
    mergeSelection.length,
    mode,
    scrollToFiles,
    sessionId,
    switchSession,
    toast,
    trimEnd,
    trimStart,
  ]);

  const handleChapterMark = useCallback((seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    setChapterMarkers((prev) => {
      const nextIndex = prev.length + 1;
      return [...prev, { timeSeconds: safeSeconds, title: `Kapitel ${nextIndex}` }];
    });
  }, []);

  const updateChapterMarkerTitle = useCallback((index: number, title: string) => {
    setChapterMarkers((prev) =>
      prev.map((marker, i) => (i === index ? { ...marker, title } : marker))
    );
  }, []);

  const removeChapterMarker = useCallback((index: number) => {
    setChapterMarkers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearChapterMarkers = useCallback(() => {
    setChapterMarkers([]);
  }, []);

  useEffect(() => {
    return () => {
      if (voiceoverPollTimeoutRef.current) {
        clearTimeout(voiceoverPollTimeoutRef.current);
        voiceoverPollTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== 'voiceover') return;
    const t = window.setTimeout(() => {
      voiceoverTextareaRef.current?.focus();
      voiceoverTextareaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [mode]);

  const importVoiceoverJobToSession = useCallback(async (jobId: string) => {
    // Polling may return "completed" multiple times; guard against duplicate imports.
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

    setVoiceoverInsertedFile(uploaded);
    setAudioTrack(uploaded);
    setPendingTimelineInsertAudioFileId(uploaded.id);
    return uploaded;
  }, [uploadFile, voiceoverVoice]);

  const startVoiceoverGeneration = useCallback(async () => {
    if (!voiceoverText.trim()) {
      toast({ title: "Kein Text", description: "Bitte gib einen Text für das Voice-Over ein.", variant: "destructive" });
      return;
    }

    setIsGeneratingVoiceover(true);
    setVoiceoverProgress(0);
    setVoiceoverStatus("Voice-Over wird generiert...");
    setVoiceoverAudioUrl(null);
    setVoiceoverJobId(null);
    setVoiceoverInsertedFile(null);
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
      if (!res.ok) {
        throw new Error(data?.error || "Voice-Over Generierung fehlgeschlagen");
      }

      const jobId = data.jobId as string;
      setVoiceoverJobId(jobId);

      const poll = async () => {
        const statusRes = await fetch(`/api/voiceover/status/${jobId}`, { credentials: "include" });
        const status = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          throw new Error(status?.error || "Status-Abfrage fehlgeschlagen");
        }

        setVoiceoverProgress(status.progress || 0);
        setVoiceoverStatus(status.currentStage || "");

        if (status.status === "completed") {
          setVoiceoverAudioUrl(`/api/voiceover/download/${jobId}`);
          try {
            await importVoiceoverJobToSession(jobId);
            toast({
              title: "KI Sprache hinzugefügt",
              description: "Audio wurde erzeugt und direkt als Spur unter das Video gelegt.",
            });
          } finally {
            setIsGeneratingVoiceover(false);
          }
          return;
        }
        if (status.status === "failed") {
          throw new Error(status.error || "Voice-Over fehlgeschlagen");
        }
        voiceoverPollTimeoutRef.current = window.setTimeout(poll, 1000);
      };

      voiceoverPollTimeoutRef.current = window.setTimeout(poll, 500);
    } catch (err: any) {
      setIsGeneratingVoiceover(false);
      toast({
        title: "Voice-Over fehlgeschlagen",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  }, [toast, voiceoverText, voiceoverVoice, voiceoverTtsEngine, importVoiceoverJobToSession]);

  const useGeneratedVoiceoverAsTrack = useCallback(async () => {
    if (!voiceoverAudioUrl) return;
    try {
      const res = await fetch(voiceoverAudioUrl, { credentials: "include" });
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
      setAudioTrack(uploaded);
      setVoiceoverInsertedFile(uploaded);
      setPendingTimelineInsertAudioFileId(uploaded.id);
      toast({ title: "Voice-Over uebernommen", description: "Audio-Spur ist jetzt im Projekt." });
    } catch (err: any) {
      toast({ title: "Konnte Voice-Over nicht übernehmen", description: err?.message || String(err), variant: "destructive" });
    }
  }, [toast, uploadFile, voiceoverAudioUrl, voiceoverVoice]);

  const subtitleTranscriptionJob = useJob({
    onComplete: async (job) => {
      try {
        const response = await fetch(`/api/jobs/${job.id}/transcription`, {
          credentials: "include",
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || "Untertitel konnten nicht geladen werden");
        }
        const data = await response.json();
        const rawSrt = data.srt || "";
        const correctedSrt = subtitleVocabulary.length > 0
          ? applyVocabularyToSrtContent(rawSrt, subtitleVocabulary)
          : rawSrt;
        setSubtitleSrt(correctedSrt);
        await refreshUser();
        toast({
          title: "Untertitel erstellt",
          description: subtitleVocabulary.length > 0
            ? `Dauer: ${Math.round(data.duration || 0)} Sekunden · ${subtitleVocabulary.length} Vokabularregeln angewendet`
            : `Dauer: ${Math.round(data.duration || 0)} Sekunden`,
        });
      } catch (err: any) {
        toast({
          title: "Fehler",
          description: err?.message || "Untertitel konnten nicht geladen werden",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Transkription fehlgeschlagen",
        description: translateError(error),
        variant: "destructive",
      });
    },
  });

  const {
    job: subtitleEmbedJob,
    submitJob: submitSubtitleEmbedJob,
    downloadResult: downloadSubtitleEmbedResult,
  } = useJob({
    onComplete: async () => {
      const blob = await downloadSubtitleEmbedResult(subtitleDownloadName);
      if (blob) {
        toast({
          title: "Fertig",
          description: "Video mit Untertiteln heruntergeladen",
        });
      } else {
        toast({
          title: "Fertig",
          description: "Auto-Download blockiert. Bitte den Browser-Download erlauben.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Einbettung fehlgeschlagen",
        description: translateError(error),
        variant: "destructive",
      });
    },
  });

  const handleCreateSubtitles = useCallback(async () => {
    if (!subtitleTargetFile || !sessionId) {
      toast({
        title: "Video auswählen",
        description: "Bitte zuerst ein Video auswählen.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("sessionId", sessionId);
    formData.append("fileId", subtitleTargetFile.id);
    formData.append("mode", subtitleTranscribeMode);
    formData.append("enhanceAudio", subtitleEnhanceAudio);
    if (subtitleVocabularyPrompt) {
      formData.append("vocabularyPrompt", subtitleVocabularyPrompt);
    }

    const jobId = await subtitleTranscriptionJob.submitJob("/api/jobs/transcribe-session", formData);
    if (!jobId) {
      toast({
        title: "Transkription konnte nicht gestartet werden",
        description: "Bitte erneut versuchen.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Transkription gestartet",
      description: "Die Untertitel werden erstellt...",
    });
  }, [
    sessionId,
    subtitleEnhanceAudio,
    subtitleTargetFile,
    subtitleTranscribeMode,
    subtitleTranscriptionJob,
    subtitleVocabularyPrompt,
    toast,
  ]);

  const handleDownloadSubtitles = useCallback((format: "srt" | "vtt" | "ttml") => {
    if (!subtitleSrt.trim()) return;
    const base = (subtitleTargetFile?.name || "video").replace(/\.[^/.]+$/, "");

    let content = subtitleSrt;
    let mimeType = "text/plain;charset=utf-8";
    let extension = "srt";

    if (format === "vtt" || format === "ttml") {
      const segments = parseSrt(subtitleSrt);
      if (!segments.length) {
        toast({
          title: "Ungültiges SRT",
          description: "Bitte prüfe die Untertitel, bevor du als VTT oder TTML exportierst.",
          variant: "destructive",
        });
        return;
      }
      if (format === "vtt") {
        content = segmentsToVtt(segments);
        mimeType = "text/vtt;charset=utf-8";
        extension = "vtt";
      } else {
        content = segmentsToTtml(segments);
        mimeType = "application/ttml+xml;charset=utf-8";
        extension = "ttml";
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}_untertitel.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [subtitleSrt, subtitleTargetFile, toast]);

  const handleSubtitleFindReplace = useCallback(() => {
    const find = subtitleFindText.trim();
    if (!find) {
      toast({
        title: "Suchbegriff fehlt",
        description: "Bitte gib einen Begriff für Suchen/Ersetzen ein.",
        variant: "destructive",
      });
      return;
    }
    const { output, count } = replaceAllWithCount({
      input: subtitleSrt,
      find,
      replace: subtitleReplaceText,
      caseSensitive: subtitleReplaceCaseSensitive,
    });
    setSubtitleSrt(output);
    toast({
      title: "Suchen/Ersetzen",
      description: count > 0 ? `${count} Treffer ersetzt.` : "Keine Treffer gefunden.",
    });
  }, [subtitleFindText, subtitleReplaceCaseSensitive, subtitleReplaceText, subtitleSrt, toast]);

  const addSubtitleVocabularyEntry = useCallback(() => {
    const wrong = subtitleVocabularyWrong.trim();
    const correct = subtitleVocabularyCorrect.trim();
    if (!wrong || !correct) {
      toast({
        title: "Eintrag unvollständig",
        description: "Bitte beide Felder für das Vokabular ausfüllen.",
        variant: "destructive",
      });
      return;
    }
    setSubtitleVocabulary((prev) => {
      const deduped = prev.filter((entry) => entry.wrong.toLowerCase() !== wrong.toLowerCase());
      return [...deduped, { wrong, correct }];
    });
    setSubtitleVocabularyWrong("");
    setSubtitleVocabularyCorrect("");
  }, [subtitleVocabularyCorrect, subtitleVocabularyWrong, toast]);

  const handleSubtitleVocabularyUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const entries = parseVocabularyCsv(data);
      if (!entries.length) {
        toast({
          title: "Keine Einträge erkannt",
          description: "CSV muss Spalten für falsch/richtig enthalten.",
          variant: "destructive",
        });
      } else {
        setSubtitleVocabulary((prev) => {
          const map = new Map<string, VocabularyEntry>();
          for (const entry of prev) map.set(entry.wrong.toLowerCase(), entry);
          for (const entry of entries) map.set(entry.wrong.toLowerCase(), entry);
          return Array.from(map.values());
        });
        toast({
          title: "Vokabular importiert",
          description: `${entries.length} Regeln geladen.`,
        });
      }
    } catch {
      toast({
        title: "CSV ungültig",
        description: "Die Vokabular-Datei konnte nicht gelesen werden.",
        variant: "destructive",
      });
    } finally {
      e.target.value = "";
    }
  }, [toast]);

  const applySubtitleVocabulary = useCallback(() => {
    if (!subtitleSrt.trim() || subtitleVocabulary.length === 0) return;
    const corrected = applyVocabularyToSrtContent(subtitleSrt, subtitleVocabulary);
    setSubtitleSrt(corrected);
    toast({
      title: "Vokabular angewendet",
      description: `${subtitleVocabulary.length} Regeln auf Untertitel angewendet.`,
    });
  }, [subtitleSrt, subtitleVocabulary, toast]);

  const applySubtitleReadabilitySuggestion = useCallback((segmentPosition: number) => {
    const segments = parseSrt(subtitleSrt);
    if (!segments.length || !segments[segmentPosition]) return;

    const target = segments[segmentPosition];
    const wrapped = wrapSubtitleText(target.text, {
      maxLineLength: SUBTITLE_MAX_LINE_LENGTH,
      maxLines: SUBTITLE_MAX_LINES,
    });
    if (!wrapped.changed) return;

    const next = [...segments];
    next[segmentPosition] = { ...target, text: wrapped.text };
    setSubtitleSrt(segmentsToSrt(next));
    toast({
      title: "Segment korrigiert",
      description: `Segment ${target.index || segmentPosition + 1} wurde automatisch umbrochen.`,
    });
  }, [subtitleSrt, toast]);

  const applyAllSubtitleReadabilitySuggestions = useCallback(() => {
    if (!subtitleSrt.trim()) return;
    const segments = parseSrt(subtitleSrt);
    if (!segments.length) {
      toast({
        title: "Ungültiges SRT",
        description: "Bitte prüfe das SRT-Format vor der automatischen Korrektur.",
        variant: "destructive",
      });
      return;
    }

    let changed = 0;
    let overflow = 0;
    const next = segments.map((segment, idx) => {
      if (!getSubtitleReadabilityIssue(segment, idx)) return segment;
      const wrapped = wrapSubtitleText(segment.text, {
        maxLineLength: SUBTITLE_MAX_LINE_LENGTH,
        maxLines: SUBTITLE_MAX_LINES,
      });
      if (wrapped.changed) changed++;
      if (wrapped.overflow) overflow++;
      return wrapped.changed ? { ...segment, text: wrapped.text } : segment;
    });

    if (changed === 0) {
      toast({
        title: "Keine Korrektur nötig",
        description: "Alle Segmente liegen bereits in einem gut lesbaren Format.",
      });
      return;
    }

    setSubtitleSrt(segmentsToSrt(next));
    toast({
      title: "Untertitel formatiert",
      description: overflow > 0
        ? `${changed} Segmente angepasst · ${overflow} Segmente bitte manuell prüfen`
        : `${changed} Segmente automatisch angepasst.`,
    });
  }, [subtitleSrt, toast]);

  const handleUseSrtAsSmartCutGuide = useCallback(() => {
    if (!subtitleSrt.trim()) return;
    const base = (subtitleTargetFile?.name || "video").replace(/\.[^/.]+$/, "");
    const file = new File([subtitleSrt], `${base}_untertitel.srt`, { type: "text/plain" });
    setSrtGuideFile(file);
    setSmartCutOpen(true);
    setMode("cut");
    toast({
      title: "SRT übernommen",
      description: "Die Untertitel wurden als Smart-Cut Guide geladen.",
    });
  }, [subtitleSrt, subtitleTargetFile, setMode, toast]);

  const handleEmbedSubtitlesNative = useCallback(async () => {
    if (!subtitleTargetFile || !sessionId || !subtitleSrt.trim()) {
      toast({
        title: "Untertitel fehlen",
        description: "Bitte zuerst Untertitel erstellen oder einfügen.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("sessionId", sessionId);
    formData.append("videoFileId", subtitleTargetFile.id);
    formData.append("type", subtitleType);
    formData.append("enhanceAudio", subtitleEnhanceAudio !== "off" ? "true" : "false");
    formData.append("enhanceAudioLevel", subtitleEnhanceAudio);

    const base = subtitleTargetFile.name.replace(/\.[^/.]+$/, "");
    const normalizedSrt = subtitleSrt.endsWith("\n") ? subtitleSrt : `${subtitleSrt}\n`;
    formData.append("srt", new Blob([normalizedSrt], { type: "application/x-subrip" }), `${base}_untertitel.srt`);
    setSubtitleDownloadName(`${base}_untertitel.mp4`);

    const jobId = await submitSubtitleEmbedJob("/api/jobs/embed-subtitles-session", formData);
    if (!jobId) {
      toast({
        title: "Einbettung konnte nicht gestartet werden",
        description: "Bitte erneut versuchen.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Einbettung gestartet",
      description: "Das Video wird mit Untertiteln verarbeitet...",
    });
  }, [sessionId, submitSubtitleEmbedJob, subtitleEnhanceAudio, subtitleSrt, subtitleTargetFile, subtitleType, toast]);

  // Select a file for editing
  const handleSelectFile = (file: SessionFile) => {
    setSelectedFile(file);
    setClips([]);
    setTrimStart(0);
    setTrimEnd(file.metadata?.duration || 0);
  };

  const shouldUseProxy = useCallback((file: SessionFile | null) => {
    if (!file) return false;
    if (!file.mimeType?.startsWith('video/')) return false;
    if (forceProxyPreview[file.id]) return true;
    const durationSeconds = file.metadata?.duration || 0;
    return file.size >= 100 * 1024 * 1024 || durationSeconds >= 10 * 60;
  }, [forceProxyPreview]);

  // Setup preview URL + proxy generation for large files
  useEffect(() => {
    if (!selectedFile || !sessionId) {
      setPreviewUrl(null);
      setProxyStatus('idle');
      return;
    }

    const originalUrl = `/api/session/files/${selectedFile.id}?session=${sessionId}`;
    setPreviewUrl(originalUrl);
    setProxyStatus('idle');

    if (!shouldUseProxy(selectedFile)) {
      return;
    }

    let cancelled = false;
    const pollStatus = async () => {
      if (cancelled) return;
      const status = await getProxyStatus(selectedFile.id);
      if (!status) {
        setProxyStatus('failed');
        return;
      }
      if (status.status === 'completed') {
        resumeTimeAfterSrcSwitchRef.current = videoRef.current?.currentTime ?? currentTime;
        setPreviewUrl(getProxyUrl(selectedFile.id));
        setProxyStatus('ready');
        return;
      }
      if (status.status === 'failed') {
        setProxyStatus('failed');
        return;
      }
      proxyPollRef.current = window.setTimeout(pollStatus, 2000);
    };

    const startProxy = async () => {
      setProxyStatus('processing');
      const response = await ensureProxy(selectedFile.id);
      if (!response) {
        setProxyStatus('failed');
        return;
      }
      if (response.status === 'completed') {
        resumeTimeAfterSrcSwitchRef.current = videoRef.current?.currentTime ?? currentTime;
        setPreviewUrl(getProxyUrl(selectedFile.id));
        setProxyStatus('ready');
        return;
      }
      proxyPollRef.current = window.setTimeout(pollStatus, 1500);
    };

    startProxy();

    return () => {
      cancelled = true;
      if (proxyPollRef.current) {
        clearTimeout(proxyPollRef.current);
        proxyPollRef.current = null;
      }
    };
  }, [selectedFile, sessionId, ensureProxy, getProxyStatus, getProxyUrl, shouldUseProxy]);

  // Video player controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    // Don't update during programmatic seeking
    if (videoRef.current && !isSeekingRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const loadedDuration = videoRef.current.duration;
      const metadataDuration = selectedFile?.metadata?.duration;
      const canonicalDuration =
        typeof metadataDuration === 'number' && Number.isFinite(metadataDuration) && metadataDuration > 0
          ? metadataDuration
          : loadedDuration;
      setDuration(canonicalDuration);
      setTrimEnd(prev => (prev > 0 && prev <= canonicalDuration ? prev : canonicalDuration));

      // When we switch from original to proxy preview, restore time so the playhead doesn't jump.
      if (resumeTimeAfterSrcSwitchRef.current !== null && Number.isFinite(resumeTimeAfterSrcSwitchRef.current)) {
        const t = Math.max(0, Math.min(resumeTimeAfterSrcSwitchRef.current, Number.isFinite(canonicalDuration) ? canonicalDuration : resumeTimeAfterSrcSwitchRef.current));
        resumeTimeAfterSrcSwitchRef.current = null;
        try {
          isSeekingRef.current = true;
          videoRef.current.currentTime = t;
          setCurrentTime(t);
        } catch {
          // ignore
        }
      }
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      isSeekingRef.current = true;
      lastRequestedSeekRef.current = time;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration;
    seekTo(time);
  };

  // Keyboard shortcuts – active in all modes except timeline (which has its own)
  useVideoKeyboardShortcuts({
    videoRef,
    duration,
    onPlayPause: () => {
      if (!videoRef.current) return;
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    },
    onSeek: seekTo,
    onSetInPoint: () => {
      setTrimStart(currentTime);
      if (trimEnd < currentTime) setTrimEnd(duration);
      recordEdit({ trimStart: currentTime, trimEnd: trimEnd < currentTime ? duration : trimEnd });
    },
    onSetOutPoint: () => {
      setTrimEnd(currentTime);
      if (trimStart > currentTime) setTrimStart(0);
      recordEdit({ trimEnd: currentTime, trimStart: trimStart > currentTime ? 0 : trimStart });
    },
    onAddCutMarker: () => {
      // Delegate to addCutMarker (defined below) – wrapped in a callback ref
      addCutMarkerRef.current?.();
    },
    onUndo: undo,
    onRedo: redo,
    enabled: mode !== 'timeline' && mode !== 'record' && !!selectedFile,
  });

  // Ref for addCutMarker so keyboard shortcut can call it without stale closures
  const addCutMarkerRef = useRef<(() => void) | null>(null);

  // Trim functions
  const setInPoint = () => {
    setTrimStart(currentTime);
    recordEdit({ trimStart: currentTime });
    if (trimEnd < currentTime) {
      setTrimEnd(duration);
    }
  };

  const setOutPoint = () => {
    setTrimEnd(currentTime);
    if (trimStart > currentTime) {
      setTrimStart(0);
    }
    recordEdit({ trimEnd: currentTime, trimStart: trimStart > currentTime ? 0 : trimStart });
  };

  const handleTrim = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    const result = await trimVideo(selectedFile.id, trimStart, trimEnd, exportConstraints);
    setIsProcessing(false);

    if (result) {
      toast({
        title: "Video getrimmt",
        description: `Neuer Clip: ${result.name}`,
      });
      highlightNewFile(result.id);
    } else {
      toast({
        title: "Fehler beim Trimmen",
        variant: "destructive",
      });
    }
  };

  // Cut functions
  const addCutMarker = () => {
    const newClip: Clip = {
      id: Date.now().toString(),
      start: clips.length > 0 ? clips[clips.length - 1].end : 0,
      end: currentTime,
      selected: true,
    };

    // Update previous clip end if exists
    let newClips: Clip[];
    if (clips.length > 0) {
      const updatedClips = [...clips];
      updatedClips[updatedClips.length - 1].end = currentTime;
      newClips = [...updatedClips, { ...newClip, start: currentTime, end: duration }];
    } else {
      newClips = [
        { id: '1', start: 0, end: currentTime, selected: true },
        { id: '2', start: currentTime, end: duration, selected: true },
      ];
    }
    setClips(newClips);
    recordEdit({ clips: newClips });
  };

  // Keep the ref in sync so keyboard shortcuts can call addCutMarker without stale closures.
  addCutMarkerRef.current = addCutMarker;

  const toggleClipSelection = (clipId: string) => {
    const updated = clips.map(c =>
      c.id === clipId ? { ...c, selected: !c.selected } : c
    );
    setClips(updated);
    recordEdit({ clips: updated });
  };

  const handleCut = async () => {
    if (!selectedFile || clips.length === 0) return;

    const selectedClips = clips.filter(c => c.selected);
    if (selectedClips.length === 0) {
      toast({
        title: "Keine Clips ausgewählt",
        description: "Wähle mindestens einen Clip aus.",
        variant: "destructive",
      });
      return;
    }

    const segments: CutSegment[] = selectedClips.map(c => ({
      start: c.start,
      end: c.end,
    }));

    setIsProcessing(true);
    const result = await cutVideo(selectedFile.id, segments, exportConstraints);
    setIsProcessing(false);

    if (result && result.length > 0) {
      toast({
        title: "Video geschnitten",
        description: `${result.length} Clips erstellt`,
      });
      setClips([]);
      highlightNewFile(result[0].id);
    } else {
      toast({
        title: "Fehler beim Schneiden",
        variant: "destructive",
      });
    }
  };

  const handleSrtGuideSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSrtGuideFile(file);
    e.target.value = '';
    toast({ title: "SRT geladen", description: file.name });
  };

  const generateSmartCutFromSrt = async () => {
    if (!selectedFile) {
      toast({ title: "Video auswählen", description: "Bitte zuerst ein Video auswählen.", variant: "destructive" });
      return;
    }
    if (!srtGuideFile) {
      toast({ title: "SRT erforderlich", description: "Bitte eine SRT-Datei laden.", variant: "destructive" });
      return;
    }

    try {
      const srtText = await srtGuideFile.text();
      const segments = parseSrt(srtText);
      if (!segments.length) {
        toast({ title: "SRT leer/ungültig", variant: "destructive" });
        return;
      }

      const gap = Math.max(0.3, Math.min(10, smartCutGapSeconds));
      const minDur = Math.max(0.5, Math.min(120, smartCutMinClipSeconds));

      // Build keep-clips by grouping subtitle activity and cutting long gaps.
      const keep: Clip[] = [];
      let currentStart = Math.max(0, segments[0].startSeconds);
      let currentEnd = Math.max(currentStart, segments[0].endSeconds);

      for (let i = 1; i < segments.length; i += 1) {
        const prev = segments[i - 1];
        const seg = segments[i];
        const gapSec = Math.max(0, seg.startSeconds - prev.endSeconds);

        if (gapSec > gap) {
          if (currentEnd - currentStart >= minDur) {
            keep.push({
              id: `${keep.length + 1}`,
              start: currentStart,
              end: currentEnd,
              selected: true,
            });
          }
          currentStart = seg.startSeconds;
          currentEnd = seg.endSeconds;
        } else {
          currentEnd = Math.max(currentEnd, seg.endSeconds);
        }
      }

      if (currentEnd - currentStart >= minDur) {
        keep.push({
          id: `${keep.length + 1}`,
          start: currentStart,
          end: currentEnd,
          selected: true,
        });
      }

      if (!keep.length) {
        toast({
          title: "Keine Clips erzeugt",
          description: "Parameter zu streng? Erhöhe Gap oder senke Mindestlänge.",
          variant: "destructive",
        });
        return;
      }

      setMode("cut");
      setClips(keep);
      toast({
        title: "Smart-Cut Clips erzeugt",
        description: `${keep.length} Clips (aus Untertitel-Aktivität)`,
      });
    } catch (err: any) {
      toast({
        title: "Smart-Cut fehlgeschlagen",
        description: err?.message || "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  // Merge functions
  const toggleMergeSelection = (fileId: string) => {
    setMergeSelection(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleMerge = async () => {
    if (mergeSelection.length < 2) {
      toast({
        title: "Mindestens 2 Videos auswählen",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    const result = await mergeVideos(mergeSelection, undefined, exportConstraints);
    setIsProcessing(false);

    if (result) {
      toast({
        title: "Videos zusammengefügt",
        description: result.name,
      });
      setMergeSelection([]);
      highlightNewFile(result.id);
    } else {
      toast({
        title: "Fehler beim Zusammenfügen",
        variant: "destructive",
      });
    }
  };

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Format audio recording time
  const formatAudioTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle audio file upload
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file, { forceResumable: true });
    if (result) {
      toast({
        title: "Audio hochgeladen",
        description: file.name,
      });
    } else {
      toast({
        title: "Fehler beim Upload",
        description: "Die Audiodatei konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    }

    // Reset input
    e.target.value = '';
  };

  // Start audio recording
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([blob], `aufnahme-${Date.now()}.webm`, { type: mimeType });

        // Upload the recording
        const result = await uploadFile(file);
        if (result) {
          toast({
            title: "Audio aufgenommen",
            description: `${formatAudioTime(audioRecordingTime)} aufgenommen`,
          });
        }

        // Cleanup
        audioStreamRef.current?.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        setAudioRecordingTime(0);
      };

      audioRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecordingAudio(true);

      // Start timer
      audioTimerRef.current = window.setInterval(() => {
        setAudioRecordingTime(t => t + 1);
      }, 1000);

    } catch (err: any) {
      toast({
        title: "Mikrofon nicht verfügbar",
        description: "Bitte erlauben Sie den Zugriff auf Ihr Mikrofon.",
        variant: "destructive",
      });
    }
  };

  // Stop audio recording
  const stopAudioRecording = () => {
    if (audioRecorderRef.current && isRecordingAudio) {
      audioRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
    }
  };

  // Cleanup audio recording on unmount
  useEffect(() => {
    return () => {
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
      }
      audioStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // Check if file is audio
  const isAudioFile = (file: SessionFile) => {
    return file.mimeType?.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|webm|m4a|aac|flac)$/i);
  };

  // Generate waveform from audio file
  const generateWaveform = useCallback(async (audioUrl: string): Promise<number[]> => {
    try {
      const audioContext = new AudioContext();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const rawData = audioBuffer.getChannelData(0);
      const samples = 200; // Number of peaks
      const blockSize = Math.floor(rawData.length / samples);
      const peaks: number[] = [];

      for (let i = 0; i < samples; i++) {
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
          const abs = Math.abs(rawData[i * blockSize + j]);
          if (abs > max) max = abs;
        }
        peaks.push(max);
      }

      audioContext.close();
      return peaks;
    } catch (err) {
      console.error('Waveform generation failed:', err);
      return [];
    }
  }, []);

  // Render waveform to canvas
  const renderWaveform = useCallback((peaks: number[]) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / peaks.length;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    ctx.fillStyle = '#8b5cf6'; // Purple
    peaks.forEach((peak, i) => {
      const barHeight = Math.max(2, peak * height * 0.9);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });

    // Draw trim overlay if in voiceover mode
    if (mode === 'voiceover' && audioDuration > 0) {
      // Dim areas outside trim
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      const trimStartX = (audioTrimStart / audioDuration) * width;
      const trimEndX = (audioTrimEnd / audioDuration) * width;
      ctx.fillRect(0, 0, trimStartX, height);
      ctx.fillRect(trimEndX, 0, width - trimEndX, height);
    }
  }, [mode, audioDuration, audioTrimStart, audioTrimEnd]);

  // Load audio track and generate waveform
  const loadAudioTrack = useCallback(async (file: SessionFile, initialTrim?: { start: number; end: number }) => {
    setAudioTrack(file);
    const audioUrl = `/api/session/files/${file.id}?session=${sessionId}`;

    // Get audio duration
    const audio = new Audio(audioUrl);
    audio.addEventListener('loadedmetadata', () => {
      const dur = audio.duration;
      setAudioDuration(dur);
      if (initialTrim) {
        setAudioTrimStart(Math.max(0, Math.min(initialTrim.start, dur)));
        setAudioTrimEnd(Math.max(0, Math.min(initialTrim.end, dur)));
      } else {
        setAudioTrimStart(0);
        setAudioTrimEnd(dur);
      }
    });

    // Generate waveform
    const peaks = await generateWaveform(audioUrl);
    setAudioWaveform(peaks);
  }, [sessionId, generateWaveform]);

  // Persist editor state for crash recovery
  useEffect(() => {
    if (!sessionId || isRestoringRef.current) return;
    const state: SavedEditorState = {
      version: 1,
      sessionId,
      selectedFileId: selectedFile?.id,
      mode,
      trimStart,
      trimEnd,
      clips,
      mergeSelection,
      audioTrackId: audioTrack?.id,
      audioTrimStart,
      audioTrimEnd,
      audioVolume
    };
    try {
      localStorage.setItem(`voxdrop-videoschnitt:${sessionId}`, JSON.stringify(state));
    } catch {
      // Ignore storage failures (e.g., quota)
    }
  }, [
    sessionId,
    selectedFile?.id,
    mode,
    trimStart,
    trimEnd,
    clips,
    mergeSelection,
    audioTrack?.id,
    audioTrimStart,
    audioTrimEnd,
    audioVolume
  ]);

  // Restore editor state after reload
  useEffect(() => {
    if (!sessionId || files.length === 0 || hasRestoredRef.current) return;
    const key = `voxdrop-videoschnitt:${sessionId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as SavedEditorState;
      if (saved.version !== 1 || saved.sessionId !== sessionId) return;

      isRestoringRef.current = true;

      if (saved.mode) {
        setModeRaw(saved.mode);
      }
      if (typeof saved.trimStart === 'number') {
        setTrimStart(saved.trimStart);
      }
      if (typeof saved.trimEnd === 'number') {
        setTrimEnd(saved.trimEnd);
      }
      if (Array.isArray(saved.mergeSelection)) {
        const existingIds = new Set(files.map(f => f.id));
        setMergeSelection(saved.mergeSelection.filter(id => existingIds.has(id)));
      }
      if (typeof saved.audioVolume === 'number') {
        setAudioVolume(saved.audioVolume);
      }

      let restoredSelectedFile: SessionFile | null = null;
      if (saved.selectedFileId) {
        const file = files.find(f => f.id === saved.selectedFileId);
        if (file) {
          restoredSelectedFile = file;
          setSelectedFile(file);
        }
      }

      if (restoredSelectedFile && Array.isArray(saved.clips)) {
        setClips(saved.clips);
      }

      if (saved.audioTrackId) {
        const audioFile = files.find(f => f.id === saved.audioTrackId);
        if (audioFile && isAudioFile(audioFile)) {
          const trimStart = typeof saved.audioTrimStart === 'number' ? saved.audioTrimStart : 0;
          const trimEnd = typeof saved.audioTrimEnd === 'number' ? saved.audioTrimEnd : 0;
          loadAudioTrack(audioFile, { start: trimStart, end: trimEnd });
        }
      }

      toast({
        title: "Sitzung wiederhergestellt",
        description: "Der Videoschnitt wurde aus der letzten Sitzung geladen.",
      });
    } catch {
      // Ignore corrupted state
    } finally {
      hasRestoredRef.current = true;
      isRestoringRef.current = false;
    }
  }, [sessionId, files, loadAudioTrack, toast]);

  // Re-render waveform when it changes
  useEffect(() => {
    if (audioWaveform.length > 0) {
      renderWaveform(audioWaveform);
    }
  }, [audioWaveform, renderWaveform]);

  // Start voice-over recording (synced with video)
  const startVoiceoverRecording = async () => {
    if (!selectedFile || !videoRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([blob], `voiceover-${Date.now()}.webm`, { type: mimeType });

        // Upload the recording
        const result = await uploadFile(file);
        if (result) {
          toast({
            title: "Voice-Over aufgenommen",
            description: `${formatDuration(audioRecordingTime)} aufgenommen`,
          });
          // Load as audio track
          await loadAudioTrack(result);
        }

        // Cleanup
        audioStreamRef.current?.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        setAudioRecordingTime(0);
      };

      audioRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecordingVoiceover(true);

      // Start video playback
      videoRef.current.currentTime = 0;
      videoRef.current.play();

      // Start timer
      audioTimerRef.current = window.setInterval(() => {
        setAudioRecordingTime(t => t + 1);
      }, 1000);

    } catch (err: any) {
      toast({
        title: "Mikrofon nicht verfügbar",
        description: "Bitte erlauben Sie den Zugriff auf Ihr Mikrofon.",
        variant: "destructive",
      });
    }
  };

  // Stop voice-over recording
  const stopVoiceoverRecording = () => {
    if (audioRecorderRef.current && isRecordingVoiceover) {
      audioRecorderRef.current.stop();
      setIsRecordingVoiceover(false);
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
      // Pause video
      videoRef.current?.pause();
    }
  };

  // Sync play video and audio
  const syncPlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      audioRef.current?.pause();
    } else {
      // Sync audio to video position
      if (audioRef.current && audioTrack) {
        audioRef.current.currentTime = videoRef.current.currentTime;
        audioRef.current.volume = audioVolume;
        audioRef.current.play();
      }
      videoRef.current.play();
    }
  };

  // Combine video and audio tracks
  const handleCombineTracks = async () => {
    if (!selectedFile || !audioTrack) return;

    setIsProcessing(true);
    const result = await combineVideoAudio(
      selectedFile.id,
      audioTrack.id,
      {
        videoTrimStart: trimStart > 0 ? trimStart : undefined,
        videoTrimEnd: trimEnd < duration ? trimEnd : undefined,
        audioTrimStart: audioTrimStart > 0 ? audioTrimStart : undefined,
        audioTrimEnd: audioTrimEnd < audioDuration ? audioTrimEnd : undefined,
        audioVolume,
        maxSizeMb: exportConstraints.maxSizeMb,
        // Help the server hit the max size by rendering at 720p when the intranet preset is enabled.
        resolution: exportConstraints.maxSizeMb ? '720p' : undefined,
        aspect: exportConstraints.aspect,
        normalizeAudio: exportConstraints.normalizeAudio,
      }
    );
    setIsProcessing(false);

    if (result) {
      toast({
        title: "Video erstellt",
        description: `${result.name} mit Voice-Over`,
      });
      highlightNewFile(result.id);
      // Clear audio track
      setAudioTrack(null);
      setAudioWaveform([]);
    } else {
      toast({
        title: "Fehler beim Zusammenfügen",
        variant: "destructive",
      });
    }
  };

  // Remove audio track
  const removeAudioTrack = () => {
    setAudioTrack(null);
    setAudioWaveform([]);
    setAudioDuration(0);
  };

  // Handle freeze frame extraction
  const handleFreezeFrame = async (fileId: string, time: number) => {
    setIsProcessing(true);
    const result = await extractFreezeFrame(fileId, time, 'jpg');
    setIsProcessing(false);

    if (result) {
      toast({
        title: "Standbild erstellt",
        description: result.name,
      });
    } else {
      toast({
        title: "Fehler beim Erstellen des Standbilds",
        variant: "destructive",
      });
    }
  };

  const runRegie = useCallback(async () => {
    const prompt = regiePrompt.trim();
    if (!prompt) {
      toast({ title: "Kein Prompt", description: "Bitte gib eine Regie-Anweisung ein.", variant: "destructive" });
      return;
    }

    setRegieWorking(true);
    try {
      const res = await fetch("/api/video-ai/interpret-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt,
          durationSeconds: duration || selectedFile?.metadata?.duration || 0,
          currentTimeSeconds: currentTime || 0,
          mode,
          trimStartSeconds: trimStart,
          trimEndSeconds: trimEnd,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "KI-Regie fehlgeschlagen");

      const action = data?.command?.action as string | undefined;
      const params = data?.command?.params || {};
      if (!action) throw new Error("Ungültige KI-Antwort (keine action)");

      if (action === "seek") {
        const t = Number(params?.timeSeconds);
        if (!Number.isFinite(t)) throw new Error("Ungültige seek-Zeit");
        seekTo(Math.max(0, Math.min(duration || t, t)));
        toast({ title: "Regie angewendet", description: `Springe zu ${t.toFixed(2)}s` });
        return;
      }

      if (action === "freeze_frame") {
        const t = Number(params?.atSeconds ?? params?.timeSeconds);
        if (!Number.isFinite(t)) throw new Error("Ungültige Standbild-Zeit");
        if (!selectedFile) throw new Error("Bitte zuerst ein Video auswählen");
        await handleFreezeFrame(selectedFile.id, Math.max(0, t));
        toast({ title: "Regie angewendet", description: "Standbild erzeugt" });
        return;
      }

      if (action === "trim") {
        const start = Number(params?.startSeconds);
        const end = Number(params?.endSeconds);
        if (!selectedFile) throw new Error("Bitte zuerst ein Video auswählen");
        if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Ungültige trim-Zeiten");
        const s = Math.max(0, start);
        const e = Math.max(s, end);
        setMode("trim");
        setTrimStart(s);
        setTrimEnd(e);

        // Do the actual export right away.
        setIsProcessing(true);
        const result = await trimVideo(selectedFile.id, s, e, exportConstraints);
        setIsProcessing(false);

        if (result) {
          toast({ title: "Regie angewendet", description: `Getrimmt: ${result.name}` });
          return;
        }
        throw new Error("Trim-Export fehlgeschlagen");
      }

      throw new Error(`Unbekannte Aktion: ${action}`);
    } catch (err: any) {
      toast({ title: "AI-Regie fehlgeschlagen", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setRegieWorking(false);
    }
  }, [regiePrompt, toast, duration, selectedFile, currentTime, mode, trimStart, trimEnd, seekTo, handleFreezeFrame, trimVideo, exportConstraints]);

  // Handle timeline render
  const handleRenderTimeline = async (
    tracks: TimelineTrack[],
    options?: { transition?: { type: 'none' | 'fade' | 'crossfade'; durationSeconds?: number } }
  ) => {
    setIsProcessing(true);
    const result = await renderTimeline(tracks, {
      resolution: exportConstraints.maxSizeMb ? '720p' : 'original',
      maxSizeMb: exportConstraints.maxSizeMb,
      aspect: exportConstraints.aspect,
      normalizeAudio: exportConstraints.normalizeAudio,
      cleanAudio: exportCleanAudio ? true : undefined,
      transition: options?.transition,
    });
    setIsProcessing(false);

    if (result) {
      toast({
        title: "Video exportiert",
        description: `${result.name} (${formatFileSize(result.size)})`,
      });
    } else {
      toast({
        title: "Fehler beim Exportieren",
        variant: "destructive",
      });
    }
  };

  return (
    <PageLayout>
      <SEO
        title="Schnitt & Struktur - VoxDrop"
        description="Videos aufnehmen, schneiden, untertiteln und barrierefrei bereitstellen. Verarbeitung auf VoxDrop-Servern, DSGVO-konform."
      />


      <main id="main-content" className="pt-24 pb-32 px-6" tabIndex={-1}>
        <div className={chatOpen && hasVideoEditAccess && files.length > 0 ? "max-w-7xl mx-auto" : "max-w-5xl mx-auto"}>
          {/* Header */}
          <div className="text-center mb-8 relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100/80 rounded-full mb-4">
              <Scissors className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">Video-Editor</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">
              Schnitt & Struktur
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Aufnehmen oder Upload, Untertitel (SRT/VTT/TTML) und KI-Sprache in einem Workflow.
              Für barrierefreie Inhalte, die alle nutzen können.
            </p>
            {/* AI Chat toggle */}
            {hasVideoEditAccess && files.length > 0 && (
              <button
                onClick={() => setChatOpen((v) => !v)}
                className={`absolute right-0 top-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  chatOpen
                    ? "bg-purple-100 text-purple-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title={chatOpen ? "Assistent ausblenden" : "KI-Assistent einblenden"}
              >
                <Bot className="w-4 h-4" />
                {chatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Pro Gate */}
          {!hasVideoEditAccess && (
            <div className="mb-8 bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Pro-Funktion</h2>
              <p className="text-slate-600 mb-6 max-w-md mx-auto">
                Der Videoschnitt ist ab Pro verfügbar.
                Upgrade jetzt, um Quellen, Audio-Mixer und Timeline-Export zu nutzen.
              </p>
              <Link href="/preise">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Crown className="w-4 h-4 mr-2" />
                  Jetzt freischalten
                </Button>
              </Link>
            </div>
          )}

          {/* Video Editor */}
          {hasVideoEditAccess && (
            <>
              {/* Upload Hero when no files exist */}
              {files.length === 0 && !isLoading ? (
                <UploadHero onDrop={handleDrop} onFileUpload={handleFileUpload} />
              ) : (
                <div className={chatOpen ? "grid grid-cols-[1fr,340px] gap-6 items-start" : ""}>
                <div>
                  <div className="mb-6">
              {/* Mode Selector */}
              <ModeSelector
                mode={mode}
                onModeChange={setMode}
                advancedToolsOpen={advancedToolsOpen}
                onAdvancedToolsOpenChange={setAdvancedToolsOpen}
                regieOpen={regieOpen}
                onRegieOpenChange={setRegieOpen}
                regiePrompt={regiePrompt}
                onRegiePromptChange={setRegiePrompt}
                regieWorking={regieWorking}
                onRunRegie={runRegie}
                smartSyncOpen={smartSyncOpen}
                onSmartSyncOpenChange={setSmartSyncOpen}
                sessionId={sessionId}
                selectedFile={selectedFile}
                refreshSession={refreshSession}
                onSmartSyncUseResult={(file) => {
                  setSelectedFile(file);
                  setMode("trim");
                }}
              />

              <ExportSettings
                exportProfileEnabled={exportProfileEnabled}
                onExportProfileEnabledChange={setExportProfileEnabled}
                exportSettingsOpen={exportSettingsOpen}
                onExportSettingsOpenChange={setExportSettingsOpen}
                exportAspect={exportAspect}
                onExportAspectChange={setExportAspect}
                exportNormalizeAudio={exportNormalizeAudio}
                onExportNormalizeAudioChange={setExportNormalizeAudio}
                exportCleanAudio={exportCleanAudio}
                onExportCleanAudioChange={setExportCleanAudio}
                exportFastModeEnabled={exportFastModeEnabled}
                onExportFastModeEnabledChange={setExportFastModeEnabled}
              />

              {/* Smart Cut (SRT guide) - Advanced helper for cut mode */}
              {mode === 'cut' && (
                <div className="mb-4 bg-white rounded-2xl border border-slate-200 p-4">
                  <Collapsible open={smartCutOpen} onOpenChange={setSmartCutOpen}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-[240px]">
                        <div className="text-sm font-semibold text-slate-900">Automatisch schneiden (SRT)</div>
                        <div className="text-xs text-slate-600 mt-1">
                          Optional: aus Untertiteln Clips erzeugen (lange Pausen werden geschnitten).
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <button className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-4">
                            {smartCutOpen ? "Ausblenden" : "Einrichten"}
                          </button>
                        </CollapsibleTrigger>
                        <input
                          ref={srtGuideInputRef}
                          type="file"
                          accept=".srt,text/plain"
                          onChange={handleSrtGuideSelect}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => srtGuideInputRef.current?.click()}
                        >
                          SRT laden
                        </Button>
                        <Button
                          className="rounded-lg bg-slate-900 hover:bg-slate-800"
                          onClick={generateSmartCutFromSrt}
                          disabled={!selectedFile || !srtGuideFile}
                        >
                          Clips erzeugen
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-700">Gap-Schwelle (Sek.)</label>
                          <Input
                            type="number"
                            min={0.3}
                            step={0.1}
                            value={smartCutGapSeconds}
                            onChange={(e) => setSmartCutGapSeconds(Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700">Min. Clip-Länge (Sek.)</label>
                          <Input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={smartCutMinClipSeconds}
                            onChange={(e) => setSmartCutMinClipSeconds(Number(e.target.value))}
                          />
                        </div>
                        <div className="text-xs text-slate-500 flex items-end">
                          {srtGuideFile ? `Guide: ${srtGuideFile.name}` : "Noch keine SRT-Datei geladen."}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Video Player */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {mode === 'record' ? (
                  <div className="p-6">
                    <div className="mb-4">
                      <div className="text-lg font-semibold text-slate-900">Aufnahme</div>
                      <div className="text-sm text-slate-600 mt-1">
                        Nimm deinen Bildschirm inkl. Systemaudio und Mikrofon auf. Danach wird die Aufnahme automatisch in dieser Session gespeichert
                        und als Video ausgewählt.
                      </div>
                    </div>
                    <ScreenRecorder
                      onRecordingComplete={handleScreenRecordingComplete}
                      onChapterMark={handleChapterMark}
                      chapterCount={chapterMarkers.length}
                      showStoragePicker={false}
                      enableAutoChunking={false}
                      autoSaveToServer={false}
                      primaryActionLabel="In Videoschnitt übernehmen"
                      primaryActionIcon="video"
                    />
                    {chapterMarkers.length > 0 && (
                      <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium text-purple-900">Kapitelmarker</p>
                          <button
                            onClick={clearChapterMarkers}
                            className="text-xs text-purple-600 hover:text-purple-700"
                          >
                            Alle entfernen
                          </button>
                        </div>
                        <div className="space-y-2">
                          {chapterMarkers.map((marker, index) => (
                            <div key={`${marker.timeSeconds}-${index}`} className="flex items-center gap-2">
                              <span className="text-xs font-mono text-purple-700 bg-white px-2 py-1 rounded">
                                {formatMarkerTime(marker.timeSeconds)}
                              </span>
                              <input
                                type="text"
                                value={marker.title}
                                onChange={(e) => updateChapterMarkerTitle(index, e.target.value)}
                                className="flex-1 text-sm bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-slate-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                              />
                              <button
                                onClick={() => removeChapterMarker(index)}
                                className="p-1.5 text-purple-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Kapitelmarker entfernen"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : selectedFile ? (
                  <>
                    {/* Video */}
                    <div className="relative bg-black aspect-video">
                      <video
                        ref={videoRef}
                        src={previewUrl || `/api/session/files/${selectedFile.id}?session=${sessionId}`}
                        className="w-full h-full"
                        preload="auto"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onSeeked={() => {
                          isSeekingRef.current = false;
                          if (videoRef.current) {
                            const actual = videoRef.current.currentTime;
                            setCurrentTime(actual);

                            // Compatibility: Some MP4s can't seek in-browser (moov atom at end / proxy interference).
                            // If the browser snaps back to ~0 after a seek to >2s, automatically enable proxy preview.
                            const requested = lastRequestedSeekRef.current;
                            if (
                              selectedFile &&
                              sessionId &&
                              selectedFile.mimeType?.startsWith('video/') &&
                              requested !== null &&
                              Number.isFinite(requested) &&
                              requested > 2 &&
                              actual < 0.25 &&
                              !forceProxyPreview[selectedFile.id] &&
                              !shouldUseProxy(selectedFile)
                            ) {
                              setForceProxyPreview((prev) => ({ ...prev, [selectedFile.id]: true }));
                              toast({
                                title: "Vorschau-Kompatibilität",
                                description: "Dein Video lässt sich im Browser nicht sauber anspringen. Wir erstellen jetzt eine Proxy-Vorschau (schnell & seekbar).",
                              });
                            }
                          }
                        }}
                      />
                    </div>

                    {/* Timeline */}
                    <div className="p-4 border-t border-slate-100">
                      <div
                        ref={timelineRef}
                        className="relative h-12 bg-slate-100 rounded-lg cursor-pointer mb-4 overflow-hidden"
                        onClick={handleTimelineClick}
                      >
                        {/* Thumbnail strip */}
                        {timelineThumbnails.thumbnails.length > 0 && (
                          <div className="absolute inset-0 flex" aria-hidden="true">
                            {timelineThumbnails.thumbnails.map((thumb, i) => (
                              <img
                                key={i}
                                src={thumb.url}
                                className="h-full object-cover flex-shrink-0 opacity-60"
                                style={{ width: `${100 / timelineThumbnails.thumbnails.length}%` }}
                                alt=""
                                draggable={false}
                              />
                            ))}
                          </div>
                        )}

                        {/* Trim range indicator */}
                        {mode === 'trim' && (
                          <div
                            className="absolute top-0 bottom-0 bg-purple-200"
                            style={{
                              left: `${(trimStart / duration) * 100}%`,
                              width: `${((trimEnd - trimStart) / duration) * 100}%`,
                            }}
                          />
                        )}

                        {/* Cut markers */}
                        {mode === 'cut' && clips.map((clip, i) => (
                          <div
                            key={clip.id}
                            className={`absolute top-0 bottom-0 border-l-2 border-r-2 ${
                              clip.selected
                                ? 'bg-green-200/80 border-green-500'
                                : 'bg-red-200/60 border-red-500'
                            }`}
                            style={{
                              left: `${(clip.start / duration) * 100}%`,
                              width: `${((clip.end - clip.start) / duration) * 100}%`,
                              // Diagonal stripes for deactivated clips (accessibility: not color-only)
                              ...(!clip.selected ? {
                                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.15) 6px)',
                              } : {}),
                            }}
                          >
                            <span className="absolute top-1 left-1 text-[10px] font-bold leading-none">
                              {clip.selected ? '\u2713' : '\u2717'}{i + 1}
                            </span>
                          </div>
                        ))}

                        {/* Playhead */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-purple-600 z-10"
                          style={{ left: `${(currentTime / duration) * 100}%` }}
                        >
                          <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-purple-600 rounded-full" />
                        </div>

                        {/* Video track label */}
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-medium pointer-events-none">
                          Video
                        </span>
                      </div>

                      {/* Audio Track (Voice-Over) */}
                      {mode === 'voiceover' && (
                        <div className="mb-4">
                          {audioTrack ? (
                            <div className="relative">
                              {/* Waveform Canvas */}
                              <canvas
                                ref={waveformCanvasRef}
                                width={800}
                                height={48}
                                className="w-full h-12 bg-orange-50 rounded-lg cursor-pointer"
                                onClick={(e) => {
                                  if (audioDuration > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    const percent = x / rect.width;
                                    const time = percent * audioDuration;
                                    if (audioRef.current) {
                                      audioRef.current.currentTime = time;
                                    }
                                  }
                                }}
                              />
                              {/* Audio track label and controls */}
                              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                <span className="text-xs text-orange-600 font-medium bg-orange-100 px-1.5 py-0.5 rounded">
                                  Audio
                                </span>
                              </div>
                              {/* Remove audio track button */}
                              <button
                                onClick={removeAudioTrack}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-red-100 hover:bg-red-200 rounded text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              {/* Playhead for audio */}
                              {audioDuration > 0 && (
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none"
                                  style={{ left: `${(currentTime / audioDuration) * 100}%` }}
                                />
                              )}
                            </div>
                          ) : (
                            <div className="h-12 bg-orange-50/50 border-2 border-dashed border-orange-200 rounded-lg flex items-center justify-center">
	                              <span className="text-sm text-orange-400">
	                                Audio aufnehmen, Audio-Datei hochladen oder KI Sprache erzeugen
	                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Hidden audio element for playback */}
                      {audioTrack && (
                        <audio
                          ref={audioRef}
                          src={`/api/session/files/${audioTrack.id}?session=${sessionId}`}
                          preload="auto"
                        />
                      )}

                      {/* Controls */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => seekTo(Math.max(0, currentTime - 5))}
                            className="p-2 hover:bg-slate-100 rounded-lg"
                          >
                            <SkipBack className="w-5 h-5" />
                          </button>
                          <button
                            onClick={mode === 'voiceover' && audioTrack ? syncPlayPause : togglePlay}
                            className="p-3 bg-purple-600 text-white rounded-full hover:bg-purple-700"
                          >
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={() => seekTo(Math.min(duration, currentTime + 5))}
                            className="p-2 hover:bg-slate-100 rounded-lg"
                          >
                            <SkipForward className="w-5 h-5" />
                          </button>
                          <span className="text-sm font-mono text-slate-600 ml-2">
                            {formatTime(currentTime)} / {formatTime(duration)}
                          </span>
                          {proxyStatus === 'processing' && (
                            <span className="text-xs text-slate-500 ml-3">Optimierte Vorschau wird erstellt…</span>
                          )}
                          {proxyStatus === 'ready' && (
                            <span className="text-xs text-green-600 ml-3">Optimierte Vorschau aktiv</span>
                          )}
                          {proxyStatus === 'failed' && (
                            <span className="text-xs text-amber-600 ml-3">Proxy fehlgeschlagen · Original aktiv</span>
                          )}
                        </div>

                        {/* Mode-specific actions */}
                        {mode === 'trim' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={setInPoint}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                              title="Shortcut: I"
                            >
                              In: {formatTime(trimStart)}
                            </button>
                            <button
                              onClick={setOutPoint}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                              title="Shortcut: O"
                            >
                              Out: {formatTime(trimEnd)}
                            </button>
                            {/* Preview */}
                            {preview.isPreviewing ? (
                              <button
                                onClick={preview.stopPreview}
                                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium animate-pulse"
                              >
                                <Square className="w-3 h-3 inline mr-1 fill-current" />
                                Stopp
                              </button>
                            ) : (
                              <button
                                onClick={preview.startPreview}
                                disabled={trimStart >= trimEnd}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm disabled:opacity-50"
                                title="Vorschau des Schnitts abspielen"
                              >
                                <Play className="w-3 h-3 inline mr-1" />
                                Vorschau
                              </button>
                            )}
                            {isProcessing ? (
                              <div className="min-w-[140px] space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-slate-600">
                                  <span>{exportProgress.stage}</span>
                                  <span className="font-medium tabular-nums">{exportProgress.percent}%</span>
                                </div>
                                <Progress value={exportProgress.percent} className="h-1.5" />
                              </div>
                            ) : (
                              <Button
                                onClick={handleTrim}
                                disabled={trimStart >= trimEnd}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                <Scissors className="w-4 h-4 mr-2" />
                                Trimmen
                              </Button>
                            )}
                          </div>
                        )}

                        {mode === 'cut' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={addCutMarker}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                              title="Shortcut: M"
                            >
                              <Plus className="w-4 h-4 inline mr-1" />
                              Schnitt hier
                            </button>
                            {/* Preview */}
                            {clips.filter(c => c.selected).length > 0 && (
                              preview.isPreviewing ? (
                                <button
                                  onClick={preview.stopPreview}
                                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium animate-pulse"
                                >
                                  <Square className="w-3 h-3 inline mr-1 fill-current" />
                                  Stopp
                                </button>
                              ) : (
                                <button
                                  onClick={preview.startPreview}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                                  title="Vorschau der ausgewählten Clips"
                                >
                                  <Play className="w-3 h-3 inline mr-1" />
                                  Vorschau
                                </button>
                              )
                            )}
                            {isProcessing ? (
                              <div className="min-w-[140px] space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-slate-600">
                                  <span>{exportProgress.stage}</span>
                                  <span className="font-medium tabular-nums">{exportProgress.percent}%</span>
                                </div>
                                <Progress value={exportProgress.percent} className="h-1.5" />
                              </div>
                            ) : (
                              <Button
                                onClick={handleCut}
                                disabled={clips.length === 0}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                <Scissors className="w-4 h-4 mr-2" />
                                Clips erstellen
                              </Button>
                            )}
                          </div>
                        )}

                        {mode === 'voiceover' && (
                          <div className="flex items-center gap-2">
                            {/* Record Voice-Over Button */}
                            {isRecordingVoiceover ? (
                              <button
                                onClick={stopVoiceoverRecording}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 animate-pulse"
                              >
                                <Square className="w-4 h-4 fill-current" />
                                Stoppen ({formatTime(audioRecordingTime)})
                              </button>
                            ) : (
                              <button
                                onClick={startVoiceoverRecording}
                                disabled={!selectedFile}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                              >
                                <Mic className="w-4 h-4" />
                                Voice-Over aufnehmen
                              </button>
                            )}

                            {/* Volume Slider */}
                            {audioTrack && (
                              <div className="flex items-center gap-2 ml-4">
                                <Volume2 className="w-4 h-4 text-slate-500" />
                                <input
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.1"
                                  value={audioVolume}
                                  onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                                  className="w-20 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-slate-500 w-8">{Math.round(audioVolume * 100)}%</span>
                              </div>
                            )}

                            {/* Combine Button */}
                            {audioTrack && (
                              isProcessing ? (
                                <div className="min-w-[140px] ml-2 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-slate-600">
                                    <span>{exportProgress.stage}</span>
                                    <span className="font-medium tabular-nums">{exportProgress.percent}%</span>
                                  </div>
                                  <Progress value={exportProgress.percent} className="h-1.5" />
                                </div>
                              ) : (
                                <Button
                                  onClick={handleCombineTracks}
                                  className="bg-orange-500 hover:bg-orange-600 ml-2"
                                >
                                  <Merge className="w-4 h-4 mr-2" />
                                  Zusammenfügen
                                </Button>
                              )
                            )}
                          </div>
                        )}

                        {mode === "subtitles" && (
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <Button
                              onClick={handleCreateSubtitles}
                              disabled={!subtitleTargetFile || subtitleTranscriptionJob.isLoading}
                              className="bg-violet-600 hover:bg-violet-700"
                            >
                              {subtitleTranscriptionJob.isLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Subtitles className="w-4 h-4 mr-2" />
                              )}
                              Untertitel erstellen
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDownloadSubtitles("srt")}
                              disabled={!subtitleSrt.trim()}
                            >
                              SRT herunterladen
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDownloadSubtitles("vtt")}
                              disabled={!subtitleSrt.trim()}
                            >
                              VTT
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDownloadSubtitles("ttml")}
                              disabled={!subtitleSrt.trim()}
                            >
                              TTML
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleUseSrtAsSmartCutGuide}
                              disabled={!subtitleSrt.trim()}
                            >
                              Als Smart-Cut Guide
                            </Button>
                            <Button
                              variant="outline"
                              onClick={applySubtitleVocabulary}
                              disabled={!subtitleSrt.trim() || subtitleVocabulary.length === 0}
                            >
                              Vokabular anwenden
                            </Button>
                            <Button
                              onClick={handleEmbedSubtitlesNative}
                              disabled={
                                !subtitleTargetFile ||
                                !subtitleSrt.trim() ||
                                subtitleEmbedJob?.status === "pending" ||
                                subtitleEmbedJob?.status === "active"
                              }
                              className="bg-violet-700 hover:bg-violet-800"
                            >
                              {(subtitleEmbedJob?.status === "pending" || subtitleEmbedJob?.status === "active") && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              )}
                              Untertitel einbetten
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Keyboard shortcut hints */}
                      <KeyboardShortcutBar canUndo={canUndo} canRedo={canRedo} />

                      {mode === 'voiceover' && (
                        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
	                            <div>
	                              <div className="text-sm font-semibold text-slate-900">KI Sprache (Text to Speech)</div>
	                              <div className="text-xs text-slate-600 mt-1">
		                                Text einfügen, Stimme wählen, Audio erzeugen. Danach liegt die KI Sprache direkt als Spur unter dem Video.
	                              </div>
	
	                              <textarea
	                                ref={voiceoverTextareaRef}
	                                value={voiceoverText}
	                                onChange={(e) => setVoiceoverText(e.target.value)}
	                                className="mt-3 w-full min-h-[140px] rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
	                                placeholder="Text für die KI Sprache hier einfügen..."
	                              />

                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <div className="text-xs text-slate-600">Stimme:</div>
                                <Select value={voiceoverVoice} onValueChange={(v) => setVoiceoverVoice(v as any)}>
                                  <SelectTrigger className="w-[150px] bg-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="female">Weiblich</SelectItem>
                                    <SelectItem value="male">Männlich</SelectItem>
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

                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <Button
                                  onClick={startVoiceoverGeneration}
                                  disabled={!selectedFile || isGeneratingVoiceover || !voiceoverText.trim()}
                                  className="bg-orange-500 hover:bg-orange-600"
	                                >
                                  {isGeneratingVoiceover ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  ) : (
                                    <Cloud className="w-4 h-4 mr-2" />
                                  )}
	                                  KI Sprache erzeugen
	                                </Button>
	                                <div className="text-xs text-slate-600">
	                                  Nutzt standardmäßig Qwen3-TTS.
	                                </div>
	                              </div>
	                            </div>

                            <div>
                              <div className="text-sm font-semibold text-slate-900">Status</div>
                              <div className="mt-3 rounded-lg border border-orange-200 bg-white p-3">
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
                                ) : voiceoverInsertedFile ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-green-700">
                                      <Check className="w-4 h-4 flex-shrink-0" />
                                      <span className="text-sm font-medium">Fertig — Audio-Spur wurde eingefügt</span>
                                    </div>
                                    <audio
                                      controls
                                      className="w-full"
                                      src={`/api/session/files/${voiceoverInsertedFile.id}?session=${sessionId}`}
                                    />
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Button
                                        variant="outline"
                                        className="rounded-lg"
                                        onClick={() => setModeRaw('timeline')}
                                      >
                                        In Timeline einfügen
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="rounded-lg text-slate-600"
                                        onClick={() => {
                                          voiceoverImportedJobRef.current = null;
                                          setVoiceoverInsertedFile(null);
                                          setVoiceoverAudioUrl(null);
                                          setVoiceoverJobId(null);
                                          setVoiceoverProgress(0);
                                          setVoiceoverStatus("");
                                        }}
                                      >
                                        Neu generieren
                                      </Button>
                                    </div>
                                  </div>
                                ) : voiceoverAudioUrl ? (
                                  <div className="space-y-3">
                                    <div className="text-sm text-slate-700">
                                      Audio erzeugt. Wird als Audio-Spur übernommen...
                                    </div>
                                    <audio controls className="w-full" src={voiceoverAudioUrl} />
                                    <Button
                                      className="rounded-lg bg-orange-500 hover:bg-orange-600"
                                      onClick={useGeneratedVoiceoverAsTrack}
                                    >
                                      Als Audio-Spur übernehmen
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="text-sm text-slate-600">
                                    Text eingeben und "KI Sprache erzeugen" starten.
                                  </div>
                                )}
                              </div>
                              {voiceoverJobId && (
                                <div className="mt-2 text-xs text-slate-500">
                                  Job: {voiceoverJobId.slice(0, 8)}...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {mode === "subtitles" && (
                        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Untertitel direkt im Videoschnitt</div>
                              <div className="text-xs text-slate-600 mt-1">
                                Untertitel sind Barrierefreiheit: wichtig für gehörlose/schwerhörige Menschen und für alle, die Inhalte ohne Ton nutzen.
                              </div>
                              <div className="mt-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-slate-700">
                                Gute Untertitel erhöhen Verständlichkeit, Auffindbarkeit und Nutzbarkeit in Meetings, Kursen und im Support.
                              </div>
                              <div className="mt-3 text-xs text-slate-600">
                                Zielvideo: <span className="font-medium text-slate-800">{subtitleTargetFile?.name || "Kein Video verfügbar"}</span>
                              </div>

                              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div>
                                  <div className="text-xs text-slate-600 mb-1">Transkription</div>
                                  <Select value={subtitleTranscribeMode} onValueChange={(v) => setSubtitleTranscribeMode(v as "quality" | "fast")}>
                                    <SelectTrigger className="bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="quality">Qualität</SelectItem>
                                      <SelectItem value="fast">Schnell</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-600 mb-1">Audio-Aufbereitung</div>
                                  <Select value={subtitleEnhanceAudio} onValueChange={(v) => setSubtitleEnhanceAudio(v as "off" | "standard" | "strong")}>
                                    <SelectTrigger className="bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="off">Aus</SelectItem>
                                      <SelectItem value="standard">Standard</SelectItem>
                                      <SelectItem value="strong">Stark</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-600 mb-1">Einbettung</div>
                                  <Select value={subtitleType} onValueChange={(v) => setSubtitleType(v as "hardcoded" | "soft")}>
                                    <SelectTrigger className="bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="hardcoded">Hardcoded</SelectItem>
                                      <SelectItem value="soft">Soft</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 space-y-2">
                                <div className="text-xs font-medium text-slate-700">Suchen/Ersetzen</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <Input
                                    value={subtitleFindText}
                                    onChange={(e) => setSubtitleFindText(e.target.value)}
                                    placeholder="Suchen..."
                                  />
                                  <Input
                                    value={subtitleReplaceText}
                                    onChange={(e) => setSubtitleReplaceText(e.target.value)}
                                    placeholder="Ersetzen durch..."
                                  />
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <label className="text-xs text-slate-600 inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={subtitleReplaceCaseSensitive}
                                      onChange={(e) => setSubtitleReplaceCaseSensitive(e.target.checked)}
                                    />
                                    Groß-/Kleinschreibung beachten
                                  </label>
                                  <Button variant="outline" onClick={handleSubtitleFindReplace}>
                                    Anwenden
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-slate-700">Custom Vocabulary</div>
                                  <input
                                    ref={subtitleVocabularyInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={handleSubtitleVocabularyUpload}
                                    className="hidden"
                                  />
                                  <Button
                                    variant="outline"
                                    onClick={() => subtitleVocabularyInputRef.current?.click()}
                                  >
                                    CSV laden
                                  </Button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                                  <Input
                                    value={subtitleVocabularyWrong}
                                    onChange={(e) => setSubtitleVocabularyWrong(e.target.value)}
                                    placeholder="falsch erkannt"
                                  />
                                  <Input
                                    value={subtitleVocabularyCorrect}
                                    onChange={(e) => setSubtitleVocabularyCorrect(e.target.value)}
                                    placeholder="korrekt"
                                  />
                                  <Button onClick={addSubtitleVocabularyEntry}>
                                    Hinzufügen
                                  </Button>
                                </div>
                                {subtitleVocabulary.length > 0 && (
                                  <div className="max-h-24 overflow-auto rounded border border-slate-200 p-2 text-xs space-y-1">
                                    {subtitleVocabulary.map((entry, idx) => (
                                      <div key={`${entry.wrong}-${idx}`} className="flex items-center justify-between gap-2">
                                        <span className="text-slate-700 truncate">{`${entry.wrong} -> ${entry.correct}`}</span>
                                        <button
                                          type="button"
                                          className="text-slate-400 hover:text-red-600"
                                          onClick={() => setSubtitleVocabulary((prev) => prev.filter((_, i) => i !== idx))}
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {subtitleSrt.trim() && subtitleReadabilitySummary.total > 0 && (
                                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <div>
                                      <div className="text-xs font-semibold text-amber-900">Lesbarkeits-Warnung</div>
                                      <div className="text-xs text-amber-800 mt-1">
                                        {subtitleReadabilitySummary.total} Segmente sind zu lang oder schlecht umbrechbar.
                                        {subtitleReadabilitySummary.lineTooLong > 0 && ` Zeilen zu lang: ${subtitleReadabilitySummary.lineTooLong}.`}
                                        {subtitleReadabilitySummary.tooManyLines > 0 && ` Zu viele Zeilen: ${subtitleReadabilitySummary.tooManyLines}.`}
                                        {subtitleReadabilitySummary.tooManyChars > 0 && ` Zu viele Zeichen: ${subtitleReadabilitySummary.tooManyChars}.`}
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                                      onClick={applyAllSubtitleReadabilitySuggestions}
                                    >
                                      Alle Vorschläge anwenden
                                    </Button>
                                  </div>
                                  <div className="space-y-2 max-h-44 overflow-auto">
                                    {subtitleReadabilityIssues.slice(0, 6).map((issue) => (
                                      <div key={`${issue.segmentPosition}-${issue.segmentIndex}`} className="rounded border border-amber-200 bg-white p-2">
                                        <div className="text-[11px] text-amber-900">
                                          Segment {issue.segmentIndex}: {issue.maxLineLength} Zeichen max. Zeile · {issue.lineCount} Zeilen · {issue.charCount} Zeichen gesamt
                                        </div>
                                        <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 font-mono whitespace-pre-wrap">
                                          {issue.suggestion || "(kein Vorschlag)"}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                                          {issue.suggestionOverflow && (
                                            <span className="text-[11px] text-red-700">
                                              Hinweis: Segment bleibt vermutlich zu lang, bitte manuell kürzen.
                                            </span>
                                          )}
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => applySubtitleReadabilitySuggestion(issue.segmentPosition)}
                                          >
                                            Korrektur übernehmen
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                    {subtitleReadabilityIssues.length > 6 && (
                                      <div className="text-[11px] text-amber-900">
                                        + {subtitleReadabilityIssues.length - 6} weitere Segmente mit Warnung
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <textarea
                                value={subtitleSrt}
                                onChange={(e) => setSubtitleSrt(e.target.value)}
                                className="mt-3 w-full min-h-[220px] rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300"
                                placeholder="Untertitel im SRT-Format erscheinen hier..."
                              />
                            </div>

                            <div>
                              <div className="text-sm font-semibold text-slate-900">Status</div>
                              <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 space-y-3">
                                <div>
                                  <div className="text-xs font-medium text-slate-700 mb-1">Transkription</div>
                                  {(subtitleTranscriptionJob.isLoading || subtitleTranscriptionJob.job?.status === "active" || subtitleTranscriptionJob.job?.status === "pending") ? (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-xs text-slate-700">
                                        <span>{subtitleTranscriptionJob.job?.progress.stage || "Untertitel werden erstellt..."}</span>
                                        <span className="font-medium tabular-nums">{subtitleTranscriptionJob.job?.progress.percent ?? 0}%</span>
                                      </div>
                                      <Progress value={subtitleTranscriptionJob.job?.progress.percent ?? 0} className="h-2" />
                                    </div>
                                  ) : subtitleSrt.trim() ? (
                                    <div className="text-sm text-green-700 flex items-center gap-2">
                                      <Check className="w-4 h-4 flex-shrink-0" />
                                      Untertitel bereit ({subtitleSrt.length.toLocaleString("de-DE")} Zeichen)
                                    </div>
                                  ) : (
                                    <div className="text-sm text-slate-600">
                                      Noch keine Untertitel erstellt.
                                    </div>
                                  )}
                                </div>

                                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
                                  Audio-Aufbereitung: <span className="font-medium text-slate-700">{subtitleEnhanceAudio === "off" ? "Aus" : subtitleEnhanceAudio === "strong" ? "Stark" : "Standard"}</span>
                                  {subtitleVocabulary.length > 0 && (
                                    <span> · Vocabulary: <span className="font-medium text-slate-700">{subtitleVocabulary.length} Regeln</span></span>
                                  )}
                                </div>

                                <div>
                                  <div className="text-xs font-medium text-slate-700 mb-1">Einbettung</div>
                                  {(subtitleEmbedJob?.status === "pending" || subtitleEmbedJob?.status === "active") ? (
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-xs text-slate-700">
                                        <span>{subtitleEmbedJob.progress.stage || "Video wird gerendert..."}</span>
                                        <span className="font-medium tabular-nums">{subtitleEmbedJob.progress.percent ?? 0}%</span>
                                      </div>
                                      <Progress value={subtitleEmbedJob.progress.percent ?? 0} className="h-2" />
                                    </div>
                                  ) : subtitleEmbedJob?.status === "completed" ? (
                                    <div className="text-sm text-green-700 flex items-center gap-2">
                                      <Check className="w-4 h-4 flex-shrink-0" />
                                      Eingebettet und heruntergeladen ({subtitleDownloadName})
                                    </div>
                                  ) : subtitleEmbedJob?.status === "failed" ? (
                                    <div className="text-sm text-red-700">
                                      {translateError(subtitleEmbedJob.error || "Einbettung fehlgeschlagen")}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-slate-600">
                                      Noch kein Einbettungsjob gestartet.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Clip list for cut mode */}
                      {mode === 'cut' && clips.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm font-medium text-slate-700">Clips (klicken zum aktivieren/deaktivieren):</p>
                          <div className="flex flex-wrap gap-2">
                            {clips.map((clip, i) => (
                              <button
                                key={clip.id}
                                onClick={() => toggleClipSelection(clip.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                  clip.selected
                                    ? 'bg-green-100 text-green-700 border border-green-300'
                                    : 'bg-red-100 text-red-700 border border-red-300 line-through'
                                }`}
                              >
                                {clip.selected
                                  ? <Check className="w-3.5 h-3.5 flex-shrink-0" />
                                  : <X className="w-3.5 h-3.5 flex-shrink-0" />
                                }
                                Clip {i + 1}: {formatTime(clip.start)} – {formatTime(clip.end)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : mode === 'merge' ? (
                  <div className="p-12 text-center">
                    <Merge className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">Videos zusammenfügen</h3>
                    <p className="text-slate-500 mb-4">
                      Wähle unten mindestens 2 Videos aus (Reihenfolge = Klickreihenfolge)
                    </p>
                    {mergeSelection.length >= 2 ? (
                      isProcessing ? (
                        <div className="inline-block min-w-[180px] space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>{exportProgress.stage}</span>
                            <span className="font-medium tabular-nums">{exportProgress.percent}%</span>
                          </div>
                          <Progress value={exportProgress.percent} className="h-2" />
                        </div>
                      ) : (
                        <Button
                          onClick={handleMerge}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Merge className="w-4 h-4 mr-2" />
                          {mergeSelection.length} Videos zusammenfügen
                        </Button>
                      )
                    ) : (
                      <Button variant="outline" onClick={scrollToFiles} className="mt-2">
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Dateien anzeigen
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center cursor-pointer" onClick={scrollToFiles}>
                    <Video className="w-16 h-16 mx-auto mb-4 text-purple-300" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">Kein Video ausgewählt</h3>
                    <p className="text-slate-500 mb-4">
                      Klicke hier oder wähle unten ein Video aus
                    </p>
                    <Button variant="outline">
                      <ChevronDown className="w-4 h-4 mr-2" />
                      Dateien anzeigen
                    </Button>
                  </div>
                )}
              </div>

              {/* Timeline Editor - Shown when in timeline mode */}
              {mode === 'timeline' && (
                <div className="mt-4">
                  <TimelineEditor
                    files={files}
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    onSeek={seekTo}
                    onPlayPause={togglePlay}
                    onExtractFreezeFrame={handleFreezeFrame}
                    onRenderTimeline={handleRenderTimeline}
                    isProcessing={isProcessing}
                    sessionId={sessionId}
                    autoInsertAudioFileId={pendingTimelineInsertAudioFileId}
                    onAutoInsertAudioDone={() => setPendingTimelineInsertAudioFileId(null)}
                  />
                </div>
              )}

          </div>

          {/* Files Section - Below Editor */}
          <FileList
            ref={fileListRef}
            files={files}
            isLoading={isLoading}
            selectedFile={selectedFile}
            mode={mode}
            mergeSelection={mergeSelection}
            sessionId={sessionId}
            isDragOver={isDragOver}
            onDragOverChange={setIsDragOver}
            onDrop={handleDrop}
            onSelectFile={handleSelectFile}
            onToggleMergeSelection={toggleMergeSelection}
            onDeleteFile={deleteFile}
            onVideoUpload={handleFileUpload}
            onAudioUpload={handleAudioUpload}
            isRecordingAudio={isRecordingAudio}
            audioRecordingTime={audioRecordingTime}
            onStartAudioRecording={startAudioRecording}
            onStopAudioRecording={stopAudioRecording}
            formatFileSize={formatFileSize}
            formatDuration={formatDuration}
            highlightedFileId={highlightedFileId}
          />

          <SessionHistoryPanel
            sessions={recentSessions}
            currentSessionId={sessionId}
            isLoading={recentSessionsLoading}
            openingSessionId={openingSessionId}
            onRefresh={() => {
              void loadRecentSessions();
            }}
            onOpenSession={(targetSessionId) => {
              void handleOpenRecentSession(targetSessionId);
            }}
            formatFileSize={formatFileSize}
          />
                </div>

                {/* AI Chat Panel */}
                {chatOpen && (
                  <div className="sticky top-24 h-[calc(100vh-8rem)]">
                    <AiChatPanel
                      files={files}
                      selectedFile={selectedFile}
                      duration={duration}
                      currentTime={currentTime}
                      mode={mode}
                      onSeek={(t) => seekTo(t)}
                      onTrim={(s, e) => {
                        setMode('trim');
                        setTrimStart(s);
                        setTrimEnd(e);
                      }}
                      onCut={(s, e) => {
                        setMode('cut');
                        const id = `clip-${Date.now()}`;
                        setClips((prev) => [...prev, { id, start: s, end: e, selected: true }]);
                      }}
                      onRemoveFillers={() => {
                        toast({ title: "Füllwörter", description: "Nutze VoxCut für automatische Füllwort-Entfernung." });
                      }}
                      onSetMode={setMode}
                      onFreezeFrame={(fileId, time) => handleFreezeFrame(fileId, time)}
                    />
                  </div>
                )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

    </PageLayout>
  );
}
