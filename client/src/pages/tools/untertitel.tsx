import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useJob, translateError } from "@/hooks/use-job";
import { useSession, type SessionFile } from "@/hooks/use-session";
import { QueuePositionDisplay, useJobPosition } from "@/components/QueueStatus";
import {
  Upload, Download, Video, FileText, Loader2,
  CheckCircle2, Play, Pause, Type, ChevronRight, X, AlertCircle,
  Table, ChevronDown, Monitor, Sparkles, Zap, Scissors,
  Package, FolderOpen, Mic, FileAudio, Trash2, Plus
} from "lucide-react";
import { ScreenRecorder, type ChunkInfo } from "@/components/ScreenRecorder";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { useAgencyMode } from "@/lib/agency-mode";
import { segmentsToTtml, segmentsToVtt } from "@/lib/subtitles/formats";
import {
  formatMarkerTime,
  parseSrt,
  secondsToSrtTime,
  segmentsToSrt,
  type SrtSegment,
} from "@/lib/subtitles/srt";
import { wrapSubtitleText } from "@/lib/subtitles/wrap";
import { redactText } from "@/lib/subtitles/redact";
import {
  applyVocabularyCorrections,
  applyVocabularyToSrtContent,
  parseVocabularyCsv,
  type VocabularyEntry,
} from "@/lib/subtitles/vocabulary";
import { replaceAllWithCount } from "@/lib/text/replace";

// Chapter type for video splitting
interface Chapter {
  start: string;  // SRT format: "00:10:30,500"
  end: string;
  title: string;
  confidence?: number;
}

interface ChapterDownloadFile {
  name: string;
  size: number;
  type: "video" | "subtitle";
  url: string;
}

