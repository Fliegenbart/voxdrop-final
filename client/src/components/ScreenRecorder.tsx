import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Monitor, Mic, MicOff, Circle, Square, Pause, Play,
  Download, FileAudio, CheckCircle2, AlertCircle, Loader2, FileVideo, Subtitles, Scissors, Cloud
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useJob, useAsyncJobsAvailable, useSSEAvailable } from "@/hooks/use-job";
import { QueuePositionDisplay, useJobPosition } from "@/components/QueueStatus";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget, type StorageTarget } from "@/hooks/use-storage-target";

// Auto-chunking configuration
const DEFAULT_CHUNK_SIZE_MB = 12;
const MIN_CHUNK_SIZE_MB = 5;
const MAX_CHUNK_DURATION_SECONDS = 10;
const UPLOAD_LIMIT_STORAGE_KEY = "voxdrop_upload_limit";
const RAW_UPLOAD_BLOCKED_STORAGE_KEY = "voxdrop_raw_chunk_upload_blocked";

interface UploadLimit {
  maxSuccess: number; // MB - largest successful upload
  firstFailure: number | null; // MB - smallest failed upload
  lastUpdated: number;
}

function getUploadLimit(): number {
  try {
    const stored = localStorage.getItem(UPLOAD_LIMIT_STORAGE_KEY);
    if (stored) {
      const limit: UploadLimit = JSON.parse(stored);
      // Use 80% of first failure or default
      if (limit.firstFailure) {
        return Math.max(MIN_CHUNK_SIZE_MB, Math.floor(limit.firstFailure * 0.8));
      }
      // If we have successful uploads, use that as baseline
      if (limit.maxSuccess > DEFAULT_CHUNK_SIZE_MB) {
        return limit.maxSuccess;
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_CHUNK_SIZE_MB;
}

function recordUploadSuccess(sizeMB: number) {
  try {
    const stored = localStorage.getItem(UPLOAD_LIMIT_STORAGE_KEY);
    const limit: UploadLimit = stored
      ? JSON.parse(stored)
      : { maxSuccess: 0, firstFailure: null, lastUpdated: Date.now() };

    if (sizeMB > limit.maxSuccess) {
      limit.maxSuccess = sizeMB;
      limit.lastUpdated = Date.now();
      localStorage.setItem(UPLOAD_LIMIT_STORAGE_KEY, JSON.stringify(limit));
    }
  } catch {
    // Ignore localStorage errors
  }
}

function recordUploadFailure(sizeMB: number) {
  try {
    const stored = localStorage.getItem(UPLOAD_LIMIT_STORAGE_KEY);
    const limit: UploadLimit = stored
      ? JSON.parse(stored)
      : { maxSuccess: 0, firstFailure: null, lastUpdated: Date.now() };

    if (!limit.firstFailure || sizeMB < limit.firstFailure) {
      limit.firstFailure = sizeMB;
      limit.lastUpdated = Date.now();
      localStorage.setItem(UPLOAD_LIMIT_STORAGE_KEY, JSON.stringify(limit));
      console.log(`[AutoChunk] Upload limit learned: ${sizeMB}MB failed, will chunk at ${Math.floor(sizeMB * 0.8)}MB`);
    }
  } catch {
    // Ignore localStorage errors
  }
}

function getRememberedRawUploadBlocked(): boolean {
  try {
    return localStorage.getItem(RAW_UPLOAD_BLOCKED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberRawUploadBlocked() {
  try {
    localStorage.setItem(RAW_UPLOAD_BLOCKED_STORAGE_KEY, "1");
  } catch {
    // Ignore localStorage errors
  }
}

function clearRememberedRawUploadBlocked() {
  try {
    localStorage.removeItem(RAW_UPLOAD_BLOCKED_STORAGE_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

export interface ChunkInfo {
  sessionId: string;
  chunkIndex: number;
  chunkId: string;
  startTime: number;
  endTime: number;
  sizeMB: number;
}

export interface ScreenRecorderRestoreState {
  sessionId: string;
  uploadedChunks: ChunkInfo[];
  durationSeconds: number;
  isComplete: boolean;
}

interface ScreenRecorderProps {
  onRecordingComplete: (file: File) => void;
  onVideoForSubtitles?: (file: File) => void;
  onChapterMark?: (timestampSeconds: number) => void;
  onChunkUploaded?: (chunk: ChunkInfo) => void;
  onSessionReady?: (sessionId: string) => void;
  onDurationChange?: (seconds: number) => void;
  chapterCount?: number;
  storageTarget?: StorageTarget;
  onStorageTargetChange?: (target: StorageTarget) => void;
  showStoragePicker?: boolean;
  enableAutoChunking?: boolean;
  /**
   * If true, automatically upload the finished recording to /api/recordings (24h storage).
   * Some pages (e.g. Videoschnitt) may want to keep everything in the session instead.
   */
  autoSaveToServer?: boolean;
  /**
   * Label + icon for the primary action that calls `onRecordingComplete`.
   * Defaults are tuned for the Untertitel tool.
   */
  primaryActionLabel?: string;
  primaryActionIcon?: 'audio' | 'video';
  primaryActionDisabled?: boolean;
  restoreState?: ScreenRecorderRestoreState | null;
}

export function ScreenRecorder({
  onRecordingComplete,
  onVideoForSubtitles,
  onChapterMark,
  onChunkUploaded,
  onSessionReady,
  onDurationChange,
  chapterCount,
  storageTarget,
  onStorageTargetChange,
  showStoragePicker,
  enableAutoChunking = true,
  autoSaveToServer = true,
  primaryActionLabel = "Transkribieren",
  primaryActionIcon = "audio",
  primaryActionDisabled = false,
  restoreState = null,
}: ScreenRecorderProps) {
  const { isAuthenticated, user } = useAuth();
  const [status, setStatus] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const initialDuration = Math.max(0, Math.round(restoreState?.durationSeconds || 0));
  const [duration, setDuration] = useState(initialDuration);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [includeMicrophone, setIncludeMicrophone] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [savedToServer, setSavedToServer] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const { target: internalTarget, setTarget: setInternalTarget } = useStorageTarget("screen-recorder");
  const effectiveTarget = storageTarget || internalTarget;
  const setEffectiveTarget = onStorageTargetChange || setInternalTarget;

  // Auto-chunking state
  const initialSessionId = restoreState?.sessionId || crypto.randomUUID();
  const [, setChunkSessionIdState] = useState(initialSessionId);
  const chunkSessionIdRef = useRef(initialSessionId);
  const [uploadedChunks, setUploadedChunks] = useState<ChunkInfo[]>(restoreState?.uploadedChunks || []);
  const [isUploadingChunk, setIsUploadingChunk] = useState(false);
  const [currentChunkSize, setCurrentChunkSize] = useState(0);
  const chunkIndexRef = useRef(
    restoreState?.uploadedChunks.reduce((max, chunk) => Math.max(max, chunk.chunkIndex + 1), 0) || 0
  );
  const chunkStartTimeRef = useRef(initialDuration);
  const pendingChunksRef = useRef<Blob[]>([]);
  const chapterFlushRequestedRef = useRef(false);
  const rawUploadFailedRef = useRef(getRememberedRawUploadBlocked());
  const uploadLimitMB = getUploadLimit();
  const mimeTypeRef = useRef<string>("video/webm");
  const durationRef = useRef(initialDuration);
  const appliedRestoreSessionRef = useRef<string | null>(restoreState?.sessionId || null);
  const resumedRecordingRef = useRef(false);

  const setChunkSessionId = useCallback((nextSessionId: string) => {
    chunkSessionIdRef.current = nextSessionId;
    setChunkSessionIdState(nextSessionId);
  }, []);

  // Upload a chunk to the server
  const uploadChunk = useCallback(async (
    chunkBlob: Blob,
    chunkIndex: number,
    startTime: number,
    endTime: number,
    isFinal: boolean = false
  ): Promise<string | null> => {
    const sizeMB = chunkBlob.size / 1024 / 1024;
    console.log(`[AutoChunk] Uploading chunk ${chunkIndex} (${sizeMB.toFixed(1)}MB, ${startTime}s-${endTime}s, final=${isFinal})`);

    setIsUploadingChunk(true);
    try {
      // Prefer proxy-friendly raw upload (content-length known, no multipart boundaries).
      // Corporate proxies sometimes block multipart/form-data "chunked uploads" for video/webm.
      const params = new URLSearchParams({
        sessionId: chunkSessionIdRef.current,
        chunkIndex: String(chunkIndex),
        startTime: String(startTime),
        endTime: String(endTime),
        isFinal: String(isFinal),
        storageScope: effectiveTarget.scope,
      });
      if (effectiveTarget.scope === "workspace") {
        if (effectiveTarget.workspaceId) params.set("workspaceId", effectiveTarget.workspaceId);
        if (effectiveTarget.projectId) params.set("projectId", effectiveTarget.projectId);
      }

      const uploadMultipartFallback = async () => {
        const formData = new FormData();
        const chunkMimeType = chunkBlob.type && chunkBlob.type.trim().length > 0 ? chunkBlob.type : "video/webm";
        const file = new File([chunkBlob], `chunk-${chunkIndex}.webm`, { type: chunkMimeType });
        formData.append("file", file);
        formData.append("mimeType", chunkMimeType);
        formData.append("sessionId", chunkSessionIdRef.current);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("startTime", String(startTime));
        formData.append("endTime", String(endTime));
        formData.append("isFinal", String(isFinal));
        formData.append("storageScope", effectiveTarget.scope);
        if (effectiveTarget.scope === "workspace") {
          if (effectiveTarget.workspaceId) formData.append("workspaceId", effectiveTarget.workspaceId);
          if (effectiveTarget.projectId) formData.append("projectId", effectiveTarget.projectId);
        }
        return fetch("/api/recordings/chunk", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
      };

      let response: Response;
      let usedRawUpload = false;

      // If raw upload failed before (e.g. corporate proxy blocking binary),
      // skip raw and go straight to multipart for all subsequent chunks.
      if (rawUploadFailedRef.current) {
        response = await uploadMultipartFallback();
      } else {
        usedRawUpload = true;
        const contentType = chunkBlob.type && chunkBlob.type.trim().length > 0
          ? chunkBlob.type
          : (mimeTypeRef.current || "video/webm");
        params.set("mimeType", contentType);
        response = await fetch(`/api/recordings/chunk-raw?${params.toString()}`, {
          method: "POST",
          body: chunkBlob,
          credentials: "include",
          headers: {
            // Corporate proxies/WAFs can reject uploads when media type is ambiguous.
            // Use the recorder's declared MIME type when available.
            "Content-Type": contentType,
            "X-Voxdrop-Media-Type": contentType,
          },
        });

        const shouldFallbackToMultipart = (
          response.status === 400 ||
          response.status === 403 ||
          response.status === 404 ||
          response.status === 405 ||
          response.status === 413 ||
          response.status === 415 ||
          response.status === 429 ||
          response.status >= 500
        );

        // Corporate proxies can return 403/413 before the request reaches the app.
        // Multipart often passes in those environments, so retry once via fallback endpoint.
        if (!response.ok && shouldFallbackToMultipart) {
          rawUploadFailedRef.current = true;
          rememberRawUploadBlocked();
          console.log("[AutoChunk] Raw upload blocked, switching to multipart for all future chunks");
          usedRawUpload = false;
          response = await uploadMultipartFallback();
        }
      }

      if (response.ok) {
        if (usedRawUpload) {
          rawUploadFailedRef.current = false;
          clearRememberedRawUploadBlocked();
        }
        const data = await response.json();
        const chunkId = data.chunkId;
        recordUploadSuccess(sizeMB);

        const chunkInfo: ChunkInfo = {
          sessionId: chunkSessionIdRef.current,
          chunkIndex,
          chunkId,
          startTime,
          endTime,
          sizeMB,
        };
        setUploadedChunks((prev: ChunkInfo[]) => [...prev, chunkInfo]);
        onChunkUploaded?.(chunkInfo);

        console.log(`[AutoChunk] Chunk ${chunkIndex} uploaded successfully: ${chunkId}`);
        return chunkId;
      } else {
        let errorText = "";
        const errorData = await response.json().catch(async () => {
          errorText = await response.text().catch(() => "");
          return {};
        });
        const errorMessage =
          (errorData as any)?.error ||
          (errorData as any)?.message ||
          errorText ||
          `HTTP ${response.status}`;
        console.error(`[AutoChunk] Chunk upload failed (${response.status}):`, errorMessage);

        // Typical proxy edge failures for large uploads.
        if (
          response.status === 403 ||
          response.status === 413 ||
          response.status === 429 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          recordUploadFailure(sizeMB);
        }
        return null;
      }
    } catch (err) {
      console.error(`[AutoChunk] Chunk upload error:`, err);
      // Network errors might indicate proxy limits
      recordUploadFailure(sizeMB);
      return null;
    } finally {
      setIsUploadingChunk(false);
    }
  }, [effectiveTarget, onChunkUploaded]);

  // Flush current chunks to server
  const flushChunks = useCallback(async (isFinal: boolean = false) => {
    if (pendingChunksRef.current.length === 0) return;

    const chunkBlob = new Blob(pendingChunksRef.current, { type: mimeTypeRef.current });
    const chunkIndex = chunkIndexRef.current;
    const startTime = chunkStartTimeRef.current;
    const endTime = durationRef.current;

    // Clear pending chunks and prepare for next chunk
    pendingChunksRef.current = [];
    chunkIndexRef.current += 1;
    chunkStartTimeRef.current = endTime;
    setCurrentChunkSize(0);

    // Upload in background
    await uploadChunk(chunkBlob, chunkIndex, startTime, endTime, isFinal);
  }, [uploadChunk]);

  // Ref to always get the latest flushChunks (avoids stale closure in ondataavailable)
  const flushChunksRef = useRef(flushChunks);
  useEffect(() => { flushChunksRef.current = flushChunks; }, [flushChunks]);

  // Async job queue hook for video conversion
  const { available: asyncAvailable } = useAsyncJobsAvailable();
  // Check if SSE works (may be blocked by CSP on corporate browsers)
  const { sseAvailable } = useSSEAvailable(isAuthenticated);
  const {
    job: conversionJob,
    submitJob,
    downloadResult,
    reset: resetJob,
  } = useJob({
    onComplete: async () => {
      // Auto-download when job completes
      await downloadResult(`aufnahme-${Date.now()}.mp4`);
      setIsConverting(false);
      resetJob();
    },
    onError: (err) => {
      setError("MP4-Konvertierung fehlgeschlagen: " + err);
      setIsConverting(false);
    },
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { position, estimatedWait, isProcessing } = useJobPosition(
    "video",
    conversionJob?.id ?? null,
    isAuthenticated
  );

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (user?.email) {
      setNotifyEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!restoreState) {
      appliedRestoreSessionRef.current = null;
      return;
    }
    if (appliedRestoreSessionRef.current === restoreState.sessionId) return;
    if (status === "recording" || status === "paused") return;

    const nextDuration = Math.max(0, Math.round(restoreState.durationSeconds || 0));
    appliedRestoreSessionRef.current = restoreState.sessionId;
    resumedRecordingRef.current = false;
    setChunkSessionId(restoreState.sessionId);
    setUploadedChunks(restoreState.uploadedChunks || []);
    setCurrentChunkSize(0);
    setRecordedBlob(null);
    setSavedToServer(false);
    setError(null);
    setStatus("idle");
    setDuration(nextDuration);
    durationRef.current = nextDuration;
    chunkIndexRef.current = (restoreState.uploadedChunks || []).reduce(
      (max, chunk) => Math.max(max, chunk.chunkIndex + 1),
      0
    );
    chunkStartTimeRef.current = nextDuration;
    pendingChunksRef.current = [];
    onDurationChange?.(nextDuration);
  }, [onDurationChange, restoreState, setChunkSessionId, status]);

  // Format duration as HH:MM:SS
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Auto-save recording to server for logged-in users (24h storage)
  const saveRecordingToServer = useCallback(async (blob?: Blob) => {
    const targetBlob = blob || recordedBlob;
    if (!targetBlob || !isAuthenticated || savedToServer) return;

    try {
      if (enableAutoChunking) {
        const chunkSaveResponse = await fetch(`/api/recordings/chunk/${chunkSessionIdRef.current}/save`, {
          method: "POST",
          credentials: "include",
        });
        if (chunkSaveResponse.ok) {
          setSavedToServer(true);
          return;
        }

        let message = "Aufnahme konnte nicht aus den Chunks gespeichert werden.";
        try {
          const data = await chunkSaveResponse.json();
          if (data?.error) {
            message = data.error;
          } else if (data?.message) {
            message = data.message;
          }
        } catch {
          // ignore parse errors
        }
        setError(message);
        return;
      }

      const formData = new FormData();
      const blobMimeType = targetBlob.type && targetBlob.type.trim().length > 0
        ? targetBlob.type
        : (mimeTypeRef.current || "video/webm");
      const file = new File([targetBlob], `aufnahme-${Date.now()}.webm`, {
        type: blobMimeType
      });
      formData.append('file', file);
      formData.append('duration', String(duration));
      formData.append('storageScope', effectiveTarget.scope);
      if (effectiveTarget.scope === 'workspace') {
        if (effectiveTarget.workspaceId) {
          formData.append('workspaceId', effectiveTarget.workspaceId);
        }
        if (effectiveTarget.projectId) {
          formData.append('projectId', effectiveTarget.projectId);
        }
      }

      const response = await fetch('/api/recordings', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        setSavedToServer(true);
      } else {
        let message = "Aufnahme konnte nicht gespeichert werden.";
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          } else if (data?.message) {
            message = data.message;
          }
        } catch {
          // ignore parse errors
        }
        setError(message);
      }
    } catch (err) {
      console.warn('Aufnahme konnte nicht gespeichert werden:', err);
      setError("Aufnahme konnte nicht gespeichert werden.");
    }
  }, [recordedBlob, isAuthenticated, duration, savedToServer, effectiveTarget, enableAutoChunking]);

  // Start recording
  const stopRecording = useCallback((reason: "user" | "display-ended" = "user") => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (reason === "display-ended") {
      setError((current) => current ?? "Bildschirmfreigabe beendet. Aufnahme wird gesichert...");
    }

    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];
      const shouldResumeSession =
        !!restoreState &&
        !restoreState.isComplete &&
        status === "idle" &&
        !recordedBlob &&
        uploadedChunks.length > 0;
      const activeSessionId = shouldResumeSession ? chunkSessionIdRef.current : crypto.randomUUID();

      resumedRecordingRef.current = shouldResumeSession;
      if (shouldResumeSession) {
        chunkIndexRef.current = uploadedChunks.reduce((max, chunk) => Math.max(max, chunk.chunkIndex + 1), 0);
        chunkStartTimeRef.current = durationRef.current;
      } else {
        const startingDuration = 0;
        setChunkSessionId(activeSessionId);
        appliedRestoreSessionRef.current = activeSessionId;
        chunkIndexRef.current = 0;
        chunkStartTimeRef.current = 0;
        pendingChunksRef.current = [];
        setCurrentChunkSize(0);
        setUploadedChunks([]);
        setDuration(startingDuration);
        durationRef.current = startingDuration;
        onDurationChange?.(startingDuration);
      }
      pendingChunksRef.current = [];
      setCurrentChunkSize(0);

      // Get display media (screen/window/tab)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: includeSystemAudio
      });

      let combinedStream = displayStream;

      // Add microphone if enabled
      if (includeMicrophone) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });

          // Combine streams using AudioContext
          const audioContext = new AudioContext();
          const destination = audioContext.createMediaStreamDestination();

          // Add display audio tracks if available
          if (displayStream.getAudioTracks().length > 0) {
            const displayAudioSource = audioContext.createMediaStreamSource(
              new MediaStream(displayStream.getAudioTracks())
            );
            displayAudioSource.connect(destination);
          }

          // Add microphone audio
          const micSource = audioContext.createMediaStreamSource(micStream);
          micSource.connect(destination);

          // Create combined stream with video from display and mixed audio
          combinedStream = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
          ]);

          // Keep reference to mic stream for cleanup
          micStream.getTracks().forEach(track => {
            combinedStream.addTrack(track);
          });
        } catch (micError) {
          console.warn("Mikrofon nicht verfügbar:", micError);
          // Continue without microphone
        }
      }

      streamRef.current = combinedStream;

      // Handle stream ending (user clicks "Stop sharing")
      displayStream.getVideoTracks()[0].onended = () => {
        stopRecording("display-ended");
      };

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 5000000 // 5 Mbps
      });

      // Store mimeType for chunk creation
      mimeTypeRef.current = mimeType;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);

          // Auto-chunking: also track in pending chunks
          if (enableAutoChunking && isAuthenticated) {
            pendingChunksRef.current.push(event.data);
            const newSize = pendingChunksRef.current.reduce((acc: number, c: Blob) => acc + c.size, 0);
            const newSizeMB = newSize / 1024 / 1024;
            setCurrentChunkSize(newSizeMB);
            const bufferedDuration = Math.max(0, durationRef.current - chunkStartTimeRef.current);

            // Check if we need to flush
            if (newSizeMB >= uploadLimitMB) {
              console.log(`[AutoChunk] Size limit reached (${newSizeMB.toFixed(1)}MB >= ${uploadLimitMB}MB), flushing...`);
              void flushChunksRef.current(false);
            } else if (bufferedDuration >= MAX_CHUNK_DURATION_SECONDS) {
              console.log(`[AutoChunk] Time limit reached (${bufferedDuration.toFixed(1)}s >= ${MAX_CHUNK_DURATION_SECONDS}s), flushing...`);
              void flushChunksRef.current(false);
            }

            // Chapter button requested a "hard" cut: flush right after the next available blob.
            if (chapterFlushRequestedRef.current) {
              chapterFlushRequestedRef.current = false;
              void flushChunksRef.current(false);
            }
          }
        }
      };

	      mediaRecorder.onstop = async () => {
	        const blob = new Blob(chunksRef.current, { type: mimeType });
	        setRecordedBlob(blob);
	        setStatus("stopped");

        // Flush final chunk if auto-chunking is enabled
        if (enableAutoChunking && isAuthenticated && pendingChunksRef.current.length > 0) {
          console.log(`[AutoChunk] Recording stopped, flushing final chunk...`);
          await flushChunksRef.current(true);
        }

	        if (autoSaveToServer) {
	          void saveRecordingToServer(blob);
	        }

        // Clean up streams
        streamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      if (!shouldResumeSession) {
        onSessionReady?.(activeSessionId);
      }
      setStatus("recording");

      // Start timer
      timerRef.current = window.setInterval(() => {
        setDuration((current) => {
          const next = current + 1;
          durationRef.current = next;
          onDurationChange?.(next);
          return next;
        });
      }, 1000);

    } catch (err: any) {
      console.error("Aufnahme-Fehler:", err);
      if (err.name === "NotAllowedError") {
        setError("Bildschirmfreigabe wurde abgelehnt. Bitte erlauben Sie die Bildschirmaufnahme.");
      } else {
        setError("Aufnahme konnte nicht gestartet werden: " + err.message);
      }
      setStatus("idle");
    }
	  }, [
      includeSystemAudio,
      includeMicrophone,
      saveRecordingToServer,
      enableAutoChunking,
      isAuthenticated,
      uploadLimitMB,
      autoSaveToServer,
      stopRecording,
      onSessionReady,
      onDurationChange,
      restoreState,
      status,
      recordedBlob,
      uploadedChunks,
      setChunkSessionId,
    ]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === "recording") {
      mediaRecorderRef.current.pause();
      setStatus("paused");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [status]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === "paused") {
      mediaRecorderRef.current.resume();
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        setDuration((current) => {
          const next = current + 1;
          durationRef.current = next;
          onDurationChange?.(next);
          return next;
        });
      }, 1000);
    }
  }, [onDurationChange, status]);

  // Stop recording
  // Auto-save once recording is complete (avoid losing by misclick)
  useEffect(() => {
    if (!autoSaveToServer) return;
    if (recordedBlob && isAuthenticated && !savedToServer) {
      saveRecordingToServer(recordedBlob);
    }
  }, [recordedBlob, isAuthenticated, savedToServer, saveRecordingToServer, autoSaveToServer]);

  // Use recording for transcription
  const useRecording = useCallback(() => {
    if (recordedBlob) {
      const file = new File([recordedBlob], `aufnahme-${Date.now()}.webm`, {
        type: recordedBlob.type
      });
      onRecordingComplete(file);
    }
  }, [recordedBlob, onRecordingComplete]);

  const primaryActionBlockedByUpload = enableAutoChunking && isAuthenticated && isUploadingChunk;
  const effectivePrimaryActionDisabled = isConverting || primaryActionDisabled || primaryActionBlockedByUpload;
  const hasRecoverableSession =
    !!restoreState &&
    !restoreState.isComplete &&
    status === "idle" &&
    !recordedBlob &&
    uploadedChunks.length > 0;
  const hideLocalDownloads = resumedRecordingRef.current;

  // Use recording directly for subtitle embedding
  const useForSubtitles = useCallback(() => {
    if (recordedBlob && onVideoForSubtitles) {
      const file = new File([recordedBlob], `aufnahme-${Date.now()}.webm`, {
        type: recordedBlob.type
      });
      onVideoForSubtitles(file);
    }
  }, [recordedBlob, onVideoForSubtitles]);

  // Download recording as WebM
  const downloadAsWebm = useCallback(() => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aufnahme-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [recordedBlob]);

  // Download recording as MP4 (converted on server)
  // Uses async job queue when available for better reliability with long videos
  const downloadAsMp4 = useCallback(async () => {
    if (!recordedBlob) return;

    setIsConverting(true);
    setError(null);

    // Try async job queue first if available
    if (asyncAvailable) {
      const formData = new FormData();
      formData.append("video", recordedBlob, "recording.webm");
      formData.append("format", "mp4");
      formData.append("storageScope", effectiveTarget.scope);
      if (effectiveTarget.scope === "workspace") {
        if (effectiveTarget.workspaceId) {
          formData.append("workspaceId", effectiveTarget.workspaceId);
        }
        if (effectiveTarget.projectId) {
          formData.append("projectId", effectiveTarget.projectId);
        }
      }
      if (notifyEnabled && notifyEmail) {
        formData.append("notifyEmail", notifyEmail);
      }

      const jobId = await submitJob("/api/jobs/convert", formData);
      if (!jobId) {
        // submitJob handles errors via onError callback
        // If it fails, try fallback to sync mode
        console.log("[ScreenRecorder] Async job submission failed, trying sync mode");
      } else {
        // Job submitted successfully - progress will be shown via SSE
        // onComplete callback will handle the download
        return;
      }
    }

    // Fallback to synchronous conversion
    try {
      const formData = new FormData();
      formData.append("video", recordedBlob, "recording.webm");

      // 10 minute timeout for large video conversions
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);

      const response = await fetch("/api/convert-to-mp4", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Konvertierung fehlgeschlagen");
      }

      // Download the converted file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aufnahme-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("MP4-Konvertierung fehlgeschlagen: " + err.message);
    } finally {
      setIsConverting(false);
    }
  }, [recordedBlob, asyncAvailable, submitJob]);

  // Reset to start new recording
  const resetRecording = useCallback(() => {
    setRecordedBlob(null);
    setStatus("idle");
    setDuration(0);
    durationRef.current = 0;
    setError(null);
    setSavedToServer(false);
    setUploadedChunks([]);
    setCurrentChunkSize(0);
    setChunkSessionId(crypto.randomUUID());
    appliedRestoreSessionRef.current = null;
    resumedRecordingRef.current = false;
    chunkIndexRef.current = 0;
    chunkStartTimeRef.current = 0;
    pendingChunksRef.current = [];
    chunksRef.current = [];
    resetJob(); // Reset any active conversion job
  }, [resetJob, setChunkSessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* DSGVO Badge */}
      <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm">
        <CheckCircle2 className="w-4 h-4" />
        <span>
          Aufnahme bleibt lokal. Eingeloggte Nutzer erhalten automatisch ein 24h-Backup im Konto.
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(showStoragePicker ?? !storageTarget) && (
        <StorageTargetPicker
          value={effectiveTarget}
          onChange={setEffectiveTarget}
          helperText="Wähle, ob die Aufnahme privat bleibt oder im Workspace geteilt wird."
        />
      )}

      {/* Recording Controls */}
      {status === "idle" && !recordedBlob && (
        <div className="space-y-6">
          {hasRecoverableSession && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="font-medium">Wiederherstellbare Session gefunden</div>
              <div className="mt-1">
                {uploadedChunks.length} Teile gesichert, bisherige Dauer {formatDuration(duration)}.
                Mit dem Start-Button wird dieselbe 24h-Session fortgesetzt.
              </div>
            </div>
          )}

          {/* Audio Options */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Audio-Quellen</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIncludeSystemAudio(!includeSystemAudio)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  includeSystemAudio
                    ? "border-blue-600 bg-violet-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  includeSystemAudio ? "bg-violet-100" : "bg-slate-100"
                }`}>
                  <Monitor className={`w-5 h-5 ${includeSystemAudio ? "text-violet-600" : "text-slate-400"}`} />
                </div>
                <div className="text-left">
                  <div className="font-medium text-slate-900">System-Audio</div>
                  <div className="text-xs text-slate-600">Nur bei Tab-Aufnahme</div>
                </div>
              </button>

              <button
                onClick={() => setIncludeMicrophone(!includeMicrophone)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  includeMicrophone
                    ? "border-blue-600 bg-violet-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  includeMicrophone ? "bg-violet-100" : "bg-slate-100"
                }`}>
                  {includeMicrophone ? (
                    <Mic className="w-5 h-5 text-violet-600" />
                  ) : (
                    <MicOff className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="text-left">
                  <div className="font-medium text-slate-900">Mikrofon</div>
                  <div className="text-xs text-slate-600">Ihre Stimme aufnehmen</div>
                </div>
              </button>
            </div>
          </div>

          {/* Start Button */}
          <Button
            onClick={startRecording}
            className="w-full h-14 text-base font-medium rounded-xl bg-red-600 hover:bg-red-700 transition-all"
          >
            {hasRecoverableSession ? (
              <Play className="w-5 h-5 mr-2" />
            ) : (
              <Circle className="w-5 h-5 mr-2 fill-current" />
            )}
            {hasRecoverableSession ? "Aufnahme fortsetzen" : "Aufnahme starten"}
          </Button>

          <div className="text-sm text-slate-600 text-center space-y-1">
            <p>Sie können Bildschirm, Fenster oder Browser-Tab aufnehmen</p>
            <p className="text-xs text-amber-600">
              Tipp: Wenn Sie System-Audio aufnehmen wollen, nutzen Sie Voxdrop im Chrome oder Edge Browser.
            </p>
          </div>
        </div>
      )}

      {/* Recording in Progress */}
      {(status === "recording" || status === "paused") && (
        <div className="space-y-6">
          {/* Timer Display */}
          <div className="text-center py-8">
            <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-full ${
              status === "recording" ? "bg-red-100" : "bg-yellow-100"
            }`}>
              {status === "recording" && (
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
              )}
              {status === "paused" && (
                <Pause className="w-5 h-5 text-yellow-600" />
              )}
              <span className={`text-3xl font-mono font-bold ${
                status === "recording" ? "text-red-700" : "text-yellow-700"
              }`}>
                {formatDuration(duration)}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-3">
              {status === "recording" ? "Aufnahme läuft..." : "Pausiert"}
            </p>
          </div>

          {/* Auto-Chunk Status */}
          {enableAutoChunking && isAuthenticated && (uploadedChunks.length > 0 || currentChunkSize > 0) && (
            <div className="flex items-center justify-between gap-3 p-3 bg-violet-50 border border-violet-100 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-violet-700">
                {isUploadingChunk ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Cloud className="w-4 h-4" />
                )}
                <span>
                  {uploadedChunks.length > 0 && `${uploadedChunks.length} Teile gesichert`}
                  {uploadedChunks.length > 0 && currentChunkSize > 0 && " · "}
                  {currentChunkSize > 0 && `${currentChunkSize.toFixed(0)}/${uploadLimitMB}MB`}
                </span>
              </div>
              <div className="text-xs text-violet-600">
                Auto-Backup aktiv
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex gap-3">
            {status === "recording" ? (
              <Button
                onClick={pauseRecording}
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-300"
              >
                <Pause className="w-5 h-5 mr-2" />
                Pausieren
              </Button>
            ) : (
              <Button
                onClick={resumeRecording}
                variant="outline"
                className="flex-1 h-12 rounded-xl border-slate-300"
              >
                <Play className="w-5 h-5 mr-2" />
                Fortsetzen
              </Button>
            )}
            <Button
              onClick={() => stopRecording()}
              className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-slate-800"
            >
              <Square className="w-5 h-5 mr-2 fill-current" />
              Stoppen
            </Button>
          </div>

          {onChapterMark && (
            <div className="flex items-center justify-between gap-3 p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <div className="text-sm text-purple-700">
                Kapitel markieren
                {typeof chapterCount === "number" && (
                  <span className="ml-2 text-purple-600">({chapterCount} markiert)</span>
                )}
              </div>
              <Button
                onClick={() => {
                  onChapterMark(duration);

                  // When chapters are used, "Kapitel" should also persist the current recording
                  // chunk immediately (so the user doesn't have to cut later and long recordings
                  // are continuously backed up).
                  if (enableAutoChunking && isAuthenticated) {
                    chapterFlushRequestedRef.current = true;
                    try {
                      mediaRecorderRef.current?.requestData();
                    } catch {
                      // requestData can throw in some browsers; fallback to flushing the buffered chunks.
                      chapterFlushRequestedRef.current = false;
                      void flushChunksRef.current(false);
                      return;
                    }

                    // If requestData doesn't trigger a dataavailable event quickly (browser quirk),
                    // flush anyway so the chapter boundary is persisted.
                    window.setTimeout(() => {
                      if (chapterFlushRequestedRef.current) {
                        chapterFlushRequestedRef.current = false;
                        void flushChunksRef.current(false);
                      }
                    }, 500);
                  }
                }}
                disabled={status !== "recording"}
                variant="outline"
                className="h-10 border-purple-200 text-purple-700 hover:bg-purple-100"
              >
                <Scissors className="w-4 h-4 mr-2" />
                Kapitel
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Recording Complete */}
      {status === "stopped" && recordedBlob && (
        <div className="space-y-6">
          {/* Success Message */}
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Aufnahme abgeschlossen</h3>
            <p className="text-slate-600">
              {resumedRecordingRef.current
                ? `Sessiondauer: ${formatDuration(duration)} · ${uploadedChunks.length} Teile serverseitig gesichert`
                : `Dauer: ${formatDuration(duration)} · ${(recordedBlob.size / 1024 / 1024).toFixed(1)} MB`}
            </p>
          </div>

          {/* Auto-save confirmation */}
          {savedToServer && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Aufnahme für 24h in Ihrem Konto gespeichert (unter Einstellungen abrufbar)</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={useRecording}
              disabled={effectivePrimaryActionDisabled}
              className="w-full h-14 text-base font-medium rounded-xl bg-violet-600 hover:bg-violet-700"
            >
              {primaryActionBlockedByUpload ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : primaryActionIcon === "video" ? (
                <FileVideo className="w-5 h-5 mr-2" />
              ) : (
                <FileAudio className="w-5 h-5 mr-2" />
              )}
              {primaryActionBlockedByUpload ? "Letzten Chunk sichern..." : primaryActionLabel}
            </Button>

            {primaryActionBlockedByUpload && (
              <p className="text-sm text-slate-500">
                Der finale Chunk wird noch auf den Server hochgeladen. Danach kann die Session weiterverarbeitet werden.
              </p>
            )}

            {/* Direct to Subtitles - always visible */}
            {onVideoForSubtitles && (
              <Button
                onClick={useForSubtitles}
                disabled={isConverting}
                variant="outline"
                className="w-full h-12 rounded-xl border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Subtitles className="w-5 h-5 mr-2" />
                Direkt zu Untertiteln
              </Button>
            )}

            {!hideLocalDownloads && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Herunterladen als:</p>

                <div className="p-3 bg-slate-50 rounded-xl">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={notifyEnabled}
                      onChange={(e) => setNotifyEnabled(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="flex-1">
                      E-Mail-Benachrichtigung, wenn die MP4 fertig ist
                    </span>
                  </label>
                  {notifyEnabled && (
                    <div className="mt-2">
                      <input
                        type="email"
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder="ihre@email.de"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
                      />
                    </div>
                  )}
                </div>

                {/* Async Job Progress - only show when MP4 conversion is happening */}
                {conversionJob && (
                  <div className="p-4 bg-violet-50 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-violet-700 font-medium">
                        {conversionJob.status === 'pending' && 'In Warteschlange...'}
                        {conversionJob.status === 'active' && conversionJob.progress.stage === 'starting' && 'Startet...'}
                        {conversionJob.status === 'active' && conversionJob.progress.stage === 'converting' && 'Konvertiere Video...'}
                        {conversionJob.status === 'completed' && 'Fertig!'}
                        {conversionJob.status === 'failed' && 'Fehlgeschlagen'}
                      </span>
                      <span className="text-violet-600">{conversionJob.progress.percent}%</span>
                    </div>
                    <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-600 rounded-full transition-all duration-500"
                        style={{ width: `${conversionJob.progress.percent}%` }}
                      />
                    </div>
                    {position !== null && (
                      <QueuePositionDisplay
                        position={position}
                        estimatedWait={estimatedWait}
                        isProcessing={isProcessing}
                      />
                    )}
                    {asyncAvailable && notifyEnabled && notifyEmail && (
                      <p className="text-xs text-violet-600">
                        Wir senden eine E-Mail, sobald die Konvertierung fertig ist.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  {/* MP4 Button - only show if SSE is available (works on this browser) */}
                  {(sseAvailable !== false) && (
                    <Button
                      onClick={downloadAsMp4}
                      disabled={isConverting || !!conversionJob}
                      variant="outline"
                      className="flex-1 h-12 rounded-xl border-slate-300"
                    >
                      {isConverting || conversionJob ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Konvertiere...
                        </>
                      ) : (
                        <>
                          <FileVideo className="w-5 h-5 mr-2" />
                          MP4
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={downloadAsWebm}
                    disabled={isConverting || !!conversionJob}
                    variant="outline"
                    className={`h-12 rounded-xl border-slate-300 ${sseAvailable === false ? 'flex-1' : 'flex-1'}`}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    WebM
                  </Button>
                </div>
              </div>
            )}

            <Button
              onClick={resetRecording}
              disabled={isConverting}
              variant="outline"
              className="w-full h-12 rounded-xl border-slate-300"
            >
              Neue Aufnahme
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