export default function UntertitelTool() {
  const { toast } = useToast();
  const { user, usage, isAuthenticated, openUpgradeModal, refreshUser } = useAuth();
  const { isAgencyMode } = useAgencyMode();
  const { files: sessionFiles, sessionId, formatFileSize, formatDuration, refreshSession, getFileUrl, uploadFile } = useSession();
  // VoxDrop runs without Workspaces for this tool. Keep storage scope fixed to the user.
  const storageTarget = { scope: "user" as const };
  const setStorageTarget = () => {};

  // Input mode: upload, record, session, or voiceover
  const [inputMode, setInputMode] = useState<"upload" | "record" | "session" | "voiceover">("upload");
  const hasAutoSwitchedToSessionRef = useRef(false);

  // Step 1: Transcription state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [selectedSessionFile, setSelectedSessionFile] = useState<SessionFile | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeMode, setTranscribeMode] = useState<"quality" | "fast">("quality");
  const [transcriptionResult, setTranscriptionResult] = useState<{
    text: string;
    srt: string;
    duration: number;
  } | null>(null);
  const [whisperMode, setWhisperMode] = useState<"local" | "openai" | null>(null);
  const [cloudConsent, setCloudConsent] = useState(false);
  const requiresCloudConsent = whisperMode === "openai";

  // SRT Editor state
  const [srtSegments, setSrtSegments] = useState<SrtSegment[]>([]);
  const [playingSegment, setPlayingSegment] = useState<number | null>(null);
  const [subtitlesReviewed, setSubtitlesReviewed] = useState(false);
  const [segmentSearch, setSegmentSearch] = useState("");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false);
  const [showIssueOnly, setShowIssueOnly] = useState(false);
  const [visibleSegmentCount, setVisibleSegmentCount] = useState(200);

  // Step 2: Video embedding state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [subtitleType, setSubtitleType] = useState<"hardcoded" | "soft">("hardcoded");
  const [subtitleTypeManuallySet, setSubtitleTypeManuallySet] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState(0);
  const [showEmbedOptions, setShowEmbedOptions] = useState(false);
  const [showStyleAdvanced, setShowStyleAdvanced] = useState(false);
  const [enhanceAudio, setEnhanceAudio] = useState(true);

  // Custom font state
  const [fontFile, setFontFile] = useState<File | null>(null);

  // Subtitle styling state
  const [subtitleStyle, setSubtitleStyle] = useState({
    fontSize: 24,
    fontColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 80,
    useRecommended: true, // Start with accessibility-optimized settings
  });

  // Accessibility-optimized preset
  const accessibilityPreset = {
    fontSize: 28,
    fontColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 85,
    useRecommended: true,
  };

  const toggleRecommendedStyle = () => {
    setSubtitleStyle((prev) => (
      prev.useRecommended
        ? { ...prev, useRecommended: false }
        : accessibilityPreset
    ));
  };

  // Vocabulary state
  const [vocabularyFile, setVocabularyFile] = useState<File | null>(null);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const vocabularyPrompt = useMemo(() => {
    if (vocabulary.length === 0) return "";
    return vocabulary.map((entry) => `${entry.wrong} -> ${entry.correct}`).join("; ").slice(0, 1800);
  }, [vocabulary]);

  // Manual chapter marking state
  const [chapterBreaks, setChapterBreaks] = useState<number[]>([]); // Segment indices where chapters end
  const [chapterTitles, setChapterTitles] = useState<Record<number, string>>({}); // Titles for each chapter
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null); // For hover effect
  const [workflow, setWorkflow] = useState<"standard" | "solution-demo">("standard");
  const [chapterMarkers, setChapterMarkers] = useState<Array<{ timeSeconds: number; title: string }>>([]);
  const [chapterMarkersApplied, setChapterMarkersApplied] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isSuggestingChapters, setIsSuggestingChapters] = useState(false);
  const [isTextCutting, setIsTextCutting] = useState(false);
  const [textCutResultFileId, setTextCutResultFileId] = useState<string | null>(null);
  const [chapterDownloadFiles, setChapterDownloadFiles] = useState<ChapterDownloadFile[]>([]);
  const [isLoadingChapterFiles, setIsLoadingChapterFiles] = useState(false);

  const hasVideoEditAccess = user?.subscription === 'pro' || user?.subscription === 'premium' || user?.subscription === 'team';

  // Email notification state
  const [notifyEmail, setNotifyEmail] = useState<string>("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [embedNotifyEmail, setEmbedNotifyEmail] = useState<string>("");
  const [showEmbedEmailInput, setShowEmbedEmailInput] = useState(false);
  const [embedCompletedJobId, setEmbedCompletedJobId] = useState<string | null>(null);
  const [embedDownloadName, setEmbedDownloadName] = useState<string>("video_untertitel.mp4");

  // Voice-Over state
  const [voiceoverText, setVoiceoverText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<"male" | "female">("female");
  const [pronunciationRules, setPronunciationRules] = useState<Array<{ original: string; spoken: string }>>([]);
  const [newRuleOriginal, setNewRuleOriginal] = useState("");
  const [newRuleSpoken, setNewRuleSpoken] = useState("");
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceoverProgress, setVoiceoverProgress] = useState(0);
  const [voiceoverStatus, setVoiceoverStatus] = useState("");
  const [voiceoverAudioUrl, setVoiceoverAudioUrl] = useState<string | null>(null);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);
  const voiceoverPollTimeoutRef = useRef<number | null>(null);
  const connectionToastJobRef = useRef<string | null>(null);
  const requestedSessionFileIdRef = useRef<string | null>(null);
  const hasAppliedRequestedSessionFileRef = useRef(false);

  const SOFT_RECOMMENDED_SIZE_MB = 120;
  const SOFT_RECOMMENDED_DURATION_SECONDS = 10 * 60;
  const SOFT_RECOMMENDED_SIZE_BYTES = SOFT_RECOMMENDED_SIZE_MB * 1024 * 1024;
  const DIRECT_EMBED_UPLOAD_LIMIT_MB = 50;
  const DIRECT_EMBED_UPLOAD_LIMIT_BYTES = DIRECT_EMBED_UPLOAD_LIMIT_MB * 1024 * 1024;

  const selectedSessionVideoFile = selectedSessionFile?.mimeType?.startsWith("video/")
    ? selectedSessionFile
    : null;
  const embedVideoSizeBytes = videoFile?.size || selectedSessionVideoFile?.size || 0;
  const embedVideoDurationSeconds =
    selectedSessionVideoFile?.metadata?.duration ||
    (audioFile?.type.startsWith("video/") ? (transcriptionResult?.duration || 0) : 0);
  const longVideoDetected =
    embedVideoSizeBytes >= SOFT_RECOMMENDED_SIZE_BYTES ||
    embedVideoDurationSeconds >= SOFT_RECOMMENDED_DURATION_SECONDS;
  const canExportChaptersFromVideo = !!(
    (audioFile && audioFile.type.startsWith("video/")) ||
    selectedSessionVideoFile
  );

  const handleSubtitleTypeSelection = (next: "hardcoded" | "soft") => {
    setSubtitleType(next);
    setSubtitleTypeManuallySet(true);
  };

  useEffect(() => {
    if (!showAdvancedOptions && (inputMode === "session" || inputMode === "voiceover")) {
      setInputMode("upload");
    }
  }, [showAdvancedOptions, inputMode]);

  useEffect(() => {
    if (subtitleTypeManuallySet) return;
    if (!longVideoDetected) return;
    if (subtitleType === "soft") return;
    setSubtitleType("soft");
  }, [subtitleTypeManuallySet, longVideoDetected, subtitleType]);

  useEffect(() => {
    // "Solution Demo" is an advanced workflow. Ensure advanced options are visible.
    if (workflow === "solution-demo" && !showAdvancedOptions) {
      setShowAdvancedOptions(true);
    }
  }, [workflow, showAdvancedOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedFileId = params.get("fileId");
    if (!requestedFileId) return;
    requestedSessionFileIdRef.current = requestedFileId;
    setShowAdvancedOptions(true);
  }, []);

  useEffect(() => {
    if (hasAutoSwitchedToSessionRef.current) return;
    if (!showAdvancedOptions) return;
    if (isTranscribing || !!transcriptionResult) return;
    if (inputMode !== "upload") return;
    if (sessionFiles.length === 0) return;
    if (audioFile || selectedSessionFile) return;

    setInputMode("session");
    hasAutoSwitchedToSessionRef.current = true;
  }, [showAdvancedOptions, isTranscribing, transcriptionResult, inputMode, sessionFiles.length, audioFile, selectedSessionFile]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const mode = data?.whisper?.mode === "openai" ? "openai" : "local";
        setWhisperMode(mode);
      })
      .catch(() => {
        if (cancelled) return;
        setWhisperMode(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Transcription job hook (async)
  const transcriptionJob = useJob({
    onComplete: async (job) => {
      // Fetch the transcription result
      try {
        const fetchResultWithRetry = async () => {
          let lastError: unknown;
          const maxAttempts = 4;

          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              const response = await fetch(`/api/jobs/${job.id}/transcription`, {
                credentials: 'include',
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ergebnis konnte nicht geladen werden');
              }

              return await response.json();
            } catch (err) {
              lastError = err;
              if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                continue;
              }
            }
          }

          throw lastError instanceof Error ? lastError : new Error('Ergebnis konnte nicht geladen werden');
        };

        const data = await fetchResultWithRetry();

        // Apply vocabulary corrections if vocabulary is loaded
        let correctedText = data.text;
        let correctedSrt = data.srt;

        if (vocabulary.length > 0) {
          correctedText = applyVocabularyCorrections(data.text, vocabulary);
          correctedSrt = applyVocabularyToSrtContent(data.srt, vocabulary);
        }

        setTranscriptionResult({
          text: correctedText,
          srt: correctedSrt,
          duration: data.duration,
        });

        // Refresh usage data from server
        await refreshUser();

        toast({
          title: "Transkription abgeschlossen",
          description: vocabulary.length > 0
            ? `${Math.round(data.duration)}s · ${vocabulary.length} Korrekturen angewendet`
            : `Dauer: ${Math.round(data.duration)} Sekunden`,
        });
      } catch (err: any) {
        toast({
          title: "Fehler",
          description: err?.message?.includes("Failed to fetch")
            ? "Netzwerkfehler. Der Job ist fertig, bitte kurz neu laden."
            : err.message || "Ergebnis konnte nicht geladen werden",
          variant: "destructive",
        });
      }
      connectionToastJobRef.current = null;
      setIsTranscribing(false);
    },
    onError: (error) => {
      toast({
        title: "Transkription fehlgeschlagen",
        description: translateError(error),
        variant: "destructive",
      });
      connectionToastJobRef.current = null;
      setIsTranscribing(false);
    },
    onProgress: (progress) => {
      // Optional: Update UI with progress
      console.log('[Transcription] Progress:', progress);
    },
    onConnectionIssue: (_message, jobId) => {
      if (!jobId || connectionToastJobRef.current === jobId) return;
      connectionToastJobRef.current = jobId;
      toast({
        title: "Verbindung unterbrochen",
        description: "Die Transkription läuft weiter. Wir verbinden uns neu.",
      });
    },
  });

  const {
    position: transcriptionPosition,
    estimatedWait: transcriptionWait,
    isProcessing: transcriptionProcessing,
  } = useJobPosition("transcription", transcriptionJob.job?.id ?? null, isAuthenticated);

  // Chapter splitting job hook
  const chapterJob = useJob({
    onComplete: () => {
      toast({
        title: "Kapitel erstellt",
        description: "Kapiteldateien sind fertig zum Download",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler bei Kapitelaufteilung",
        description: translateError(error),
        variant: "destructive",
      });
    },
  });

  const {
    job: embedJob,
    submitJob: submitEmbedJob,
    downloadResult: downloadEmbedResult,
    reset: resetEmbedJob,
  } = useJob({
    onComplete: async (job) => {
      const name = videoFile?.name || selectedSessionFile?.name;
      const baseName = name ? name.replace(/\.[^/.]+$/, "") : "video";
      const downloadName = `${baseName}_untertitel.mp4`;
      setEmbedCompletedJobId(job.id);
      setEmbedDownloadName(downloadName);
      const blob = await downloadEmbedResult(downloadName);
      setIsEmbedding(false);
      if (blob) {
        toast({
          title: "Fertig!",
          description: "Video mit Untertiteln heruntergeladen",
        });
      } else {
        toast({
          title: "Fertig",
          description: "Auto-Download blockiert. Bitte auf \"Finales Video herunterladen\" klicken.",
        });
      }
    },
    onError: (error) => {
      if (error === 'async_unavailable') {
        return;
      }
      toast({
        title: "Fehler",
        description: translateError(error),
        variant: "destructive",
      });
      setIsEmbedding(false);
    },
  });

  const {
    position: embedPosition,
    estimatedWait: embedWait,
    isProcessing: embedProcessing,
  } = useJobPosition("subtitle-embed", embedJob?.id ?? null, isAuthenticated);

  const downloadCompletedEmbedResult = async () => {
    const targetJobId = embedCompletedJobId || embedJob?.id;
    if (!targetJobId) return;

    try {
      const a = document.createElement("a");
      a.href = `/api/jobs/${targetJobId}/result`;
      a.download = embedDownloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({
        title: "Download gestartet",
        description: "Das finale Video wird heruntergeladen.",
      });
    } catch (error: any) {
      toast({
        title: "Download fehlgeschlagen",
        description: translateError(error?.message || "Das finale Video konnte nicht heruntergeladen werden."),
        variant: "destructive",
      });
    }
  };

  const segmentIssues = useMemo(() => {
    const issues = new Map<number, {
      tooFast: boolean;
      tooLong: boolean;
      tooShort: boolean;
      lineTooLong: boolean;
      tooManyLines: boolean;
    }>();
    for (const seg of srtSegments) {
      const duration = Math.max(0.01, seg.endSeconds - seg.startSeconds);
      const charCount = seg.text.replace(/\s+/g, "").length;
      const cps = charCount / duration;
      const lines = seg.text.split("\n");
      const lineCount = lines.length;
      const maxLineLen = lines.reduce((m, l) => Math.max(m, l.trim().length), 0);
      const tooFast = cps > 17;
      const tooManyLines = lineCount > 2;
      const lineTooLong = maxLineLen > 42;
      const tooLong = charCount > 90 || tooManyLines || lineTooLong;
      const tooShort = duration < 0.8;
      issues.set(seg.index, { tooFast, tooLong, tooShort, lineTooLong, tooManyLines });
    }
    return issues;
  }, [srtSegments]);

  const issueSummary = useMemo(() => {
    let fast = 0;
    let long = 0;
    let short = 0;
    let lineLen = 0;
    let lines = 0;
    for (const issue of segmentIssues.values()) {
      if (issue.tooFast) fast++;
      if (issue.tooLong) long++;
      if (issue.tooShort) short++;
      if (issue.lineTooLong) lineLen++;
      if (issue.tooManyLines) lines++;
    }
    return { fast, long, short, lineLen, lines };
  }, [segmentIssues]);

  const applyAutoFormat = () => {
    let changed = 0;
    let overflow = 0;
    setSrtSegments((prev) => {
      const next = prev.map((seg) => {
        const wrapped = wrapSubtitleText(seg.text, { maxLineLength: 42, maxLines: 2 });
        if (wrapped.changed) changed++;
        if (wrapped.overflow) overflow++;
        return wrapped.changed ? { ...seg, text: wrapped.text } : seg;
      });
      return next;
    });
    setSubtitlesReviewed(false);
    toast({
      title: "Untertitel formatiert",
      description: overflow > 0
        ? `${changed} Segmente angepasst · ${overflow} Segmente bleiben zu lang (bitte manuell prüfen)`
        : `${changed} Segmente angepasst`,
    });
  };

  const applyRedaction = () => {
    let totalMatches = 0;
    let changed = 0;
    setSrtSegments((prev) => {
      const next = prev.map((seg) => {
        const red = redactText(seg.text);
        totalMatches += red.matches.length;
        if (red.changed) changed++;
        return red.changed ? { ...seg, text: red.text } : seg;
      });
      return next;
    });
    setSubtitlesReviewed(false);
    toast({
      title: "Anonymisierung angewendet",
      description: totalMatches > 0
        ? `${totalMatches} Treffer in ${changed} Segmenten ersetzt`
        : "Keine Treffer gefunden",
    });
  };

  const filteredSegments = useMemo(() => {
    const query = segmentSearch.trim().toLowerCase();
    let base = srtSegments;
    if (query) {
      base = base.filter(seg => seg.text.toLowerCase().includes(query));
    }
    if (showIssueOnly) {
      base = base.filter(seg => {
        const issue = segmentIssues.get(seg.index);
        return issue?.tooFast || issue?.tooLong || issue?.tooShort;
      });
    }
    return base;
  }, [segmentSearch, srtSegments, showIssueOnly, segmentIssues]);

  const visibleSegments = useMemo(() => {
    return filteredSegments.slice(0, visibleSegmentCount);
  }, [filteredSegments, visibleSegmentCount]);

  useEffect(() => {
    setVisibleSegmentCount(200);
  }, [segmentSearch, showIssueOnly]);

  // Usage tracking from auth context
  const isSubscribed = user?.subscription !== 'free';
  const usedTranscriptions = usage?.transcriptions || 0;
  const limitTranscriptions = usage?.limits?.transcriptions || 5;
  const canProcess = isSubscribed || limitTranscriptions === -1 || usedTranscriptions < limitTranscriptions;

  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const vocabularyInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const timeUpdateHandlerRef = useRef<((this: HTMLAudioElement, ev: Event) => any) | null>(null);

  // Parse SRT when transcription result changes
  useEffect(() => {
    if (transcriptionResult?.srt) {
      const segments = parseSrt(transcriptionResult.srt);
      setSrtSegments(segments);
      setVisibleSegmentCount(200);
      setSegmentSearch("");
      setShowIssueOnly(false);
      setSubtitlesReviewed(false);
      setChapterMarkersApplied(false);
    }
  }, [transcriptionResult]);

  // Create audio URL when file is selected (for playback preview)
  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }

    // Skip creating URL for video files to avoid WebKit blob errors
    if (audioFile.type.startsWith('video/')) {
      setAudioUrl(null);
      return;
    }

    try {
      const url = URL.createObjectURL(audioFile);
      setAudioUrl(url);
      return () => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // Ignore revoke errors
        }
        setAudioUrl(null);
      };
    } catch (e) {
      console.error('Error creating audio URL:', e);
      setAudioUrl(null);
    }
  }, [audioFile]);

  // Preview session audio files without downloading them into memory.
  useEffect(() => {
    if (inputMode !== "session") return;
    if (!selectedSessionFile || !sessionId) {
      setAudioUrl(null);
      return;
    }
    if (!selectedSessionFile.mimeType?.startsWith("audio/")) {
      setAudioUrl(null);
      return;
    }
    setAudioUrl(getFileUrl(selectedSessionFile.id));
  }, [getFileUrl, inputMode, selectedSessionFile, sessionId]);

  useEffect(() => {
    if (user?.email) {
      if (!notifyEmail) {
        setNotifyEmail(user.email);
      }
      if (!embedNotifyEmail) {
        setEmbedNotifyEmail(user.email);
      }
    }
  }, [user?.email]);

  useEffect(() => {
    if (workflow === "solution-demo") {
      setInputMode("record");
    }
  }, [workflow]);

  useEffect(() => {
    if (inputMode !== "session" && selectedSessionFile) {
      setSelectedSessionFile(null);
    }
  }, [inputMode, selectedSessionFile]);

  useEffect(() => {
    if (chapterMarkersApplied) return;
    if (srtSegments.length === 0 || chapterMarkers.length === 0) return;

    const sortedMarkers = [...chapterMarkers].sort((a, b) => a.timeSeconds - b.timeSeconds);
    const lastSegmentIndex = srtSegments[srtSegments.length - 1]?.index;
    const breaks: number[] = [];
    const titles: Record<number, string> = {};

    for (const marker of sortedMarkers) {
      const segment = srtSegments.find(seg => seg.endSeconds >= marker.timeSeconds) || srtSegments[srtSegments.length - 1];
      if (!segment) continue;
      if (segment.index !== lastSegmentIndex && !breaks.includes(segment.index)) {
        breaks.push(segment.index);
      }
      if (marker.title?.trim()) {
        titles[segment.index] = marker.title.trim();
      }
    }

    if (breaks.length > 0) {
      setChapterBreaks(breaks.sort((a, b) => a - b));
      setChapterTitles(prev => ({ ...prev, ...titles }));
    }
    setChapterMarkersApplied(true);
  }, [chapterMarkers, srtSegments, chapterMarkersApplied]);

  useEffect(() => {
    const requestedFileId = requestedSessionFileIdRef.current;
    if (!requestedFileId || hasAppliedRequestedSessionFileRef.current) return;
    if (!showAdvancedOptions) return;
    if (sessionFiles.length === 0) return;

    const requestedFile = sessionFiles.find((file) => file.id === requestedFileId);
    if (!requestedFile) return;

    hasAppliedRequestedSessionFileRef.current = true;
    setInputMode("session");
    setSelectedSessionFile(requestedFile);
    setSubtitleTypeManuallySet(false);
    setAudioFile(null);
    setVideoFile(null);
    setSrtFile(null);
    setFontFile(null);
    setTranscriptionResult(null);
    setSrtSegments([]);
    setSubtitlesReviewed(false);
    setChapterMarkers([]);
    setChapterBreaks([]);
    setChapterTitles({});
    setChapterMarkersApplied(false);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("fileId");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    toast({
      title: "Session-Datei übernommen",
      description: requestedFile.name,
    });
  }, [showAdvancedOptions, sessionFiles, toast]);

  // Handle audio file selection
  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setSelectedSessionFile(null);
      setTranscriptionResult(null);
      setSrtSegments([]);
      setSubtitlesReviewed(false);
      setChapterMarkers([]);
      setChapterBreaks([]);
      setChapterTitles({});
      setChapterMarkersApplied(false);
      setSubtitleTypeManuallySet(false);
    }
  };

  // Handle recording complete
  const handleRecordingComplete = (file: File) => {
    setAudioFile(file);
    setSelectedSessionFile(null);
    setTranscriptionResult(null);
    setSrtSegments([]);
    setSubtitlesReviewed(false);
    setSubtitleTypeManuallySet(false);
    setInputMode("upload"); // Switch back to show the file
    toast({
      title: "Aufnahme bereit",
      description: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    });
  };

  // Handle video for direct subtitle embedding (skip transcription)
  const handleVideoForSubtitles = (file: File) => {
    setVideoFile(file);
    setSelectedSessionFile(null);
    setSubtitleTypeManuallySet(false);
    setActiveStep(2);
    setInputMode("upload"); // Reset for next time
    setSubtitlesReviewed(false);
    toast({
      title: "Video bereit für Untertitel",
      description: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    });
  };

  const handleChapterMark = (seconds: number) => {
    setChapterMarkers((prev) => {
      const nextIndex = prev.length + 1;
      return [...prev, { timeSeconds: seconds, title: `Kapitel ${nextIndex}` }];
    });
    setChapterMarkersApplied(false);
  };

  // Handle auto-chunk upload during recording
  const handleChunkUploaded = (chunk: ChunkInfo) => {
    console.log(`[Untertitel] Chunk uploaded: ${chunk.chunkIndex} (${chunk.sizeMB.toFixed(1)}MB)`);
  };

  const updateChapterMarkerTitle = (index: number, title: string) => {
    setChapterMarkers((prev) =>
      prev.map((marker, i) => (i === index ? { ...marker, title } : marker))
    );
    setChapterMarkersApplied(false);
  };

  const removeChapterMarker = (index: number) => {
    setChapterMarkers((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setChapterBreaks([]);
        setChapterTitles({});
      }
      return next;
    });
    setChapterMarkersApplied(false);
  };

  // Handle vocabulary CSV upload
  const handleVocabularySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVocabularyFile(file);
      try {
        const data = await file.arrayBuffer();
        const entries = parseVocabularyCsv(data);
        setVocabulary(entries);
        toast({
          title: "Vokabular geladen",
          description: `${entries.length} Korrekturregeln importiert`,
        });
      } catch (error) {
        toast({
          title: "Fehler beim Laden",
          description: "CSV-Datei konnte nicht gelesen werden",
          variant: "destructive",
        });
        setVocabularyFile(null);
        setVocabulary([]);
      }
    }
  };

  // Handle transcription (async job-based)
  const handleTranscribe = async () => {
    const sessionSelected = inputMode === "session" && !!selectedSessionFile;
    if (!audioFile && !sessionSelected) return;
    if (sessionSelected && !sessionId) {
      toast({
        title: "Session nicht verfügbar",
        description: "Bitte Seite neu laden und erneut versuchen.",
        variant: "destructive",
      });
      return;
    }

    // Check if user is authenticated
    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um Videos zu transkribieren.",
        variant: "destructive",
      });
      return;
    }

    // Check usage limit
    if (!canProcess) {
      openUpgradeModal('transcriptions');
      return;
    }

    if (requiresCloudConsent && !cloudConsent) {
      toast({
        title: "Zustimmung erforderlich",
        description: "Cloud-Verarbeitung ist aktiviert. Bitte stimmen Sie der Verarbeitung Ihrer Audiodaten durch OpenAI (USA) zu.",
        variant: "destructive",
      });
      return;
    }

    connectionToastJobRef.current = null;
    setIsTranscribing(true);

    try {
      const formData = new FormData();
      const endpoint = sessionSelected ? "/api/jobs/transcribe-session" : "/api/jobs/transcribe";

      if (sessionSelected && selectedSessionFile) {
        formData.append("sessionId", sessionId!);
        formData.append("fileId", selectedSessionFile.id);
      } else if (audioFile) {
        formData.append("audio", audioFile);
      }

      // Add email notification if provided
      if (notifyEmail && notifyEmail.includes("@")) {
        formData.append("notifyEmail", notifyEmail);
      }

      formData.append("mode", transcribeMode);
      formData.append("enhanceAudio", enhanceAudio ? "standard" : "off");
      if (vocabularyPrompt) {
        formData.append("vocabularyPrompt", vocabularyPrompt);
      }
      if (requiresCloudConsent) {
        formData.append("cloudConsent", cloudConsent ? "true" : "false");
      }

      // Try async job endpoint first
      const jobId = await transcriptionJob.submitJob(endpoint, formData);

      if (jobId) {
        // Job submitted successfully - will be handled by transcriptionJob callbacks
        const emailMsg = notifyEmail ? " Sie erhalten eine E-Mail wenn fertig." : "";
        toast({
          title: "Transkription gestartet",
          description: `Die Verarbeitung kann 1-5 Minuten dauern.${emailMsg}`,
        });
        return;
      }

      if (sessionSelected) {
        throw new Error("async_unavailable");
      }

      // If async job failed (e.g., Redis not available), fall back to sync
      console.log('[Transcription] Falling back to synchronous endpoint');

      let response: Response;
      try {
        response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
      } catch (networkError: any) {
        // Network error - connection failed before getting a response
        const errorMsg = networkError.message || "Netzwerkfehler";
        throw new Error(
          errorMsg.includes("Load failed") || errorMsg.includes("Failed to fetch")
            ? `Server nicht erreichbar. Bitte prüfe ob der Server läuft. (${errorMsg})`
            : `Verbindungsfehler: ${errorMsg}`
        );
      }

      // Handle rate limit / usage limit exceeded
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.resetInSeconds) {
          toast({
            title: "Rate Limit erreicht",
            description: `Bitte warten Sie ${errorData.resetInSeconds} Sekunden.`,
            variant: "destructive",
          });
        } else {
          openUpgradeModal('transcriptions');
        }
        await refreshUser(); // Refresh usage data
        setIsTranscribing(false);
        return;
      }

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.error || errorData.details || errorData.message || errorDetail;
        } catch {
          // Response wasn't JSON, try text
          try {
            errorDetail = await response.text() || errorDetail;
          } catch {}
        }
        throw new Error(errorDetail);
      }

      const data = await response.json();

      // Apply vocabulary corrections if vocabulary is loaded
      let correctedText = data.text;
      let correctedSrt = data.srt;

      if (vocabulary.length > 0) {
        correctedText = applyVocabularyCorrections(data.text, vocabulary);
        correctedSrt = applyVocabularyToSrtContent(data.srt, vocabulary);
      }

      setTranscriptionResult({
        text: correctedText,
        srt: correctedSrt,
        duration: data.duration,
      });

      // Refresh usage data from server
      await refreshUser();

      toast({
        title: "Transkription abgeschlossen",
        description: vocabulary.length > 0
          ? `${Math.round(data.duration)}s · ${vocabulary.length} Korrekturen angewendet`
          : `Dauer: ${Math.round(data.duration)} Sekunden`,
      });
      setIsTranscribing(false);
    } catch (error: any) {
      console.error("[Transcription Error]", error);
      const errorMessage = error?.message === "async_unavailable"
        ? "Die Job-Warteschlange ist gerade nicht verfügbar. Bitte in 1-2 Minuten erneut versuchen."
        : translateError(error?.message || "Unbekannter Fehler");
      toast({
        title: "Transkription fehlgeschlagen",
        description: errorMessage,
        variant: "destructive",
      });
      setIsTranscribing(false);
    }
  };

  // Play specific segment
  const playSegment = (segment: SrtSegment) => {
    if (!audioPlayerRef.current || !audioUrl) return;

    const audio = audioPlayerRef.current;
    if (timeUpdateHandlerRef.current) {
      audio.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
      timeUpdateHandlerRef.current = null;
    }
    audio.currentTime = segment.startSeconds;
    audio.play();
    setPlayingSegment(segment.index);

    // Stop at end of segment
    const checkEnd = () => {
      if (audio.currentTime >= segment.endSeconds) {
        audio.pause();
        setPlayingSegment(null);
        audio.removeEventListener("timeupdate", checkEnd);
        timeUpdateHandlerRef.current = null;
      }
    };
    timeUpdateHandlerRef.current = checkEnd;
    audio.addEventListener("timeupdate", checkEnd);
  };

  // Stop playback
  const stopPlayback = () => {
    if (audioPlayerRef.current) {
      if (timeUpdateHandlerRef.current) {
        audioPlayerRef.current.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
        timeUpdateHandlerRef.current = null;
      }
      audioPlayerRef.current.pause();
      setPlayingSegment(null);
    }
  };

  // Update segment text
  const updateSegmentText = (index: number, newText: string) => {
    const updated = srtSegments.map(seg =>
      seg.index === index ? { ...seg, text: newText } : seg
    );
    setSrtSegments(updated);
    if (subtitlesReviewed) {
      setSubtitlesReviewed(false);
    }
  };

  const applyFindReplace = () => {
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
    const updated = srtSegments.map((seg) => {
      const { output, count } = replaceAllWithCount({
        input: seg.text,
        find,
        replace: replaceText,
        caseSensitive: replaceCaseSensitive,
      });
      total += count;
      return count > 0 ? { ...seg, text: output } : seg;
    });

    setSrtSegments(updated);
    if (total > 0) {
      setSubtitlesReviewed(false);
    }
    toast({
      title: "Suchen/Ersetzen",
      description: total > 0 ? `${total} Treffer ersetzt.` : "Keine Treffer gefunden.",
    });
  };

  const joinSubtitleText = (left: string, right: string) => {
    const leftTrimmed = left.replace(/\s+$/, "");
    const rightTrimmed = right.replace(/^\s+/, "");
    if (!leftTrimmed) return rightTrimmed;
    if (!rightTrimmed) return leftTrimmed;
    return `${leftTrimmed} ${rightTrimmed}`;
  };

  const splitTextForRedistribution = (text: string): string[] => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    const matches = cleaned.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);
    return matches ? matches.map((part) => part.trim()).filter(Boolean) : [cleaned];
  };

  const normalizeSegments = (segments: SrtSegment[]) => {
    const mapping = new Map<number, number>();
    const normalized = segments.map((seg, idx) => {
      const nextIndex = idx + 1;
      mapping.set(seg.index, nextIndex);
      return {
        ...seg,
        index: nextIndex,
        startTime: secondsToSrtTime(seg.startSeconds),
        endTime: secondsToSrtTime(seg.endSeconds),
      };
    });
    return { normalized, mapping };
  };

  const remapChapterBreaks = (breaks: number[], mapping: Map<number, number>) => {
    return breaks
      .map((idx) => mapping.get(idx))
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);
  };

  const remapChapterTitles = (titles: Record<number, string>, mapping: Map<number, number>) => {
    const next: Record<number, string> = {};
    for (const [key, value] of Object.entries(titles)) {
      const mapped = mapping.get(Number(key));
      if (mapped) {
        next[mapped] = value;
      }
    }
    return next;
  };

  const deleteSegmentAndRedistribute = (index: number) => {
    const idx = srtSegments.findIndex((seg) => seg.index === index);
    if (idx === -1 || srtSegments.length <= 1) return;

    const prev = srtSegments[idx - 1];
    const next = srtSegments[idx + 1];
    if (!prev && !next) return;

    const working = srtSegments.map((seg) => ({ ...seg }));
    const currentSeg = working[idx];
    const prevSeg = prev ? working[idx - 1] : null;
    const nextSeg = next ? working[idx + 1] : null;

    if (prevSeg && nextSeg) {
      const parts = splitTextForRedistribution(currentSeg.text);
      if (parts.length <= 1) {
        prevSeg.text = joinSubtitleText(prevSeg.text, currentSeg.text);
        prevSeg.endSeconds = Math.max(prevSeg.endSeconds, currentSeg.endSeconds);
      } else {
        const mid = Math.ceil(parts.length / 2);
        const leftText = parts.slice(0, mid).join(" ");
        const rightText = parts.slice(mid).join(" ");
        const duration = Math.max(0.01, currentSeg.endSeconds - currentSeg.startSeconds);
        const totalLen = leftText.length + rightText.length;
        const ratio = totalLen > 0 ? leftText.length / totalLen : 0.5;
        const splitSeconds = currentSeg.startSeconds + duration * ratio;
        const safeSplit = Math.max(prevSeg.endSeconds, Math.min(splitSeconds, nextSeg.startSeconds));

        prevSeg.text = joinSubtitleText(prevSeg.text, leftText || currentSeg.text);
        prevSeg.endSeconds = Math.max(prevSeg.endSeconds, safeSplit);

        if (rightText) {
          nextSeg.text = joinSubtitleText(rightText, nextSeg.text);
          nextSeg.startSeconds = Math.min(nextSeg.startSeconds, safeSplit);
        }
      }
    } else if (prevSeg) {
      prevSeg.text = joinSubtitleText(prevSeg.text, currentSeg.text);
      prevSeg.endSeconds = Math.max(prevSeg.endSeconds, currentSeg.endSeconds);
    } else if (nextSeg) {
      nextSeg.text = joinSubtitleText(currentSeg.text, nextSeg.text);
      nextSeg.startSeconds = Math.min(nextSeg.startSeconds, currentSeg.startSeconds);
    }

    working.splice(idx, 1);
    const { normalized, mapping } = normalizeSegments(working);
    setSrtSegments(normalized);
    setChapterBreaks((prevBreaks) => remapChapterBreaks(prevBreaks, mapping));
    setChapterTitles((prevTitles) => remapChapterTitles(prevTitles, mapping));
    setSubtitlesReviewed(false);
    if (playingSegment === index) {
      stopPlayback();
    }

    toast({
      title: "Segment entfernt",
      description: "Text automatisch in die Nachbarsegmente verteilt.",
    });
  };

  const toggleRemoveFromVideo = (index: number) => {
    setSrtSegments((prev) =>
      prev.map((seg) =>
        seg.index === index
          ? ({ ...seg, removeFromVideo: !(seg as any).removeFromVideo } as any)
          : seg
      )
    );
  };

  const computeKeepSegmentsForTextCut = (durationSeconds: number): Array<{ start: number; end: number }> => {
    const dur = Number(durationSeconds);
    if (!Number.isFinite(dur) || dur <= 0) return [];

    const removedRaw = srtSegments
      .filter((seg) => !!(seg as any).removeFromVideo)
      .map((seg) => ({
        start: Math.max(0, Number(seg.startSeconds)),
        end: Math.max(0, Number(seg.endSeconds)),
      }))
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
      .sort((a, b) => a.start - b.start);

    // Merge removed intervals (adjacent/overlapping).
    const removed: Array<{ start: number; end: number }> = [];
    const eps = 0.02;
    for (const seg of removedRaw) {
      const s = Math.max(0, Math.min(seg.start, dur));
      const e = Math.max(0, Math.min(seg.end, dur));
      if (e <= s) continue;
      const last = removed[removed.length - 1];
      if (!last) {
        removed.push({ start: s, end: e });
        continue;
      }
      if (s <= last.end + eps) {
        last.end = Math.max(last.end, e);
      } else {
        removed.push({ start: s, end: e });
      }
    }

    // Complement: keep everything except removed intervals.
    const keep: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const r of removed) {
      if (cursor < r.start) keep.push({ start: cursor, end: r.start });
      cursor = Math.max(cursor, r.end);
    }
    if (cursor < dur) keep.push({ start: cursor, end: dur });

    // Filter tiny fragments.
    return keep.filter((k) => k.end - k.start >= 0.05);
  };

  const exportTextCutVideo = async () => {
    if (!isAuthenticated) {
      toast({ title: "Bitte einloggen", description: "Zum Export ist ein Login erforderlich.", variant: "destructive" });
      return;
    }
    if (!hasVideoEditAccess) {
      openUpgradeModal?.("videos");
      toast({ title: "Pro-Funktion", description: "Textbasierter Videoschnitt ist ab Pro verfügbar.", variant: "destructive" });
      return;
    }
    if (!sessionId) {
      toast({ title: "Keine Session", description: "Bitte zuerst eine Session-Datei auswählen.", variant: "destructive" });
      return;
    }
    if (!selectedSessionFile || !selectedSessionFile.mimeType?.startsWith("video/")) {
      toast({ title: "Video auswählen", description: "Textschnitt funktioniert aktuell nur mit Session-Videos.", variant: "destructive" });
      return;
    }

    const durationSeconds = selectedSessionFile.metadata?.duration || transcriptionResult?.duration || 0;
    const keep = computeKeepSegmentsForTextCut(durationSeconds);

    if (keep.length === 0) {
      toast({ title: "Nichts zu exportieren", description: "Es bleiben keine Segmente uebrig.", variant: "destructive" });
      return;
    }

    setIsTextCutting(true);
    setTextCutResultFileId(null);
    try {
      const res = await fetch("/api/video/cut-merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": sessionId,
        },
        credentials: "include",
        body: JSON.stringify({
          fileId: selectedSessionFile.id,
          segments: keep,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Textschnitt fehlgeschlagen");
      }

      const fileId = data?.file?.id as string | undefined;
      if (fileId) setTextCutResultFileId(fileId);

      await refreshSession();
      toast({
        title: "Textschnitt exportiert",
        description: "Neues Video wurde in deiner Session gespeichert.",
      });
    } catch (err: any) {
      toast({ title: "Textschnitt fehlgeschlagen", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setIsTextCutting(false);
    }
  };

  // Download SRT file
  const handleDownloadSRT = () => {
    const srtContent = segmentsToSrt(srtSegments);
    const blob = new Blob([srtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `untertitel-${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Heruntergeladen",
      description: "SRT-Datei gespeichert",
    });
  };

  const handleDownloadVTT = () => {
    const vttContent = segmentsToVtt(srtSegments);
    const blob = new Blob([vttContent], { type: "text/vtt" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `untertitel-${Date.now()}.vtt`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Heruntergeladen",
      description: "WebVTT-Datei gespeichert",
    });
  };

  const handleDownloadTTML = () => {
    const ttmlContent = segmentsToTtml(srtSegments);
    const blob = new Blob([ttmlContent], { type: "application/ttml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `untertitel-${Date.now()}.ttml`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Heruntergeladen",
      description: "TTML-Datei gespeichert",
    });
  };

  // Handle video file selection
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setSubtitleTypeManuallySet(false);
    }
  };

  // Handle SRT file selection for embedding
  const handleSrtSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSrtFile(file);
    }
  };

  // Handle font file selection
  const handleFontSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFontFile(file);
      toast({
        title: "Schriftart geladen",
        description: file.name,
      });
    }
  };

  // Use transcription result as SRT
  const useTranscriptionSRT = () => {
    const srtContent = segmentsToSrt(srtSegments);
    const blob = new Blob([srtContent], { type: "text/plain" });
    const file = new File([blob], "untertitel.srt", { type: "text/plain" });
    setSrtFile(file);

    toast({
      title: "SRT geladen",
      description: "Verwende bearbeitete Untertitel",
    });
  };

  // Toggle chapter break at segment index
  const toggleChapterBreak = (segmentIndex: number) => {
    setChapterBreaks((prev) => {
      if (prev.includes(segmentIndex)) {
        // Remove break
        const newBreaks = prev.filter((i) => i !== segmentIndex);
        // Also remove the title for this break
        setChapterTitles((titles) => {
          const newTitles = { ...titles };
          delete newTitles[segmentIndex];
          return newTitles;
        });
        return newBreaks;
      } else {
        // Add break and sort
        return [...prev, segmentIndex].sort((a, b) => a - b);
      }
    });
  };

  // Generate chapters from breaks for the split job
  const getChaptersFromBreaks = (): Chapter[] => {
    if (srtSegments.length === 0) return [];

    const chapters: Chapter[] = [];
    const sortedBreaks = [...chapterBreaks].sort((a, b) => a - b);
    let startIdx = 0;

    // For each break + end of video
    const allEndPoints = [...sortedBreaks];
    // Add the last segment as final end point
    if (!allEndPoints.includes(srtSegments.length - 1)) {
      allEndPoints.push(srtSegments.length - 1);
    }

    allEndPoints.forEach((endIdx, i) => {
      const startSeg = srtSegments[startIdx];
      const endSeg = srtSegments[endIdx];

      if (startSeg && endSeg) {
        chapters.push({
          start: startSeg.startTime,
          end: endSeg.endTime,
          title: chapterTitles[endIdx] || `Kapitel ${i + 1}`,
        });
      }

      startIdx = endIdx + 1;
    });

    return chapters;
  };

  const applySuggestedChapters = (suggested: Array<{ start: string; title: string }>) => {
    if (srtSegments.length === 0) return;

    const parseSrtTs = (value: string): number | null => {
      const v = value.trim();
      const m = v.match(/^(\d{2}):(\d{2}):(\d{2})(?:[,.](\d{3}))?$/);
      if (!m) return null;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      const ss = Number(m[3]);
      const ms = Number((m[4] || "000").padStart(3, "0"));
      if (![hh, mm, ss, ms].every(Number.isFinite)) return null;
      return hh * 3600 + mm * 60 + ss + ms / 1000;
    };

    // Normalize and sort by start time.
    const starts = suggested
      .map((c) => ({ startSeconds: parseSrtTs(c.start), title: (c.title || "").trim() }))
      .filter((c) => c.startSeconds !== null && c.title)
      .sort((a, b) => (a.startSeconds as number) - (b.startSeconds as number)) as Array<{ startSeconds: number; title: string }>;

    if (starts.length === 0) return;

    // Ensure start at 0.
    if (starts[0].startSeconds > 0.5) {
      starts.unshift({ startSeconds: 0, title: "Start" });
    }

    const newBreaks: number[] = [];
    const newTitles: Record<number, string> = {};

    const lastIdx = srtSegments.length - 1;
    const firstSegIndex = srtSegments[0]?.index ?? 1;
    const lastSegIndex = srtSegments[lastIdx]?.index ?? lastIdx;

    let prevEndIdx = firstSegIndex;
    for (let i = 0; i < starts.length; i += 1) {
      const current = starts[i];
      const next = starts[i + 1];

      let endIdx = lastSegIndex;
      if (next) {
        const nextStart = next.startSeconds;
        const firstNextSeg = srtSegments.find((seg) => seg.startSeconds >= nextStart) || null;
        if (firstNextSeg) {
          const prevIdx = Math.max(firstSegIndex, firstNextSeg.index - 1);
          endIdx = prevIdx;
        }
      }

      // Avoid non-increasing end indices.
      endIdx = Math.max(endIdx, prevEndIdx);
      prevEndIdx = endIdx;

      newTitles[endIdx] = current.title.slice(0, 80);
      if (i < starts.length - 1 && endIdx !== lastSegIndex && !newBreaks.includes(endIdx)) {
        newBreaks.push(endIdx);
      }
    }

    setChapterBreaks(newBreaks.sort((a, b) => a - b));
    setChapterTitles(newTitles);
    setSubtitlesReviewed(false);

    toast({
      title: "Kapitelvorschläge übernommen",
      description: `${Math.max(1, Object.keys(newTitles).length)} Kapitel gesetzt`,
    });
  };

  const suggestChaptersWithAi = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an.",
        variant: "destructive",
      });
      return;
    }
    if (srtSegments.length === 0) {
      toast({
        title: "Untertitel erforderlich",
        description: "Bitte zuerst Untertitel erstellen.",
        variant: "destructive",
      });
      return;
    }

    setIsSuggestingChapters(true);
    try {
      const srt = segmentsToSrt(srtSegments);
      const durationSeconds = srtSegments[srtSegments.length - 1]?.endSeconds || 0;
      const maxChapters = Math.max(3, Math.min(12, Math.ceil(durationSeconds / 180)));

      const response = await fetch("/api/video-ai/suggest-chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srt, maxChapters }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      const chapters = Array.isArray(data.chapters) ? data.chapters : [];
      applySuggestedChapters(chapters);
    } catch (err: any) {
      toast({
        title: "KI-Kapitel fehlgeschlagen",
        description: translateError(err?.message || "Unbekannter Fehler"),
        variant: "destructive",
      });
    } finally {
      setIsSuggestingChapters(false);
    }
  };

  // Update chapter title for a break
  const updateChapterTitle = (breakIndex: number, newTitle: string) => {
    setChapterTitles((prev) => ({
      ...prev,
      [breakIndex]: newTitle,
    }));
  };

  const resolveChapterSourceVideo = async (): Promise<File | null> => {
    if (audioFile?.type.startsWith("video/")) {
      return audioFile;
    }
    if (!selectedSessionVideoFile) {
      return null;
    }
    const response = await fetch(getFileUrl(selectedSessionVideoFile.id), {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Session-Video konnte nicht geladen werden");
    }
    const blob = await response.blob();
    return new File([blob], selectedSessionVideoFile.name, {
      type: selectedSessionVideoFile.mimeType || blob.type || "video/mp4",
    });
  };

  // Start chapter splitting job
  const splitVideoIntoChapters = async () => {
    const chapters = getChaptersFromBreaks();

    if (chapters.length === 0) {
      toast({
        title: "Fehler",
        description: "Video und mindestens eine Kapitelmarkierung erforderlich",
        variant: "destructive",
      });
      return;
    }

    if (workflow === "solution-demo" && !subtitlesReviewed) {
      toast({
        title: "Bitte Untertitel prüfen",
        description: "Markieren Sie die Untertitel als geprüft, bevor die Kapitel exportiert werden.",
        variant: "destructive",
      });
      return;
    }

    try {
      setChapterDownloadFiles([]);
      const sourceVideo = await resolveChapterSourceVideo();
      if (!sourceVideo) {
        toast({
          title: "Video erforderlich",
          description: "Kapitelaufteilung funktioniert nur mit Videodateien",
          variant: "destructive",
        });
        return;
      }

      const formData = new FormData();
      formData.append("video", sourceVideo);
      formData.append("chapters", JSON.stringify(chapters));
      formData.append("srtContent", segmentsToSrt(srtSegments));
      // Export profile: keep each chapter video under typical intranet upload limits.
      formData.append("maxSizeMb", "125");

      const jobId = await chapterJob.submitJob("/api/jobs/split-chapters", formData);

      if (jobId) {
        toast({
          title: "Kapitelaufteilung gestartet",
          description: `${chapters.length} Kapitel werden erstellt...`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Kapitelaufteilung fehlgeschlagen",
        description: translateError(error?.message || "Unbekannter Fehler"),
        variant: "destructive",
      });
    }
  };

  const parseErrorMessage = async (response: Response, fallback: string): Promise<string> => {
    try {
      const text = await response.text();
      if (!text) return fallback;
      try {
        const parsed = JSON.parse(text);
        return parsed.error || parsed.message || text || fallback;
      } catch {
        return text;
      }
    } catch {
      return fallback;
    }
  };

  const fetchChapterDownloadFiles = async (jobId: string, silent = false): Promise<ChapterDownloadFile[]> => {
    setIsLoadingChapterFiles(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/chapters/files`, {
        credentials: "include",
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Kapiteldateien nicht verfügbar");
        throw new Error(message);
      }

      const data = await response.json();
      const files: ChapterDownloadFile[] = Array.isArray(data.files) ? data.files : [];
      setChapterDownloadFiles(files);
      return files;
    } catch (error: any) {
      if (!silent) {
        toast({
          title: "Kapiteldateien nicht verfügbar",
          description: translateError(error?.message || "Unbekannter Fehler"),
          variant: "destructive",
        });
      }
      return [];
    } finally {
      setIsLoadingChapterFiles(false);
    }
  };

  const downloadChapterFile = (file: ChapterDownloadFile) => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllChapterVideos = async () => {
    const jobId = chapterJob.job?.id;
    if (!jobId) return;

    const files = chapterDownloadFiles.length > 0
      ? chapterDownloadFiles
      : await fetchChapterDownloadFiles(jobId);

    const videoFiles = files.filter((file) => file.type === "video");
    if (videoFiles.length === 0) {
      toast({
        title: "Keine Kapitelvideos gefunden",
        description: "Bitte Job neu laden oder erneut exportieren.",
        variant: "destructive",
      });
      return;
    }

    videoFiles.forEach((file, index) => {
      window.setTimeout(() => downloadChapterFile(file), index * 220);
    });

    toast({
      title: "Einzeldownload gestartet",
      description: `${videoFiles.length} Kapitelvideos werden ohne Archiv geladen (empfohlen für DRV-Netze).`,
    });
  };

  // Download chapter archive file
  const downloadChaptersArchive = async () => {
    if (!chapterJob.job?.id) return;

    try {
      const response = await fetch(`/api/jobs/${chapterJob.job.id}/chapters`, {
        credentials: "include",
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Download fehlgeschlagen");
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Get filename from original video
      const baseName = (audioFile?.name || selectedSessionVideoFile?.name)
        ? (audioFile?.name || selectedSessionVideoFile?.name || "video").replace(/\.[^/.]+$/, "")
        : "video";
      a.download = `${baseName}_kapitel.tar.gz`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download gestartet",
        description: "Archiv mit allen Kapiteln",
      });
    } catch (error: any) {
      toast({
        title: "Download fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (chapterJob.job?.status !== "completed" || !chapterJob.job.id) return;
    void fetchChapterDownloadFiles(chapterJob.job.id, true);
  }, [chapterJob.job?.id, chapterJob.job?.status]);

  // Handle subtitle embedding
  const handleEmbedSubtitles = async () => {
    const selectedSessionVideo =
      selectedSessionFile && selectedSessionFile.mimeType?.startsWith("video/")
        ? selectedSessionFile
        : null;
    const shouldUseSessionEmbed =
      !!selectedSessionVideo ||
      (!!videoFile && videoFile.size >= DIRECT_EMBED_UPLOAD_LIMIT_BYTES);

    if (!srtFile && srtSegments.length === 0) return;
    if (!shouldUseSessionEmbed && (!videoFile || !srtFile)) return;

    // Check if user is authenticated
    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um Videos zu bearbeiten.",
        variant: "destructive",
      });
      return;
    }

    // Check usage limit
    if (!canProcess) {
      openUpgradeModal('videos');
      return;
    }

    setIsEmbedding(true);
    setEmbedProgress(10);

    try {
      const formData = new FormData();
      let endpoint = shouldUseSessionEmbed ? "/api/jobs/embed-subtitles-session" : "/api/jobs/embed-subtitles";
      let embedSessionFile = selectedSessionVideo;
      let embedSessionId =
        sessionId ||
        (typeof window !== "undefined" ? window.localStorage.getItem("voxdrop-session-id") : null);
      const displayName = (videoFile?.name || embedSessionFile?.name || "video").replace(/\.[^/.]+$/, "");
      setEmbedDownloadName(`${displayName}_untertitel.mp4`);
      setEmbedCompletedJobId(null);

      if (shouldUseSessionEmbed) {
        if (!embedSessionFile && videoFile) {
          toast({
            title: "Große Datei erkannt",
            description: `Upload läuft über Session (${DIRECT_EMBED_UPLOAD_LIMIT_MB}+ MB), stabiler bei Proxy-Limits und 413-Fehlern.`,
          });
          setEmbedProgress(20);
          const uploaded = await uploadFile(videoFile, { forceResumable: true });
          if (!uploaded) {
            throw new Error("session_upload_failed");
          }
          embedSessionFile = uploaded;
          setEmbedProgress(28);

          const refreshed = await refreshSession();
          embedSessionId =
            refreshed?.sessionId ||
            embedSessionId ||
            (typeof window !== "undefined" ? window.localStorage.getItem("voxdrop-session-id") : null);
        }

        if (!embedSessionFile || !embedSessionId) {
          throw new Error("session_unavailable");
        }

        const srtContent = srtSegments.length > 0
          ? segmentsToSrt(srtSegments)
          : (srtFile ? await srtFile.text() : "");
        if (!srtContent.trim()) {
          throw new Error("SRT-Datei fehlt");
        }
        const normalizedSrt = srtContent.endsWith("\n") ? srtContent : `${srtContent}\n`;
        const srtName = `${displayName || "untertitel"}.srt`;
        formData.append("sessionId", embedSessionId);
        formData.append("videoFileId", embedSessionFile.id);
        formData.append("srt", new Blob([normalizedSrt], { type: "application/x-subrip" }), srtName);
      } else {
        formData.append("video", videoFile!);
        formData.append("srt", srtFile!);
      }
      formData.append("type", subtitleType);
      formData.append("enhanceAudio", enhanceAudio ? "true" : "false");

      if (fontFile && subtitleType === "hardcoded") {
        formData.append("font", fontFile);
      }

      // Send styling options for hardcoded subtitles
      if (subtitleType === "hardcoded") {
        formData.append("fontSize", subtitleStyle.fontSize.toString());
        formData.append("fontColor", subtitleStyle.fontColor);
        formData.append("backgroundColor", subtitleStyle.backgroundColor);
        formData.append("backgroundOpacity", subtitleStyle.backgroundOpacity.toString());
      }

      if (showEmbedEmailInput && embedNotifyEmail && embedNotifyEmail.includes("@")) {
        formData.append("notifyEmail", embedNotifyEmail);
      }

      // Try async job endpoint first
      const jobId = await submitEmbedJob(endpoint, formData);
      if (jobId) {
        const emailMsg = showEmbedEmailInput && embedNotifyEmail ? " Wir senden eine E-Mail, wenn fertig." : "";
        toast({
          title: "Untertitel werden eingebettet",
          description: `Das kann einige Minuten dauern.${emailMsg}`,
        });
        setIsEmbedding(false);
        setEmbedProgress(0);
        return;
      }

      if (shouldUseSessionEmbed) {
        throw new Error("async_unavailable");
      }

      setEmbedProgress(30);

      let response = await fetch("/api/embed-subtitles", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      setEmbedProgress(70);

      if (response.status === 401) {
        const refreshed = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (refreshed.ok) {
          response = await fetch("/api/embed-subtitles", {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        }
      }

      // Handle rate limit / usage limit exceeded
      if (response.status === 429) {
        openUpgradeModal('videos');
        await refreshUser();
        return;
      }

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to embed subtitles");
        throw new Error(message);
      }

      setEmbedProgress(90);

      // Download the resulting video
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video_barrierefrei.mp4`;
      a.click();
      URL.revokeObjectURL(url);

      setEmbedProgress(100);

      // Refresh usage data from server
      await refreshUser();

      toast({
        title: "Fertig!",
        description: "Barrierefreies Video heruntergeladen",
      });
    } catch (error: any) {
      const message = error?.message === "async_unavailable"
        ? "Die Job-Warteschlange ist gerade nicht verfügbar. Bitte in 1-2 Minuten erneut versuchen."
        : translateError(error?.message || "Untertitel konnten nicht eingebettet werden");
      toast({
        title: "Fehler",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsEmbedding(false);
      setEmbedProgress(0);
    }
  };

  // Active step state
  const [activeStep, setActiveStep] = useState<1 | 2>(1);

  // Impressum modal state
  const [showImpressum, setShowImpressum] = useState(false);

  // Datenschutz modal state
  const [showDatenschutz, setShowDatenschutz] = useState(false);

  // Cleanup on page leave - DSGVO compliance
  // Use ref to track audioUrl for cleanup without causing re-renders
  const audioUrlRef = useRef<string | null>(null);
  audioUrlRef.current = audioUrl;

  useEffect(() => {
    const cleanup = () => {
      // Revoke object URLs to free memory
      if (audioUrlRef.current) {
        try {
          URL.revokeObjectURL(audioUrlRef.current);
        } catch (e) {
          // Ignore errors
        }
      }
      // Clear file references
      setAudioFile(null);
      setSelectedSessionFile(null);
      setVideoFile(null);
      setSrtFile(null);
      setFontFile(null);
      setTranscriptionResult(null);
      setSrtSegments([]);
    };

    // Cleanup when page is closed/refreshed
    window.addEventListener("beforeunload", cleanup);

    // Cleanup only when component unmounts (empty dependency array)
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      if (audioPlayerRef.current && timeUpdateHandlerRef.current) {
        audioPlayerRef.current.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
        timeUpdateHandlerRef.current = null;
      }
      // Note: We don't call cleanup() here anymore to avoid resetting state on re-renders
    };
  }, []); // Empty dependency array - only run once on mount

  useEffect(() => {
    return () => {
      if (voiceoverPollTimeoutRef.current) {
        clearTimeout(voiceoverPollTimeoutRef.current);
        voiceoverPollTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <PageLayout>
      <SEO
        title="Video Untertitel Tool"
        description="Automatische Transkription und Untertitelung für Videos. Bildschirm aufnehmen, transkribieren und Untertitel einbetten. DSGVO-konform mit lokaler KI."
        canonical="/tools/untertitel"
      />

      {/* Skip Link for Keyboard Navigation */}{/* Hidden audio player */}
      {audioUrl && <audio ref={audioPlayerRef} src={audioUrl} />}


      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-full text-sm font-medium mb-6">
            <Video className="w-4 h-4" />
            Video Untertitel Tool
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
            Von der Aufnahme zum<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-700">
              barrierefreien Video.
            </span>
          </h1>
          <div className="text-lg text-slate-600 font-light max-w-2xl mx-auto space-y-1">
            <p><span className="text-slate-700 font-medium">1.</span> Audio oder Video hochladen (oder direkt aufnehmen)</p>
            <p><span className="text-slate-700 font-medium">2.</span> KI erstellt automatisch Untertitel</p>
            <p><span className="text-slate-700 font-medium">3.</span> Untertitel ins Video einbetten – fertig.</p>
          </div>

          {isAgencyMode && (
            <div className="mt-6 bg-violet-50 border border-violet-200 rounded-2xl p-5 text-left">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-violet-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900">Behörden-Modus aktiv</p>
                  <p className="text-sm text-violet-800 mt-1">
                    Exportiert Untertitel zusätzlich als WebVTT und TTML (EBU-TT) und betont BITV/EN-301-549 Hinweise.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Step Indicator */}
      <div className="max-w-3xl mx-auto px-6 mb-8">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setActiveStep(1)}
            aria-pressed={activeStep === 1}
            className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all ${
              activeStep === 1
                ? "bg-slate-900 text-white shadow-lg"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
              activeStep === 1 ? "bg-white text-slate-900" : "bg-slate-200 text-slate-600"
            }`} aria-hidden="true">1</span>
            <span className="font-medium">Untertitel erstellen</span>
          </button>
          <ChevronRight className="w-5 h-5 text-slate-300" aria-hidden="true" />
          <button
            onClick={() => setActiveStep(2)}
            aria-pressed={activeStep === 2}
            className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all ${
              activeStep === 2
                ? "bg-slate-900 text-white shadow-lg"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
              activeStep === 2 ? "bg-white text-slate-900" : "bg-slate-200 text-slate-600"
            }`} aria-hidden="true">2</span>
            <span className="font-medium">Einbetten & Export</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Step 1: Transcription */}
        {activeStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            {/* Upload/Record Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="p-8">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Video oder Audio</h2>
                  <p className="text-slate-600">Datei hochladen oder aufnehmen</p>
                </div>

                {/* Optionen */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-700">Optionen</p>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedOptions((prev) => !prev)}
                      className="text-sm text-slate-700 hover:text-slate-900"
                      aria-expanded={showAdvancedOptions}
                    >
                      {showAdvancedOptions ? "Erweiterte Optionen ausblenden" : "Erweiterte Optionen"}
                    </button>
                  </div>

                  {!showAdvancedOptions && (
                    <p className="text-xs text-slate-500">
                      Standard-Flow: Datei hochladen oder aufnehmen. Mehr: Workflow, Session, Voice-Over, Fachvokabular, E-Mail.
                    </p>
                  )}

                  {showAdvancedOptions && (
                    <>
                      <p className="text-sm font-medium text-slate-700 mb-3">Workflow wählen</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <button
                          onClick={() => setWorkflow("standard")}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            workflow === "standard"
                              ? "border-blue-600 bg-violet-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <p className="font-medium text-slate-900">Standard</p>
                          <p className="text-sm text-slate-600">Datei oder Aufnahme · optional Session, Voice-Over</p>
                        </button>
                        <button
                          onClick={() => setWorkflow("solution-demo")}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            workflow === "solution-demo"
                              ? "border-purple-600 bg-purple-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <p className="font-medium text-slate-900">Solution Demo (Behörde)</p>
                          <p className="text-sm text-slate-600">Kapitel markieren · automatisch untertiteln · Kapitel exportieren</p>
                        </button>
                        <a
                          href="/tools/untertitel/behoerde"
                          className="block p-4 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-all"
                        >
                          <p className="font-medium text-slate-900">Behörden-Flow</p>
                          <p className="text-sm text-slate-600">Chunk-Upload, 24h-Wiederaufnahme und kapitelweiser Export für Behördennetze.</p>
                        </a>
                      </div>

                      {workflow === "solution-demo" && (
                        <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-xl text-sm text-purple-700">
                          <p className="font-medium text-purple-900 mb-1">Standard-Flow für Solution Demos</p>
                          <ol className="list-decimal list-inside space-y-1">
                            <li>Screenrecording starten und nach jedem Kapitel „Kapitel“ drücken</li>
                            <li>Untertitel automatisch erstellen lassen</li>
                            <li>Untertitel prüfen und Kapitel als MP4 exportieren</li>
                          </ol>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Input Mode Toggle */}
                <div className="flex items-center justify-center gap-2 p-1 bg-slate-100 rounded-xl mb-8">
                  <button
                    onClick={() => setInputMode("upload")}
                    aria-pressed={inputMode === "upload"}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      inputMode === "upload"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    Datei
                  </button>
                  <button
                    onClick={() => setInputMode("record")}
                    aria-pressed={inputMode === "record"}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      inputMode === "record"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Monitor className="w-4 h-4" aria-hidden="true" />
                    Aufnahme
                  </button>

                  {showAdvancedOptions && (
                    <>
                      <button
                        onClick={() => { setInputMode("session"); refreshSession(); }}
                        aria-pressed={inputMode === "session"}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          inputMode === "session"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <FolderOpen className="w-4 h-4" aria-hidden="true" />
                        Session
                        {sessionFiles.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                            {sessionFiles.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setInputMode("voiceover")}
                        aria-pressed={inputMode === "voiceover"}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          inputMode === "voiceover"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <FileAudio className="w-4 h-4" aria-hidden="true" />
                        Voice-Over
                      </button>
                    </>
                  )}
                </div>

                {/* Upload Mode */}
                {inputMode === "upload" && (
                  <>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a,.webm,.ogg,.mp4,audio/*,video/*"
                      onChange={handleAudioSelect}
                      className="hidden"
                      aria-label="Audio- oder Videodatei auswählen"
                    />
                    <div
                      className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
                        audioFile
                          ? "border-green-300 bg-green-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={() => audioInputRef.current?.click()}
                      onKeyDown={(e) => e.key === 'Enter' && audioInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      aria-label="Klicken zum Hochladen einer Audio- oder Videodatei"
                    >
                      {audioFile ? (
                        <div className="space-y-3">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-8 h-8 text-green-600" />
                          </div>
                          <p className="text-lg font-medium text-slate-900">{audioFile.name}</p>
                          <p className="text-sm text-slate-600">
                            {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                            <Upload className="w-8 h-8 text-slate-400" />
                          </div>
                          <p className="text-lg font-medium text-slate-900">Datei auswählen</p>
                          <p className="text-sm text-slate-600">MP3, WAV, M4A, MP4 oder andere Formate</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Record Mode */}
                {inputMode === "record" && (
                  <div className="space-y-6">
                    <ScreenRecorder
                      onRecordingComplete={handleRecordingComplete}
                      onVideoForSubtitles={handleVideoForSubtitles}
                      onChapterMark={handleChapterMark}
                      onChunkUploaded={handleChunkUploaded}
                      chapterCount={chapterMarkers.length}
                      storageTarget={storageTarget}
                      onStorageTargetChange={setStorageTarget}
                      showStoragePicker={false}
                      enableAutoChunking={true}
                    />

                    {chapterMarkers.length > 0 && (
                      <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium text-purple-900">Kapitelmarken</p>
                          {chapterMarkers.length > 0 && (
                            <button
                              onClick={() => {
                                setChapterMarkers([]);
                                setChapterBreaks([]);
                                setChapterTitles({});
                                setChapterMarkersApplied(false);
                              }}
                              className="text-xs text-purple-600 hover:text-purple-700"
                            >
                              Alle entfernen
                            </button>
                          )}
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
                                title="Kapitel entfernen"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Session Mode - Select from video editor clips */}
                {inputMode === "session" && (
                  <div className="space-y-4">
                    {sessionFiles.length === 0 ? (
                      <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                        <FolderOpen className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                        <p className="text-lg font-medium text-slate-900 mb-2">Keine Session-Dateien</p>
                        <p className="text-slate-600 mb-4">
                          Nutze den Video-Editor, um Clips zu erstellen
                        </p>
                        <a
                          href="/tools/untertitel/videoschnitt"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          <Scissors className="w-4 h-4" />
                          Zum Video-Editor
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-slate-600 mb-3">
                          Wähle eine Datei aus deiner aktuellen Session:
                        </p>
                        <div className="grid gap-2 max-h-80 overflow-y-auto">
                          {sessionFiles.map(file => (
                            <button
                              key={file.id}
                              onClick={() => {
                                setSelectedSessionFile(file);
                                setSubtitleTypeManuallySet(false);
                                setAudioFile(null);
                                setVideoFile(null);
                                setSrtFile(null);
                                setFontFile(null);
                                setTranscriptionResult(null);
                                setSrtSegments([]);
                                setSubtitlesReviewed(false);
                                setChapterMarkers([]);
                                setChapterBreaks([]);
                                setChapterTitles({});
                                setChapterMarkersApplied(false);
                                toast({
                                  title: "Datei ausgewählt",
                                  description: file.name,
                                });
                              }}
                              className={`flex items-center gap-3 p-4 rounded-xl text-left transition-colors ${
                                selectedSessionFile?.id === file.id
                                  ? "bg-green-50 border-2 border-green-300"
                                  : "bg-slate-50 hover:bg-slate-100 border-2 border-transparent"
                              }`}
                            >
                              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Video className="w-6 h-6 text-purple-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 truncate">{file.name}</p>
                                <p className="text-sm text-slate-500">
                                  {formatFileSize(file.size)}
                                  {file.metadata?.duration && ` • ${formatDuration(file.metadata.duration)}`}
                                </p>
                              </div>
                              {selectedSessionFile?.id === file.id && (
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500">
                            Session-Dateien werden nach 24h gelöscht
                          </p>
                          <a
                            href="/tools/untertitel/videoschnitt"
                            className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
                          >
                            <Scissors className="w-4 h-4" />
                            Video-Editor
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Voice Over Mode */}
                {inputMode === "voiceover" && (
                  <div className="space-y-6">
                    {/* Text Input Options */}
                    <div>
                      <h3 className="text-lg font-medium text-slate-900 mb-4">1. Text eingeben</h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <button
                          onClick={() => voiceoverInputRef.current?.click()}
                          className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all"
                        >
                          <FileText className="w-8 h-8 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">Word-Datei hochladen</span>
                          <span className="text-xs text-slate-500">.docx</span>
                        </button>
                        <button
                          onClick={() => setVoiceoverText(voiceoverText || "Text hier eingeben...")}
                          className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all ${
                            voiceoverText ? "border-blue-300 bg-violet-50" : "border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <Type className="w-8 h-8 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">Text direkt eingeben</span>
                          <span className="text-xs text-slate-500">Kopieren & Einfügen</span>
                        </button>
                      </div>
                      <input
                        ref={voiceoverInputRef}
                        type="file"
                        accept=".docx,.doc"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIsExtractingText(true);
                            try {
                              const formData = new FormData();
                              formData.append("file", file);
                              const response = await fetch("/api/voiceover/extract-text", {
                                method: "POST",
                                body: formData,
                              });
                              if (!response.ok) throw new Error("Extraktion fehlgeschlagen");
                              const data = await response.json();
                              setVoiceoverText(data.text);
                              toast({ title: "Text extrahiert", description: `${data.wordCount} Wörter` });
                            } catch (err) {
                              toast({ title: "Fehler", description: "Text konnte nicht extrahiert werden", variant: "destructive" });
                            } finally {
                              setIsExtractingText(false);
                            }
                          }
                        }}
                        className="hidden"
                      />
                      {isExtractingText && (
                        <div className="flex items-center gap-2 text-slate-600 mb-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Text wird extrahiert...</span>
                        </div>
                      )}
                      {voiceoverText && (
                        <div className="relative">
                          <textarea
                            value={voiceoverText}
                            onChange={(e) => setVoiceoverText(e.target.value)}
                            className="w-full h-48 p-4 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="Text hier eingeben oder einfügen..."
                          />
                          <div className="absolute bottom-3 right-3 text-xs text-slate-400">
                            {voiceoverText.split(/\s+/).filter(w => w).length} Wörter
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Voice Selection */}
                    <div>
                      <h3 className="text-lg font-medium text-slate-900 mb-4">2. Stimme wählen</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setSelectedVoice("male")}
                          className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                            selectedVoice === "male"
                              ? "bg-violet-50 border-2 border-blue-300"
                              : "bg-slate-50 border-2 border-transparent hover:bg-slate-100"
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            selectedVoice === "male" ? "bg-violet-100" : "bg-slate-200"
                          }`}>
                            <span className="text-2xl">👨</span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-slate-900">Männlich</p>
                            <p className="text-sm text-slate-500">Tiefe, ruhige Stimme</p>
                          </div>
                        </button>
                        <button
                          onClick={() => setSelectedVoice("female")}
                          className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                            selectedVoice === "female"
                              ? "bg-pink-50 border-2 border-pink-300"
                              : "bg-slate-50 border-2 border-transparent hover:bg-slate-100"
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            selectedVoice === "female" ? "bg-pink-100" : "bg-slate-200"
                          }`}>
                            <span className="text-2xl">👩</span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-slate-900">Weiblich</p>
                            <p className="text-sm text-slate-500">Klare, freundliche Stimme</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Pronunciation Rules */}
                    <div>
                      <h3 className="text-lg font-medium text-slate-900 mb-2">3. Aussprache-Korrekturen (optional)</h3>
                      <p className="text-sm text-slate-600 mb-4">
                        Definiere wie schwierige Wörter ausgesprochen werden sollen
                      </p>

                      {/* Existing Rules */}
                      {pronunciationRules.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {pronunciationRules.map((rule, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                              <span className="font-mono text-sm text-slate-700">{rule.original}</span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                              <span className="font-mono text-sm text-green-700">"{rule.spoken}"</span>
                              <button
                                onClick={() => setPronunciationRules(rules => rules.filter((_, i) => i !== idx))}
                                className="ml-auto p-1 text-slate-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add New Rule */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newRuleOriginal}
                          onChange={(e) => setNewRuleOriginal(e.target.value)}
                          placeholder="Original (z.B. BFSG)"
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={newRuleSpoken}
                          onChange={(e) => setNewRuleSpoken(e.target.value)}
                          placeholder="Aussprache (z.B. Be-Eff-Es-Ge)"
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                        <button
                          onClick={() => {
                            if (newRuleOriginal && newRuleSpoken) {
                              setPronunciationRules(rules => [...rules, { original: newRuleOriginal, spoken: newRuleSpoken }]);
                              setNewRuleOriginal("");
                              setNewRuleSpoken("");
                            }
                          }}
                          disabled={!newRuleOriginal || !newRuleSpoken}
                          className="p-2 bg-violet-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Generate Button */}
                    <div className="pt-4 border-t border-slate-200">
                      {isGeneratingVoiceover ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">{voiceoverStatus}</span>
                            <span className="font-medium text-slate-900">{voiceoverProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${voiceoverProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : voiceoverAudioUrl ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                            <div className="flex items-center gap-3 mb-3">
                              <CheckCircle2 className="w-6 h-6 text-green-600" />
                              <span className="font-medium text-green-800">Voice-Over erstellt!</span>
                            </div>
                            <audio controls className="w-full" src={voiceoverAudioUrl} />
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch(voiceoverAudioUrl!, {
                                  });
                                  if (!response.ok) throw new Error("Download fehlgeschlagen");
                                  const blob = await response.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = "voiceover.mp3";
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch (err: any) {
                                  toast({ title: "Fehler", description: err.message, variant: "destructive" });
                                }
                              }}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors"
                            >
                              <Download className="w-5 h-5" />
                              MP3 herunterladen
                            </button>
                            <button
                              onClick={() => {
                                if (voiceoverAudioUrl) {
                                  // Create a File from the audio URL for use in video embedding
                                  fetch(voiceoverAudioUrl)
                                    .then(r => r.blob())
                                    .then(blob => {
                                      const file = new File([blob], "voiceover.mp3", { type: "audio/mpeg" });
                                      setAudioFile(file);
                                      setAudioUrl(voiceoverAudioUrl);
                                      setInputMode("upload");
                                      toast({ title: "Audio bereit", description: "Voice-Over kann jetzt transkribiert werden" });
                                    });
                                }
                              }}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
                            >
                              <Video className="w-5 h-5" />
                              In Video einbetten
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setVoiceoverAudioUrl(null);
                            }}
                            className="w-full text-sm text-slate-500 hover:text-slate-700"
                          >
                            Neues Voice-Over erstellen
                          </button>
                        </div>
                      ) : (
                        <Button
                          onClick={async () => {
                            if (!voiceoverText.trim()) {
                              toast({ title: "Fehler", description: "Bitte Text eingeben", variant: "destructive" });
                              return;
                            }
                            if (!isAuthenticated) {
                              toast({ title: "Anmeldung erforderlich", description: "Bitte melde dich an", variant: "destructive" });
                              return;
                            }
                            setIsGeneratingVoiceover(true);
                            setVoiceoverProgress(0);
                            setVoiceoverStatus("Voice-Over wird generiert...");
                            try {
                              if (voiceoverPollTimeoutRef.current) {
                                clearTimeout(voiceoverPollTimeoutRef.current);
                                voiceoverPollTimeoutRef.current = null;
                              }
                              const response = await fetch("/api/voiceover/generate", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                  text: voiceoverText,
                                  voice: selectedVoice,
                                  pronunciationRules,
                                }),
                              });
                              if (!response.ok) throw new Error("Generierung fehlgeschlagen");
                              const data = await response.json();
                              // Poll for status
                              const pollStatus = async () => {
                                const statusRes = await fetch(`/api/voiceover/status/${data.jobId}`);
                                const status = await statusRes.json();
                                setVoiceoverProgress(status.progress || 0);
                                setVoiceoverStatus(status.currentStage || "");
                                if (status.status === "completed") {
                                  setVoiceoverAudioUrl(`/api/voiceover/download/${data.jobId}`);
                                  setIsGeneratingVoiceover(false);
                                  if (voiceoverPollTimeoutRef.current) {
                                    clearTimeout(voiceoverPollTimeoutRef.current);
                                    voiceoverPollTimeoutRef.current = null;
                                  }
                                } else if (status.status === "failed") {
                                  if (voiceoverPollTimeoutRef.current) {
                                    clearTimeout(voiceoverPollTimeoutRef.current);
                                    voiceoverPollTimeoutRef.current = null;
                                  }
                                  throw new Error(status.error || "Generierung fehlgeschlagen");
                                } else {
                                  voiceoverPollTimeoutRef.current = window.setTimeout(pollStatus, 1000);
                                }
                              };
                              pollStatus();
                            } catch (err: any) {
                              toast({ title: "Fehler", description: err.message, variant: "destructive" });
                              setIsGeneratingVoiceover(false);
                              if (voiceoverPollTimeoutRef.current) {
                                clearTimeout(voiceoverPollTimeoutRef.current);
                                voiceoverPollTimeoutRef.current = null;
                              }
                            }
                          }}
                          disabled={!voiceoverText.trim() || !isAuthenticated}
                          className="w-full py-6 text-lg bg-gradient-to-r from-violet-600 to-purple-700 hover:from-blue-700 hover:to-purple-700"
                        >
                          <Mic className="w-5 h-5 mr-2" />
                          Voice-Over generieren
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Vocabulary Upload Section - show only in upload mode and advanced options */}
              {inputMode === "upload" && showAdvancedOptions && (
              <div className="px-8 pb-4">
                <button
                  onClick={() => setShowVocabulary(!showVocabulary)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                      <Table className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-900">Fachvokabular (optional)</p>
                      <p className="text-sm text-slate-600">
                        {vocabulary.length > 0
                          ? `${vocabulary.length} Korrekturregeln geladen`
                          : "CSV mit Korrekturregeln hochladen"}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showVocabulary ? "rotate-180" : ""}`} />
                </button>

                {showVocabulary && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-xl space-y-4">
                    <div className="text-sm text-slate-600">
                      <p className="mb-2">Laden Sie eine CSV-Datei mit zwei Spalten:</p>
                      <div className="bg-white rounded-lg border border-slate-200 p-3 font-mono text-xs">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-slate-400">Könnte so klingen</div>
                          <div className="text-slate-400">Gemeint ist</div>
                          <div>EV Evolution</div>
                          <div>rvEvolution</div>
                          <div>Bundes tag</div>
                          <div>Bundestag</div>
                          <div>dee es gee vo</div>
                          <div>DSGVO</div>
                        </div>
                      </div>
                    </div>

                    <input
                      ref={vocabularyInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleVocabularySelect}
                      className="hidden"
                      aria-label="Vokabular-CSV-Datei auswählen"
                    />
                    <div
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                        vocabularyFile
                          ? "border-green-300 bg-green-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => vocabularyInputRef.current?.click()}
                      onKeyDown={(e) => e.key === 'Enter' && vocabularyInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      aria-label="Vokabular-Datei hochladen"
                    >
                      {vocabularyFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <span className="font-medium text-slate-900">{vocabularyFile.name}</span>
                          <span className="text-sm text-slate-600">({vocabulary.length} Regeln)</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-600">
                          <Upload className="w-4 h-4" />
                          <span>CSV-Datei auswählen</span>
                        </div>
                      )}
                    </div>

                    {vocabulary.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setVocabularyFile(null);
                          setVocabulary([]);
                        }}
                      >
                        Vokabular entfernen
                      </Button>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Email Notification Section (advanced) */}
              {showAdvancedOptions && (
                <div className="px-8 pb-4">
                  <button
                    onClick={() => setShowEmailInput(!showEmailInput)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-slate-900">E-Mail-Benachrichtigung (optional)</p>
                        <p className="text-sm text-slate-600">
                          {notifyEmail ? `Benachrichtigung an ${notifyEmail}` : "Bei langen Dateien per E-Mail informiert werden"}
                        </p>
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showEmailInput ? "rotate-180" : ""}`} />
                  </button>

                  {showEmailInput && (
                    <div className="mt-3 p-4 bg-slate-50 rounded-xl space-y-3">
                      <p className="text-sm text-slate-600">
                        Die Untertitel-Erstellung kann bei längeren Dateien einige Minuten dauern.
                        Gib deine E-Mail ein, um informiert zu werden, wenn es fertig ist.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={notifyEmail}
                          onChange={(e) => setNotifyEmail(e.target.value)}
                          placeholder="ihre@email.de"
                          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                        />
                        {notifyEmail && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setNotifyEmail("")}
                            className="px-3"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="px-8 pb-8">
                {/* Mode Selector */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Modus</p>
                  <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTranscribeMode("quality")}
                      disabled={isTranscribing}
                      aria-pressed={transcribeMode === "quality"}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 ${
                        transcribeMode === "quality"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Qualität
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranscribeMode("fast")}
                      disabled={isTranscribing}
                      aria-pressed={transcribeMode === "fast"}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 ${
                        transcribeMode === "fast"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Schnell
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Tipp: Bei langen Videos wird das Audio automatisch extrahiert und in Abschnitte geteilt.
                    "Schnell" nutzt eine schnellere Decodierung (etwas ungenauer).
                  </p>
                </div>

                {whisperMode === "openai" && (
                  <div className="mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">Cloud-Verarbeitung (OpenAI) aktiviert</p>
                        <p className="text-xs text-slate-600 mt-1">
                          Für die Transkription werden Audiodaten an OpenAI in den USA übertragen. Das passiert nur mit Ihrer Zustimmung.
                        </p>
                        <label className="mt-3 flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={cloudConsent}
                            onChange={(e) => setCloudConsent(e.target.checked)}
                          />
                          <span className="text-sm text-slate-800">
                            Ich stimme der Verarbeitung meiner Audiodaten durch OpenAI in den USA zu.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Transcription Progress Indicator */}
                {isTranscribing && transcriptionJob.job && (
                  <div className="mb-4 p-4 bg-violet-50 rounded-xl border border-violet-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
                      <span className="text-sm font-medium text-slate-900">
                        {transcriptionJob.job.progress.stage === 'uploading' && 'Datei wird hochgeladen...'}
                        {transcriptionJob.job.progress.stage === 'extracting_audio' && 'Audio wird extrahiert...'}
                        {transcriptionJob.job.progress.stage === 'splitting_audio' && 'Audio wird vorbereitet...'}
                        {transcriptionJob.job.progress.stage === 'transcribing' && 'KI erstellt Untertitel...'}
                        {transcriptionJob.job.progress.stage === 'processing' && 'Ergebnisse werden verarbeitet...'}
                        {transcriptionJob.job.progress.stage === 'queued' && 'In Warteschlange...'}
                        {!transcriptionJob.job.progress.stage && 'Wird verarbeitet...'}
                      </span>
                    </div>
                  <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-600 rounded-full transition-all duration-500"
                      style={{ width: `${transcriptionJob.job.progress.percent || 5}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1 text-right">
                    {transcriptionJob.job.progress.percent || 0}%
                  </p>
                  {transcriptionPosition !== null && (
                    <div className="mt-3">
                      <QueuePositionDisplay
                        position={transcriptionPosition}
                        estimatedWait={transcriptionWait}
                        isProcessing={transcriptionProcessing}
                      />
                    </div>
                  )}
                </div>
              )}

                <Button
                  onClick={handleTranscribe}
                  disabled={(inputMode === "session" ? !selectedSessionFile : !audioFile) || isTranscribing || (requiresCloudConsent && !cloudConsent)}
                  className="w-full h-14 text-base font-medium rounded-xl bg-violet-600 hover:bg-violet-700 transition-all disabled:opacity-50"
                >
                  {isTranscribing ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Erstelle Untertitel...</span>
                    </div>
                  ) : (
                    <span>Untertitel erstellen</span>
                  )}
                </Button>
              </div>
            </div>

            {/* SRT Editor */}
            {srtSegments.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden animate-slide-in-from-bottom">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Untertitel bearbeiten</h2>
                      <p className="text-sm text-slate-600 mt-1">
                        {(segmentSearch || showIssueOnly)
                          ? `${filteredSegments.length} von ${srtSegments.length} Segmenten`
                          : `${srtSegments.length} Segmente erkannt`} · Export: SRT, VTT, TTML
                        {isAgencyMode && " · Behörden-Modus"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleDownloadSRT}
                        size="sm"
                        className="bg-slate-900 hover:bg-slate-800 rounded-lg"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        SRT speichern
                      </Button>
                      <Button
                        onClick={handleDownloadVTT}
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-slate-300 hover:bg-slate-50"
                      >
                        VTT
                      </Button>
                      <Button
                        onClick={handleDownloadTTML}
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-slate-300 hover:bg-slate-50"
                      >
                        TTML
                      </Button>
                      <Button
                        onClick={() => {
                          useTranscriptionSRT();
                          // Pass video file to Step 2 if audioFile is a video (not audio-only)
                          if (audioFile && audioFile.type.startsWith('video/')) {
                            setVideoFile(audioFile);
                          }
                          setActiveStep(2);
                        }}
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-slate-300 hover:bg-slate-50"
                      >
                        Weiter: Einbetten
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>

                  {longVideoDetected && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-900">Speed-First empfohlen</p>
                          <p className="text-xs text-blue-800 mt-1">
                            Für längere Videos sind Kapitel-Export und Soft-Untertitel deutlich schneller als vollständiges Einbrennen.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={suggestChaptersWithAi}
                            disabled={isSuggestingChapters}
                            size="sm"
                            variant="outline"
                            className="rounded-lg border-blue-300 bg-white hover:bg-blue-100"
                          >
                            KI-Kapitel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-lg bg-blue-700 hover:bg-blue-800"
                            onClick={() => {
                              setSubtitleType("soft");
                              setSubtitleTypeManuallySet(false);
                              useTranscriptionSRT();
                              if (audioFile && audioFile.type.startsWith("video/")) {
                                setVideoFile(audioFile);
                              }
                              setActiveStep(2);
                            }}
                          >
                            Schnell: Soft-Export
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={segmentSearch}
                        onChange={(e) => setSegmentSearch(e.target.value)}
                        placeholder="Untertitel durchsuchen..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={showIssueOnly}
                        onChange={(e) => setShowIssueOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      Nur Segmente mit Warnungen
                    </label>
                    <Button
                      type="button"
                      onClick={() => setShowFindReplace((prev) => !prev)}
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-slate-300 hover:bg-slate-50"
                    >
                      Suchen/Ersetzen
                    </Button>
                    <Button
                      type="button"
                      onClick={applyAutoFormat}
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-slate-300 hover:bg-slate-50"
                      title="Zeilenumbrüche automatisch nach gängigen Untertitel-Regeln setzen"
                    >
                      Auto-Format
                    </Button>
                    <Button
                      type="button"
                      onClick={applyRedaction}
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-slate-300 hover:bg-slate-50"
                      title="Ersetzt E-Mail, URL, IBAN und Telefon-ähnliche Muster"
                    >
                      Anonymisieren
                    </Button>
                    <div className="flex items-center gap-3 text-xs text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      <span>{issueSummary.fast} zu schnell</span>
                      <span>•</span>
                      <span>{issueSummary.long} zu lang</span>
                      <span>•</span>
                      <span>{issueSummary.short} zu kurz</span>
                    </div>
                  </div>

                  {showFindReplace && (
                    <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Suchen</label>
                          <input
                            type="text"
                            value={findText}
                            onChange={(e) => setFindText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") applyFindReplace();
                            }}
                            placeholder="z.B. ähm"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Ersetzen durch</label>
                          <input
                            type="text"
                            value={replaceText}
                            onChange={(e) => setReplaceText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") applyFindReplace();
                            }}
                            placeholder="leer lassen zum Entfernen"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
                          />
                        </div>
                        <div className="flex flex-col gap-3 md:w-[220px]">
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={replaceCaseSensitive}
                              onChange={(e) => setReplaceCaseSensitive(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            Groß/Klein beachten
                          </label>
                          <Button
                            type="button"
                            onClick={applyFindReplace}
                            disabled={!findText.trim()}
                            className="rounded-lg bg-slate-900 hover:bg-slate-800"
                          >
                            Alle ersetzen
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {workflow === "solution-demo" && (
                    <div className="mt-4 flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                      <label className="flex items-center gap-2 text-sm text-green-800">
                        <input
                          type="checkbox"
                          checked={subtitlesReviewed}
                          onChange={(e) => setSubtitlesReviewed(e.target.checked)}
                          className="h-4 w-4 rounded border-green-300 text-green-600 focus:ring-green-500"
                        />
                        Untertitel geprüft (für Kapitel-Export)
                      </label>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {filteredSegments.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-500">
                      Keine Segmente gefunden.
                    </div>
                  )}
                  {visibleSegments.map((segment) => {
                    const issue = segmentIssues.get(segment.index);
                    const hasIssue = issue?.tooFast || issue?.tooLong || issue?.tooShort;
                    const removedFromVideo = !!(segment as any).removeFromVideo;
                    return (
                    <div key={segment.index}>
                      {/* Segment Row */}
                      <div
                        className={`p-4 transition-colors group ${
                          removedFromVideo
                            ? "bg-red-50 hover:bg-red-50"
                            : (playingSegment === segment.index ? "bg-violet-50" : "hover:bg-slate-50")
                        } ${hasIssue ? "border-l-4 border-amber-400" : "border-l-4 border-transparent"}`}
                        onMouseEnter={() => setHoveredSegment(segment.index)}
                        onMouseLeave={() => setHoveredSegment(null)}
                      >
                        <div className="flex items-start gap-4">
                          <button
                            className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                              playingSegment === segment.index
                                ? "bg-violet-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                            onClick={() =>
                              playingSegment === segment.index
                                ? stopPlayback()
                                : playSegment(segment)
                            }
                          >
                            {playingSegment === segment.index ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">
                                {segment.startTime.replace(",", ".")}
                              </span>
                              <span className="text-slate-300">→</span>
                              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">
                                {segment.endTime.replace(",", ".")}
                              </span>
                              {removedFromVideo && (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded">
                                  <Trash2 className="w-3 h-3" />
                                  Aus Video entfernt
                                </span>
                              )}
                              {hasIssue && (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
                                  <AlertCircle className="w-3 h-3" />
                                  {issue?.tooFast && "zu schnell"}
                                  {issue?.tooFast && (issue?.tooLong || issue?.tooShort) && " · "}
                                  {issue?.tooLong && (
                                    issue?.tooManyLines || issue?.lineTooLong ? "Format" : "zu lang"
                                  )}
                                  {issue?.tooLong && issue?.tooShort && " · "}
                                  {issue?.tooShort && "zu kurz"}
                                </span>
                              )}
                            </div>
                            <textarea
                              value={segment.text}
                              onChange={(e) => updateSegmentText(segment.index, e.target.value)}
                              className="w-full bg-transparent border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm resize-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all"
                              rows={2}
                            />
                          </div>

                          <div className="mt-1 flex flex-col items-center gap-2 shrink-0">
                            <button
                              onClick={() => toggleRemoveFromVideo(segment.index)}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                removedFromVideo
                                  ? "bg-red-600 text-white hover:bg-red-700"
                                  : hoveredSegment === segment.index
                                    ? "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700"
                                    : "opacity-0"
                              }`}
                              title={removedFromVideo ? "Im Video behalten" : "Aus Video schneiden (Textschnitt)"}
                              aria-label={removedFromVideo ? "Segment wieder ins Video aufnehmen" : "Segment aus dem Video schneiden"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteSegmentAndRedistribute(segment.index)}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                hoveredSegment === segment.index || hasIssue
                                  ? "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
                                  : "opacity-0"
                              }`}
                              title="Segment löschen & Text verteilen"
                              aria-label="Segment löschen und Text verteilen"
                            >
                              <X className="w-4 h-4" />
                            </button>

                            {/* Chapter Break Button - visible on hover or if break is set */}
                            <button
                              onClick={() => toggleChapterBreak(segment.index)}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                chapterBreaks.includes(segment.index)
                                  ? "bg-purple-600 text-white"
                                  : hoveredSegment === segment.index
                                    ? "bg-slate-100 text-slate-600 hover:bg-purple-100 hover:text-purple-600"
                                    : "opacity-0"
                              }`}
                              title={chapterBreaks.includes(segment.index) ? "Kapitelgrenze entfernen" : "Hier Kapitel teilen"}
                            >
                              <Scissors className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Chapter Break Divider - show after segment if it's a break point */}
                      {chapterBreaks.includes(segment.index) && (
                        <div className="bg-gradient-to-r from-purple-50 via-purple-100 to-purple-50 px-4 py-3 border-y border-purple-200">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-purple-300" />
                            <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">
                              Kapitel {chapterBreaks.filter(b => b <= segment.index).length} Ende
                            </span>
                            <div className="flex-1 h-px bg-purple-300" />
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-purple-600">Titel:</span>
                            <input
                              type="text"
                              value={chapterTitles[segment.index] || ""}
                              onChange={(e) => updateChapterTitle(segment.index, e.target.value)}
                              placeholder={`Kapitel ${chapterBreaks.filter(b => b <= segment.index).length}`}
                              className="flex-1 text-sm bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                            />
                            <button
                              onClick={() => toggleChapterBreak(segment.index)}
                              className="p-1.5 text-purple-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Kapitelgrenze entfernen"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )})}
                </div>

                {visibleSegments.length < filteredSegments.length && (
                  <div className="p-4 border-t border-slate-100 text-center">
                    <Button
                      onClick={() => setVisibleSegmentCount((prev) => prev + 200)}
                      variant="outline"
                      className="rounded-lg border-slate-300"
                    >
                      Mehr anzeigen ({visibleSegments.length}/{filteredSegments.length})
                    </Button>
                  </div>
                )}

                {/* Text-based video editing (remove marked transcript segments) */}
                {srtSegments.length > 0 && (
                  <div className="p-6 border-t border-slate-100 bg-gradient-to-br from-red-50 to-amber-50">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <Trash2 className="w-5 h-5 text-red-700" />
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-900">Textschnitt (Video)</h3>
                          <p className="text-sm text-slate-600">
                            Markiere Segmente mit dem Papierkorb "Aus Video entfernen" und exportiere ein neues Video ohne diese Stellen.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={exportTextCutVideo}
                          disabled={isTextCutting || !selectedSessionFile || !selectedSessionFile.mimeType?.startsWith("video/")}
                          className="rounded-lg bg-red-700 hover:bg-red-800"
                          title={!selectedSessionFile?.mimeType?.startsWith("video/") ? "Bitte ein Session-Video auswählen" : undefined}
                        >
                          {isTextCutting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Export...
                            </>
                          ) : (
                            "Video exportieren"
                          )}
                        </Button>
                        {textCutResultFileId && (
                          <a
                            href="/tools/untertitel/videoschnitt"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Scissors className="w-4 h-4" />
                            Im Videoschnitt oeffnen
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-700">
                      Entfernt:{" "}
                      <span className="font-medium">
                        {srtSegments.filter((s) => !!(s as any).removeFromVideo).length}
                      </span>{" "}
                      Segmente
                      {" · "}
                      Hinweis: Funktioniert aktuell nur mit Session-Videos (Inputmodus "Session").
                    </div>
                  </div>
                )}

                {/* Chapter Suggestions */}
                {srtSegments.length > 0 && (
                  <div className="p-6 border-t border-slate-100 bg-gradient-to-br from-slate-50 to-purple-50">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Scissors className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-900">Kapitel (KI)</h3>
                          <p className="text-sm text-slate-600">
                            Vorschläge aus dem Transcript generieren und als Kapitelgrenzen übernehmen.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={suggestChaptersWithAi}
                        disabled={isSuggestingChapters}
                        className="rounded-lg bg-purple-600 hover:bg-purple-700"
                      >
                        {isSuggestingChapters ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Vorschlagen...
                          </>
                        ) : (
                          "Kapitel vorschlagen"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Chapter Splitting Section - only show when breaks exist or job is running */}
                {(chapterBreaks.length > 0 || chapterJob.job) && (
                  <div className="p-6 border-t border-slate-100 bg-gradient-to-br from-purple-50 to-blue-50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Scissors className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-900">Kapitel exportieren (mit Untertiteln)</h3>
                        <p className="text-sm text-slate-600">
                          {chapterBreaks.length + 1} Kapitel markiert · jedes Kapitel wird automatisch untertitelt
                        </p>
                      </div>
                    </div>

                    {/* Chapter Job Progress */}
                    {chapterJob.job && chapterJob.isLoading && (
                      <div className="p-4 bg-white rounded-lg border border-purple-200 mb-4">
                        <div className="flex items-center gap-3 mb-2">
                          <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                          <span className="text-sm font-medium text-slate-900">
                            {chapterJob.job.progress.stage || "Verarbeite..."}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-600 rounded-full transition-all duration-500"
                            style={{ width: `${chapterJob.job.progress.percent}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1 text-right">
                          {chapterJob.job.progress.percent}%
                        </p>
                      </div>
                    )}

                    {/* Completed - Download options */}
                    {chapterJob.job?.status === "completed" && (
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200 mb-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <span className="text-sm font-medium text-slate-900">
                              {chapterDownloadFiles.filter((file) => file.type === "video").length || chapterBreaks.length + 1} Kapitel fertig
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              onClick={downloadAllChapterVideos}
                              size="sm"
                              className="bg-slate-900 hover:bg-slate-800 rounded-lg"
                              disabled={isLoadingChapterFiles}
                            >
                              {isLoadingChapterFiles ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4 mr-2" />
                              )}
                              Kapitel einzeln laden
                            </Button>
                            <Button
                              onClick={downloadChaptersArchive}
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                            >
                              <Package className="w-4 h-4 mr-2" />
                              Archiv (optional)
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">
                          Empfohlen für DRV/Behördennetz: Einzeldownload statt Archiv.
                        </p>
                        {chapterDownloadFiles.length > 0 && (
                          <div className="mt-3 max-h-40 overflow-auto space-y-1">
                            {chapterDownloadFiles.map((file) => (
                              <button
                                key={file.name}
                                type="button"
                                onClick={() => downloadChapterFile(file)}
                                className="w-full text-left px-2 py-1 rounded hover:bg-white/70 text-xs text-slate-700 flex items-center justify-between"
                              >
                                <span className="truncate mr-2">{file.name}</span>
                                <span className="text-slate-500 whitespace-nowrap">{formatFileSize(file.size)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {chapterDownloadFiles.length === 0 && !isLoadingChapterFiles && (
                          <p className="text-xs text-slate-500 mt-2">
                            Dateiliste wird bei Klick auf "Kapitel einzeln laden" geladen.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {chapterJob.error && (
                      <div className="p-4 bg-red-50 rounded-lg border border-red-200 mb-4">
                        <p className="text-sm text-red-700">{chapterJob.error}</p>
                      </div>
                    )}

                    {/* Split Button - only show when not loading and no completed job */}
                    {!chapterJob.job && !chapterJob.isLoading && (
                      <>
                        <Button
                          onClick={splitVideoIntoChapters}
                          disabled={
                            chapterBreaks.length === 0 ||
                            !canExportChaptersFromVideo ||
                            (workflow === "solution-demo" && !subtitlesReviewed)
                          }
                          className="w-full h-12 bg-purple-600 hover:bg-purple-700 rounded-xl"
                        >
                          <Scissors className="w-5 h-5 mr-2" />
                          Kapitel als MP4 exportieren (max. 125 MB je Kapitel)
                        </Button>

                        {!canExportChaptersFromVideo && (
                          <p className="text-xs text-amber-600 mt-2 text-center">
                            Kapitelaufteilung nur für Videodateien verfügbar (Upload oder Session-Video).
                          </p>
                        )}
                        {workflow === "solution-demo" && !subtitlesReviewed && (
                          <p className="text-xs text-amber-600 mt-2 text-center">
                            Bitte Untertitel prüfen, bevor die Kapitel exportiert werden.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Embed Subtitles */}
        {activeStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="p-8">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Untertitel einbetten</h2>
                  <p className="text-slate-600">Video und Untertitel zusammenführen</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-8">
                  {/* Video Upload */}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept=".mp4,.mov,.avi,.mkv,.webm,video/*"
                    onChange={handleVideoSelect}
                    className="hidden"
                    aria-label="Videodatei auswählen"
                  />
                  <div
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      videoFile || (selectedSessionFile && selectedSessionFile.mimeType?.startsWith("video/"))
                        ? "border-green-300 bg-green-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => videoInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && videoInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label="Video hochladen"
                  >
                    {videoFile ? (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <p className="font-medium text-slate-900 truncate">{videoFile.name}</p>
                        <p className="text-sm text-slate-600">
                          {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    ) : selectedSessionFile && selectedSessionFile.mimeType?.startsWith("video/") ? (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <p className="font-medium text-slate-900 truncate">{selectedSessionFile.name}</p>
                        <p className="text-sm text-slate-600">
                          {formatFileSize(selectedSessionFile.size)}
                        </p>
                        <p className="text-xs text-slate-500">Aus Ihrer Session</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                          <Video className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">Video</p>
                        <p className="text-sm text-slate-600">MP4, MOV, AVI</p>
                      </div>
                    )}
                  </div>

                  {/* SRT Upload */}
                  <input
                    ref={srtInputRef}
                    type="file"
                    accept=".srt"
                    onChange={handleSrtSelect}
                    className="hidden"
                    aria-label="SRT-Untertiteldatei auswählen"
                  />
                  <div
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      srtFile
                        ? "border-green-300 bg-green-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => srtInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && srtInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label="SRT-Datei hochladen"
                  >
                    {srtFile ? (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <p className="font-medium text-slate-900 truncate">{srtFile.name}</p>
                        <p className="text-sm text-slate-600">
                          {(srtFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                          <FileText className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">Untertitel</p>
                        <p className="text-sm text-slate-600">SRT-Datei</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subtitle Type Selection */}
                <div className="mb-6">
                  <Label className="text-sm font-medium text-slate-700 mb-3 block">Einbettungsart</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleSubtitleTypeSelection("hardcoded")}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        subtitleType === "hardcoded"
                          ? "border-blue-600 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">Eingebrannt</div>
                      <div className="text-sm text-slate-600">Sicherste Variante (überall sichtbar)</div>
                    </button>
                    <button
                      onClick={() => handleSubtitleTypeSelection("soft")}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        subtitleType === "soft"
                          ? "border-blue-600 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">
                        Soft-Untertitel
                        {longVideoDetected && (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                            empfohlen
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-600">Ein-/ausschaltbar (Player muss es können)</div>
                    </button>
                  </div>
                  {longVideoDetected && subtitleType === "hardcoded" && (
                    <p className="text-xs text-amber-700 mt-2">
                      Hinweis: Eingebrannte Untertitel sind bei langen Videos deutlich langsamer als Soft-Untertitel.
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Tipp: Für Behörden-Player und PowerPoint-Exports ist „Eingebrannt“ meist die robusteste Wahl.
                  </p>
                </div>

                {/* Options (collapsed by default) */}
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowEmbedOptions((prev) => !prev)}
                    aria-expanded={showEmbedOptions}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <div className="text-left">
                      <p className="font-medium text-slate-900">Optionen (optional)</p>
                      <p className="text-sm text-slate-600">
                        Audio: {enhanceAudio ? "an" : "aus"}
                        {subtitleType === "hardcoded" ? ` · Gestaltung: ${subtitleStyle.useRecommended ? "empfohlen" : "manuell"}` : ""}
                        {embedNotifyEmail ? ` · E-Mail: ${embedNotifyEmail}` : ""}
                      </p>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showEmbedOptions ? "rotate-180" : ""}`} />
                  </button>

                  {showEmbedOptions && (
                    <div className="mt-3 space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      {/* Audio Optimization */}
                      <div>
                        <Label className="text-sm font-medium text-slate-700 mb-3 block">Audio-Optimierung</Label>
                        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200">
                              <Mic className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="text-left">
                              <p className="font-medium text-slate-900">Audio verbessern</p>
                              <p className="text-sm text-slate-600">Normalisiert die Lautheit (minimal länger)</p>
                            </div>
                          </div>
                          <Switch
                            checked={enhanceAudio}
                            onCheckedChange={setEnhanceAudio}
                            aria-label="Audio-Optimierung aktivieren"
                          />
                        </div>
                      </div>

                      {/* Subtitle Styling Options (only for hardcoded) */}
                      {subtitleType === "hardcoded" && (
                        <div className="space-y-4">
                          <Label className="text-sm font-medium text-slate-700 mb-3 block">Untertitel-Gestaltung</Label>

                          {/* Recommended Settings Button */}
                          <button
                            type="button"
                            onClick={toggleRecommendedStyle}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                              subtitleStyle.useRecommended
                                ? "border-green-500 bg-green-50"
                                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              subtitleStyle.useRecommended ? "bg-green-100" : "bg-slate-100"
                            }`}>
                              <Sparkles className={`w-5 h-5 ${subtitleStyle.useRecommended ? "text-green-600" : "text-slate-400"}`} />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-slate-900">
                                {subtitleStyle.useRecommended ? "Empfohlene Einstellungen aktiv" : "Empfohlene Einstellungen nutzen"}
                              </div>
                              <div className="text-sm text-slate-600">
                                {subtitleStyle.useRecommended
                                  ? "Optimiert für Barrierefreiheit"
                                  : "Optimiert für Barrierefreiheit (WCAG 2.1 AA)"}
                              </div>
                            </div>
                            {subtitleStyle.useRecommended && (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowStyleAdvanced((prev) => !prev)}
                            className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 rounded-xl transition-colors border border-slate-200"
                            aria-expanded={showStyleAdvanced || !subtitleStyle.useRecommended}
                          >
                            <div className="text-left">
                              <p className="font-medium text-slate-900">Erweiterte Einstellungen</p>
                              <p className="text-sm text-slate-600">
                                Schriftgröße, Farben, Deckkraft, Schriftart
                              </p>
                            </div>
                            <ChevronDown
                              className={`w-5 h-5 text-slate-400 transition-transform ${showStyleAdvanced || !subtitleStyle.useRecommended ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </button>

                          {(showStyleAdvanced || !subtitleStyle.useRecommended) && (
                            <div className="p-4 bg-white rounded-xl space-y-4 border border-slate-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-700">Feintuning</span>
                                {subtitleStyle.useRecommended && (
                                  <span className="text-xs text-slate-500">Deaktiviert bei „Empfohlen“</span>
                                )}
                              </div>

                              {/* Font Size */}
                              <div>
                                <label className="block text-sm text-slate-600 mb-2">
                                  Schriftgröße: <span className="font-medium text-slate-900">{subtitleStyle.fontSize}px</span>
                                </label>
                                <input
                                  type="range"
                                  min="16"
                                  max="48"
                                  value={subtitleStyle.fontSize}
                                  onChange={(e) => setSubtitleStyle(prev => ({
                                    ...prev,
                                    fontSize: parseInt(e.target.value),
                                    useRecommended: false
                                  }))}
                                  disabled={subtitleStyle.useRecommended}
                                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                                />
                                <div className="flex justify-between text-xs text-slate-400 mt-1">
                                  <span>Klein (16px)</span>
                                  <span>Groß (48px)</span>
                                </div>
                              </div>

                              {/* Color Pickers */}
                              <div className="grid grid-cols-2 gap-4">
                                {/* Font Color */}
                                <div>
                                  <label className="block text-sm text-slate-600 mb-2">Schriftfarbe</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={subtitleStyle.fontColor}
                                      onChange={(e) => setSubtitleStyle(prev => ({
                                        ...prev,
                                        fontColor: e.target.value,
                                        useRecommended: false
                                      }))}
                                      disabled={subtitleStyle.useRecommended}
                                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer disabled:opacity-50"
                                    />
                                    <input
                                      type="text"
                                      value={subtitleStyle.fontColor}
                                      onChange={(e) => setSubtitleStyle(prev => ({
                                        ...prev,
                                        fontColor: e.target.value,
                                        useRecommended: false
                                      }))}
                                      disabled={subtitleStyle.useRecommended}
                                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono disabled:opacity-50 disabled:bg-slate-100"
                                      placeholder="#FFFFFF"
                                    />
                                  </div>
                                </div>

                                {/* Background Color */}
                                <div>
                                  <label className="block text-sm text-slate-600 mb-2">Hintergrundfarbe</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={subtitleStyle.backgroundColor}
                                      onChange={(e) => setSubtitleStyle(prev => ({
                                        ...prev,
                                        backgroundColor: e.target.value,
                                        useRecommended: false
                                      }))}
                                      disabled={subtitleStyle.useRecommended}
                                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer disabled:opacity-50"
                                    />
                                    <input
                                      type="text"
                                      value={subtitleStyle.backgroundColor}
                                      onChange={(e) => setSubtitleStyle(prev => ({
                                        ...prev,
                                        backgroundColor: e.target.value,
                                        useRecommended: false
                                      }))}
                                      disabled={subtitleStyle.useRecommended}
                                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono disabled:opacity-50 disabled:bg-slate-100"
                                      placeholder="#000000"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Background Opacity */}
                              <div>
                                <label className="block text-sm text-slate-600 mb-2">
                                  Hintergrund-Deckkraft: <span className="font-medium text-slate-900">{subtitleStyle.backgroundOpacity}%</span>
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={subtitleStyle.backgroundOpacity}
                                  onChange={(e) => setSubtitleStyle(prev => ({
                                    ...prev,
                                    backgroundOpacity: parseInt(e.target.value),
                                    useRecommended: false
                                  }))}
                                  disabled={subtitleStyle.useRecommended}
                                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                                />
                              </div>

                              {/* Preview */}
                              <div className="mt-2 p-4 rounded-lg bg-slate-800 relative overflow-hidden">
                                <div className="text-xs text-slate-400 mb-2">Vorschau:</div>
                                <div
                                  className="inline-block px-2 py-1 rounded"
                                  style={{
                                    backgroundColor: `${subtitleStyle.backgroundColor}${Math.round(subtitleStyle.backgroundOpacity * 2.55).toString(16).padStart(2, '0')}`,
                                    color: subtitleStyle.fontColor,
                                    fontSize: `${Math.min(subtitleStyle.fontSize * 0.6, 20)}px`,
                                    fontFamily: 'Arial, sans-serif',
                                  }}
                                >
                                  Beispiel Untertiteltext
                                </div>
                              </div>

                              {/* Custom Font Upload */}
                              <div className="pt-4 border-t border-slate-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Type className="w-5 h-5 text-slate-400" />
                                    <div>
                                      <div className="text-sm font-medium text-slate-700">Eigene Schriftart</div>
                                      <div className="text-xs text-slate-600">Optional, Standard: Arial</div>
                                    </div>
                                  </div>
                                  <input
                                    ref={fontInputRef}
                                    type="file"
                                    accept=".ttf,.otf,.woff,.woff2"
                                    onChange={handleFontSelect}
                                    className="hidden"
                                    aria-label="Schriftart-Datei auswählen"
                                  />
                                  <button
                                    type="button"
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                      fontFile
                                        ? "bg-green-100 text-green-700"
                                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                    onClick={() => fontInputRef.current?.click()}
                                    aria-label={fontFile ? `Ausgewählte Schriftart: ${fontFile.name}` : "Eigene Schriftart auswählen"}
                                  >
                                    {fontFile ? (
                                      <span className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" />
                                        {fontFile.name}
                                      </span>
                                    ) : (
                                      "Schriftart wählen"
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Email Notification for Embedding */}
                      <div>
                        <Label className="text-sm font-medium text-slate-700 mb-3 block">Benachrichtigung</Label>
                        <button
                          type="button"
                          onClick={() => setShowEmbedEmailInput(!showEmbedEmailInput)}
                          className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 rounded-xl transition-colors border border-slate-200"
                        >
                          <div className="text-left">
                            <p className="font-medium text-slate-900">E-Mail (optional)</p>
                            <p className="text-sm text-slate-600">
                              {embedNotifyEmail ? `Benachrichtigung an ${embedNotifyEmail}` : "Bei langen Videos per E-Mail informiert werden"}
                            </p>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showEmbedEmailInput ? "rotate-180" : ""}`} />
                        </button>

                        {showEmbedEmailInput && (
                          <div className="mt-3 p-4 bg-white rounded-xl space-y-3 border border-slate-200">
                            <p className="text-sm text-slate-600">
                              Das Einbetten kann bei längeren Videos mehrere Minuten dauern.
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="email"
                                value={embedNotifyEmail}
                                onChange={(e) => setEmbedNotifyEmail(e.target.value)}
                                placeholder="ihre@email.de"
                                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                              />
                              {embedNotifyEmail && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEmbedNotifyEmail("")}
                                  className="px-3"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Async Embed Progress */}
                {embedJob && (
                  <div className="mb-6 p-4 bg-violet-50 rounded-xl border border-violet-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
                      <span className="text-sm font-medium text-slate-900">
                        {embedJob.progress.stage === 'queued' && 'In Warteschlange...'}
                        {embedJob.progress.stage === 'preparing' && 'Dateien werden vorbereitet...'}
                        {embedJob.progress.stage === 'converting' && 'Konvertiere Video...'}
                        {embedJob.progress.stage === 'embedding' && 'Untertitel werden eingebettet...'}
                        {embedJob.progress.stage === 'done' && 'Fertig'}
                        {!embedJob.progress.stage && 'Wird verarbeitet...'}
                      </span>
                    </div>
                    <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-600 rounded-full transition-all duration-500"
                        style={{ width: `${embedJob.progress.percent || 5}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 text-right">
                      {embedJob.progress.percent || 0}%
                    </p>
                    {embedPosition !== null && (
                      <div className="mt-3">
                        <QueuePositionDisplay
                          position={embedPosition}
                          estimatedWait={embedWait}
                          isProcessing={embedProcessing}
                        />
                      </div>
                    )}
                  </div>
                )}

                {(embedJob?.status === "completed" || embedCompletedJobId) && (
                  <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-green-800 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Finale Datei ist bereit
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={downloadCompletedEmbedResult}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 rounded-lg"
                        >
                          Finales Video herunterladen
                        </Button>
                        {embedJob && (
                          <Button
                            onClick={() => {
                              resetEmbedJob();
                              setEmbedCompletedJobId(null);
                            }}
                            size="sm"
                            variant="outline"
                            className="rounded-lg"
                          >
                            Neuer Job
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                {isEmbedding && (
                  <div className="mb-6">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-600 rounded-full transition-all duration-500"
                        style={{ width: `${embedProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-600 mt-2 text-center">
                      Verarbeite Video... {embedProgress}%
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleEmbedSubtitles}
                  disabled={
                    (!videoFile && !(selectedSessionFile && selectedSessionFile.mimeType?.startsWith("video/"))) ||
                    (!srtFile && srtSegments.length === 0) ||
                    isEmbedding ||
                    (embedJob?.status !== "completed" && !!embedJob)
                  }
                  className="w-full h-14 text-base font-medium rounded-xl bg-violet-600 hover:bg-violet-700 transition-all disabled:opacity-50"
                >
                  {isEmbedding || embedJob ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Wird verarbeitet...</span>
                    </div>
                  ) : (
                    <span>
                      {subtitleType === "hardcoded"
                        ? "Video mit eingebrannten Untertiteln erstellen"
                        : "Video mit Soft-Untertiteln erstellen"}
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Legal Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-6 border border-violet-100">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900 mb-1">Gesetzliche Anforderungen erfüllen</h3>
                  <p className="text-sm text-slate-600">
                    Öffentliche Stellen sind nach <strong>BITV 2.0</strong> und der <strong>EU-Richtlinie 2016/2102</strong> verpflichtet,
                    Videos barrierefrei zugänglich zu machen. Untertitel sind dabei eine zentrale Anforderung.
                  </p>
                </div>
              </div>
            </div>

            {/* Coming Soon Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                  Demnächst
                </div>
                <h3 className="font-medium text-slate-900">Weitere Barrierefreiheits-Tools</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">PPTX → Barrierefreies PDF</p>
                    <p className="text-xs text-slate-600">Tagged PDF mit Leserreihenfolge</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Word → Barrierefreies PDF</p>
                    <p className="text-xs text-slate-600">Strukturierte Dokumente</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Video className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Audiodeskription</p>
                    <p className="text-xs text-slate-600">KI-generierte Bildbeschreibungen</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Leichte Sprache</p>
                    <p className="text-xs text-slate-600">Texte automatisch vereinfachen</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-200/50">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Deutsche Server. Keine Cloud.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowDatenschutz(true)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Datenschutz
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setShowImpressum(true)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Impressum
            </button>
          </div>
        </div>
      </footer>

      {/* Impressum Modal */}
      {showImpressum && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="impressum-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowImpressum(false)}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 id="impressum-title" className="text-xl font-semibold text-slate-900">Impressum</h2>
              <button
                onClick={() => setShowImpressum(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                aria-label="Impressum schließen"
              >
                <X className="w-4 h-4 text-slate-600" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-6 text-slate-600">
                <section>
                  <h3 className="font-semibold text-slate-900 mb-2">Angaben gemäß § 5 TMG</h3>
                  <p>
                    David Wegener Marketing Consulting GmbH<br />
                    Stockmeyerstraße 43<br />
                    20457 Hamburg
                  </p>
                  <p className="mt-2">
                    Handelsregister: HRB 191989<br />
                    Umsatzsteuer-ID: DE454929926
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 mb-2">Kontakt</h3>
                  <p>
                    Telefon: +49 176 10401247<br />
                    E-Mail: mail@wegener-gmbh.com
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 mb-2">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h3>
                  <p>
                    David Wegener<br />
                    Stockmeyerstraße 43<br />
                    20457 Hamburg
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 mb-2">Haftungsausschluss</h3>
                  <p className="text-sm leading-relaxed">
                    Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt.
                    Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte
                    können wir jedoch keine Gewähr übernehmen.
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 mb-2">Datenschutz</h3>
                  <p className="text-sm leading-relaxed">
                    Diese Anwendung verarbeitet alle Daten lokal auf Ihrem Server.
                    Es werden keine personenbezogenen Daten an Dritte übertragen.
                    Die Audiodateien werden nur temporär verarbeitet und anschließend gelöscht.
                  </p>
                </section>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <Button
                onClick={() => setShowImpressum(false)}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800"
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Datenschutzerklärung Modal */}
      {showDatenschutz && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="datenschutz-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDatenschutz(false)}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 id="datenschutz-title" className="text-xl font-semibold text-slate-900">Datenschutzerklärung</h2>
              <button
                onClick={() => setShowDatenschutz(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                aria-label="Datenschutzerklärung schließen"
              >
                <X className="w-4 h-4 text-slate-600" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[65vh]">
              <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">1. Verantwortlicher</h3>
                  <p>
                    Verantwortlicher für die Datenverarbeitung auf dieser Website ist:<br /><br />
                    David Wegener Marketing Consulting GmbH<br />
                    Stockmeyerstraße 43<br />
                    20457 Hamburg<br />
                    E-Mail: mail@wegener-gmbh.com
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">2. Grundsatz der lokalen Verarbeitung</h3>
                  {whisperMode === "openai" ? (
                    <p>
                      Diese Anwendung kann im Cloud-Modus betrieben werden. In diesem Modus werden Audiodaten zur Transkription an
                      OpenAI in den USA übertragen. Der Start der Cloud-Verarbeitung ist nur nach Ihrer ausdrücklichen Zustimmung möglich.
                    </p>
                  ) : (
                    <p>
                      Diese Anwendung wurde nach dem Prinzip der <strong>Datensparsamkeit</strong> und
                      <strong> Privacy by Design</strong> entwickelt. Alle Datenverarbeitungen finden
                      ausschließlich lokal auf dem Server des Betreibers statt. Es werden keine Daten
                      an externe Dienste, Cloud-Anbieter oder Dritte übertragen.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">3. Welche Daten werden verarbeitet?</h3>
                  <p className="mb-2">Bei der Nutzung dieser Anwendung werden folgende Daten verarbeitet:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Audio-/Videodateien:</strong> Werden temporär zur Transkription verarbeitet</li>
                    <li><strong>SRT-Untertiteldateien:</strong> Werden temporär zur Einbettung verarbeitet</li>
                    <li><strong>Schriftartdateien:</strong> Werden temporär für die Untertitel-Formatierung verwendet</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">4. Automatische Löschung</h3>
                  <p>
                    Alle hochgeladenen Dateien werden <strong>automatisch und unwiderruflich gelöscht</strong>:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                    <li>Sofort nach Abschluss der Verarbeitung auf dem Server</li>
                    <li>Beim Schließen oder Verlassen der Webseite im Browser</li>
                    <li>Es erfolgt keine dauerhafte Speicherung</li>
                    <li>Es werden keine Backups erstellt</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">5. Keine Weitergabe an Dritte</h3>
                  {whisperMode === "openai" ? (
                    <p>
                      Wenn Cloud-Verarbeitung aktiviert ist, werden Audiodaten zur Transkription an OpenAI (USA) übertragen.
                      Dies passiert nur, wenn Sie vor Start der Verarbeitung aktiv zustimmen.
                    </p>
                  ) : (
                    <p>
                      Ihre Daten werden zu keinem Zeitpunkt an Dritte weitergegeben. Die Transkription
                      erfolgt durch eine lokale KI (Whisper), die auf unserem eigenen Server läuft.
                      Es besteht keine Verbindung zu OpenAI, Google, Amazon oder anderen Cloud-Diensten.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">6. Keine Tracking-Cookies & kein Tracking</h3>
                  <p>Diese Anwendung verwendet:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                    <li>Keine Tracking-Cookies</li>
                    <li>Keine Tracking-Pixel</li>
                    <li>Keine Analytics-Dienste</li>
                    <li>Keine Werbung</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">7. Server-Logs</h3>
                  <p>
                    Der Server protokolliert aus technischen Gründen Zugriffe. Diese Logs enthalten
                    <strong> keine personenbezogenen Daten</strong> und keine Dateinamen. Die Logs
                    werden ausschließlich zur Fehleranalyse verwendet und regelmäßig gelöscht.
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">8. Ihre Rechte</h3>
                  <p className="mb-2">Sie haben folgende Rechte bezüglich Ihrer Daten:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
                    <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
                    <li>Recht auf Löschung (Art. 17 DSGVO)</li>
                    <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
                    <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
                    <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
                  </ul>
                  <p className="mt-2">
                    Da keine personenbezogenen Daten gespeichert werden, sind diese Rechte in der
                    Praxis bereits durch das Design der Anwendung erfüllt.
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">9. Beschwerderecht</h3>
                  <p>
                    Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
                    Die für uns zuständige Aufsichtsbehörde ist:<br /><br />
                    Der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit<br />
                    Ludwig-Erhard-Str. 22, 20459 Hamburg
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-900 text-base mb-3">10. Änderungen</h3>
                  <p>
                    Diese Datenschutzerklärung kann gelegentlich aktualisiert werden. Die aktuelle
                    Version ist stets auf dieser Seite verfügbar.
                  </p>
                  <p className="mt-2 text-slate-400">
                    Stand: Januar 2026
                  </p>
                </section>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <Button
                onClick={() => setShowDatenschutz(false)}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800"
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
