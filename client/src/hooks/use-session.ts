import { useState, useEffect, useCallback } from 'react';

// Session file type
export interface SessionFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
  };
}

// Session type
export interface Session {
  sessionId: string;
  files: SessionFile[];
  createdAt: string;
  lastAccessedAt: string;
}

export interface RecentSessionFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface RecentSessionSummary {
  sessionId: string;
  files: RecentSessionFile[];
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  fileCount: number;
  videoCount: number;
}

// Cut segment type
export interface CutSegment {
  start: number;
  end: number;
}

// Timeline clip type for rendering
export interface TimelineClip {
  fileId: string;
  sourceStart: number;      // In-point in source (seconds)
  sourceEnd: number;        // Out-point in source (seconds)
  timelineStart: number;    // Position on timeline (seconds)
  type: 'video' | 'audio' | 'image';
  volume?: number;          // Audio volume (0-2, default 1)
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

export type VideoLayoutPreset =
  | 'full'
  | 'pip_tr'
  | 'pip_tl'
  | 'pip_br'
  | 'pip_bl'
  | 'lower_third'
  | 'center';

export interface VideoTrackLayout {
  preset?: VideoLayoutPreset;
  // Relative box (0..1). If omitted, resolved from preset.
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  opacity?: number; // 0..1
}

export type AudioTrackRole = 'voice' | 'music' | 'sfx';

// Timeline track type
export interface TimelineTrack {
  type: 'video' | 'audio';
  clips: TimelineClip[];
  muted?: boolean;
  volume?: number;          // Track volume (0-2, default 1)
  layout?: VideoTrackLayout;
  role?: AudioTrackRole;
}

export interface ExportConstraints {
  /**
   * Target maximum output size per rendered file.
   * Used for locked-down intranet uploads (e.g. 125MB).
   */
  maxSizeMb?: number;

  /**
   * Target aspect ratio. Implemented via padding (no cropping) server-side.
   * Leave undefined for original.
   */
  aspect?: '16:9' | '4:3' | '9:16';

  /**
   * Normalize loudness for speech-friendly playback.
   * This requires re-encoding audio.
   */
  normalizeAudio?: boolean;

  /**
   * Prefer stream-copy when possible (fast, may be less frame-accurate and not always compatible).
   * - reencode: always re-encode (default behavior)
   * - auto: try copy first, fallback to re-encode
   * - copy: force copy (fail if not possible)
   */
  fastMode?: 'reencode' | 'auto' | 'copy';
}

// Local storage key for session ID
const SESSION_STORAGE_KEY = 'voxdrop-session-id';
// DRV / locked-down networks often block large single-request uploads.
// Use resumable chunk uploads early so we can get by with small (~10MB) chunks.
const RESUMABLE_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB

const EXTENSION_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function normalizeUploadMimeType(mimeType: string | undefined, filename?: string): string {
  const raw = String(mimeType || '').trim().toLowerCase();
  const base = raw.split(';')[0].trim();
  if (base) return base;

  const ext = String(filename || '')
    .toLowerCase()
    .split('.')
    .pop();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }

  return 'application/octet-stream';
}

/**
 * React hook for managing session-based file storage
 *
 * Usage:
 * ```tsx
 * const { session, files, uploadFile, deleteFile, cutVideo, mergeVideos, trimVideo } = useSession();
 *
 * // Upload a file
 * await uploadFile(file);
 *
 * // Cut video into segments
 * await cutVideo(fileId, [{ start: 0, end: 30 }, { start: 60, end: 90 }]);
 *
 * // Merge multiple videos
 * await mergeVideos([fileId1, fileId2], 'merged.mp4');
 * ```
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get session ID from localStorage
  const getSessionId = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SESSION_STORAGE_KEY);
  }, []);

  // Save session ID to localStorage
  const saveSessionId = useCallback((sessionId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  }, []);

  // Get headers with session ID
  const getHeaders = useCallback((sessionIdOverride?: string | null): HeadersInit => {
    const sessionId = sessionIdOverride ?? getSessionId();
    return sessionId ? { 'X-Session-ID': sessionId } : {};
  }, [getSessionId]);

  // Initialize or refresh session
  const refreshSession = useCallback(async (sessionIdOverride?: string | null) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/session', {
        headers: getHeaders(sessionIdOverride),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get session');
      }

      const data = await response.json();
      setSession(data);
      setFiles(data.files || []);

      // Save session ID if new
      if (data.sessionId) {
        saveSessionId(data.sessionId);
      }

      return data;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders, saveSessionId]);

  const getRecentSessions = useCallback(async (limit = 12): Promise<RecentSessionSummary[]> => {
    try {
      const response = await fetch(`/api/session/recent?limit=${encodeURIComponent(String(limit))}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load recent sessions');
      }

      const data = await response.json();
      return Array.isArray(data.sessions) ? data.sessions : [];
    } catch (err) {
      setError(String(err));
      return [];
    }
  }, []);

  const switchSession = useCallback(async (targetSessionId: string) => {
    saveSessionId(targetSessionId);
    return refreshSession(targetSessionId);
  }, [refreshSession, saveSessionId]);

  // Upload a file
  const uploadFile = useCallback(async (
    file: File,
    opts?: { forceResumable?: boolean }
  ): Promise<SessionFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      if (opts?.forceResumable || file.size >= RESUMABLE_THRESHOLD_BYTES) {
        const normalizedMimeType = normalizeUploadMimeType(file.type, file.name);
        const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
        const initialSessionId = getSessionId();
        const initialSessionKey = initialSessionId || 'no-session';
        const initialKey = `voxdrop-upload:${initialSessionKey}:${fingerprint}`;
        const existingUploadId = typeof window !== 'undefined' ? localStorage.getItem(initialKey) : null;

        const initResponse = await fetch('/api/session/uploads/init', {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: file.name,
            mimeType: normalizedMimeType,
            size: file.size,
            uploadId: existingUploadId || undefined
          })
        });

        if (!initResponse.ok) {
          const data = await initResponse.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to initialize upload');
        }

        const initData = await initResponse.json();
        const uploadId = initData.uploadId as string;
        const chunkSize = initData.chunkSize as number;
        const totalChunks = initData.totalChunks as number;
        const receivedChunks = new Set<number>(initData.receivedChunks || []);

        const resolvedSessionId = (initData.sessionId as string | undefined) || initialSessionId || initialSessionKey;
        const finalKey = `voxdrop-upload:${resolvedSessionId}:${fingerprint}`;

        if (typeof window !== 'undefined') {
          localStorage.setItem(finalKey, uploadId);
          if (finalKey !== initialKey) {
            localStorage.removeItem(initialKey);
          }
        }

        for (let index = 0; index < totalChunks; index++) {
          if (receivedChunks.has(index)) continue;
          const start = index * chunkSize;
          const end = Math.min(file.size, start + chunkSize);
          const chunk = file.slice(start, end);
          const formData = new FormData();
          formData.append(
            'chunk',
            new File([chunk], `chunk-${index}.webm`, { type: normalizedMimeType })
          );
          formData.append('chunkIndex', String(index));
          formData.append('totalChunks', String(totalChunks));

          // Prefer multipart chunks for stricter enterprise proxies/WAFs.
          // Raw binary remains as fallback for legacy environments.
          let chunkResponse = await fetch(`/api/session/uploads/${uploadId}/chunk-multipart`, {
            method: 'POST',
            credentials: 'include',
            headers: getHeaders(),
            body: formData,
          });

          if (!chunkResponse.ok && (chunkResponse.status === 404 || chunkResponse.status === 405)) {
            chunkResponse = await fetch(`/api/session/uploads/${uploadId}/chunk?i=${index}&n=${totalChunks}`, {
              method: 'POST',
              credentials: 'include',
              headers: {
                ...getHeaders(),
                'Content-Type': normalizedMimeType,
                'Content-Disposition': `attachment; filename="chunk-${index}.webm"`,
              },
              body: chunk
            });
          }

          if (!chunkResponse.ok) {
            const data = await chunkResponse.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to upload chunk');
          }
        }

        const completeResponse = await fetch(`/api/session/uploads/${uploadId}/complete`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json'
          }
        });

        if (!completeResponse.ok) {
          const data = await completeResponse.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to finalize upload');
        }

        const data = await completeResponse.json();

        if (typeof window !== 'undefined') {
          localStorage.removeItem(finalKey);
        }

        if (data.sessionId) {
          saveSessionId(data.sessionId);
        }

        if (data.file) {
          setFiles(prev => [...prev, data.file]);
        }

        return data.file;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/session/files', {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: formData
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload file');
      }

      const data = await response.json();

      // Update session ID if new
      if (data.sessionId) {
        saveSessionId(data.sessionId);
      }

      // Add file to local state
      if (data.file) {
        setFiles(prev => [...prev, data.file]);
      }

      return data.file;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders, getSessionId, saveSessionId]);

  // Delete a file
  const deleteFile = useCallback(async (fileId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/session/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      // Remove file from local state
      setFiles(prev => prev.filter(f => f.id !== fileId));

      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Get file URL for streaming/preview
  const getFileUrl = useCallback((fileId: string): string => {
    const sessionId = getSessionId();
    const query = sessionId ? `?session=${sessionId}` : '';
    return `/api/session/files/${fileId}${query}`;
  }, [getSessionId]);

  const getProxyUrl = useCallback((fileId: string): string => {
    const sessionId = getSessionId();
    const query = sessionId ? `?session=${sessionId}` : '';
    return `/api/session/files/${fileId}/proxy${query}`;
  }, [getSessionId]);

  const ensureProxy = useCallback(async (fileId: string): Promise<{ status: string; error?: string } | null> => {
    try {
      const response = await fetch(`/api/session/files/${fileId}/proxy`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, [getHeaders]);

  const getProxyStatus = useCallback(async (fileId: string): Promise<{ status: string; error?: string } | null> => {
    try {
      const response = await fetch(`/api/session/files/${fileId}/proxy/status`, {
        headers: getHeaders()
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, [getHeaders]);

  // Cut video into segments
  const cutVideo = useCallback(async (
    fileId: string,
    segments: CutSegment[],
    constraints?: ExportConstraints
  ): Promise<SessionFile[] | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/video/cut', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId,
          segments,
          maxSizeMb: constraints?.maxSizeMb,
          aspect: constraints?.aspect,
          normalizeAudio: constraints?.normalizeAudio,
          fastMode: constraints?.fastMode
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cut video');
      }

      const data = await response.json();

      // Add new files to local state
      if (data.files && data.files.length > 0) {
        setFiles(prev => [...prev, ...data.files]);
      }

      return data.files;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Merge multiple videos
  const mergeVideos = useCallback(async (
    fileIds: string[],
    outputName?: string,
    constraints?: ExportConstraints
  ): Promise<SessionFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/video/merge', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileIds,
          outputName,
          maxSizeMb: constraints?.maxSizeMb,
          aspect: constraints?.aspect,
          normalizeAudio: constraints?.normalizeAudio,
          fastMode: constraints?.fastMode
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to merge videos');
      }

      const data = await response.json();

      // Add new file to local state
      if (data.file) {
        setFiles(prev => [...prev, data.file]);
      }

      return data.file;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Trim video (cut start/end)
  const trimVideo = useCallback(async (
    fileId: string,
    start: number,
    end: number,
    constraints?: ExportConstraints
  ): Promise<SessionFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/video/trim', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId,
          start,
          end,
          maxSizeMb: constraints?.maxSizeMb,
          aspect: constraints?.aspect,
          normalizeAudio: constraints?.normalizeAudio,
          fastMode: constraints?.fastMode
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to trim video');
      }

      const data = await response.json();

      // Add new file to local state
      if (data.file) {
        setFiles(prev => [...prev, data.file]);
      }

      return data.file;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Combine video and audio tracks
  const combineVideoAudio = useCallback(async (
    videoFileId: string,
    audioFileId: string,
    options?: {
      videoTrimStart?: number;
      videoTrimEnd?: number;
      audioTrimStart?: number;
      audioTrimEnd?: number;
      audioVolume?: number;
      maxSizeMb?: number;
      resolution?: '720p' | '1080p' | 'original';
      aspect?: '16:9' | '4:3' | '9:16';
      normalizeAudio?: boolean;
    }
  ): Promise<SessionFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/video/combine-tracks', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoFileId,
          audioFileId,
          ...options
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to combine video and audio');
      }

      const data = await response.json();

      // Add new file to local state
      if (data.file) {
        setFiles(prev => [...prev, data.file]);
      }

      return data.file;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Extract freeze frame (Standbild) from video
  const extractFreezeFrame = useCallback(async (
    fileId: string,
    time: number,
    format: 'jpg' | 'png' = 'jpg'
  ): Promise<SessionFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/video/freeze-frame', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileId, time, format })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to extract freeze frame');
      }

      const data = await response.json();

      // Add new file to local state
      if (data.file) {
        setFiles(prev => [...prev, data.file]);
      }

      return data.file;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Render timeline to video
  const renderTimeline = useCallback(async (
    tracks: TimelineTrack[],
    options?: {
      outputFormat?: 'mp4' | 'webm';
      resolution?: '720p' | '1080p' | 'original';
      outputName?: string;
      maxSizeMb?: number;
      aspect?: '16:9' | '4:3' | '9:16';
      normalizeAudio?: boolean;
      cleanAudio?: boolean;
      transition?: { type: 'none' | 'fade' | 'crossfade'; durationSeconds?: number };
    }
  ): Promise<SessionFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/video/render-timeline', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tracks,
          outputFormat: options?.outputFormat || 'mp4',
          resolution: options?.resolution || 'original',
          outputName: options?.outputName,
          maxSizeMb: options?.maxSizeMb,
          aspect: options?.aspect,
          normalizeAudio: options?.normalizeAudio,
          cleanAudio: options?.cleanAudio,
          transition: options?.transition
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to render timeline');
      }

      const data = await response.json();

      // Add new file to local state
      if (data.file) {
        setFiles(prev => [...prev, data.file]);
      }

      return data.file;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Get file metadata
  const getFileMetadata = useCallback(async (fileId: string): Promise<SessionFile | null> => {
    try {
      const response = await fetch(`/api/session/files/${fileId}/metadata`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }, [getHeaders]);

  // Clear session (delete all files)
  const clearSession = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/session', {
        method: 'DELETE',
        headers: getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to clear session');
      }

      // Clear local state
      setSession(null);
      setFiles([]);
      localStorage.removeItem(SESSION_STORAGE_KEY);

      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize session on mount
  useEffect(() => {
    refreshSession();
  }, []);

  return {
    session,
    files,
    isLoading,
    error,
    refreshSession,
    getRecentSessions,
    switchSession,
    uploadFile,
    deleteFile,
    getFileUrl,
    cutVideo,
    mergeVideos,
    trimVideo,
    combineVideoAudio,
    extractFreezeFrame,
    renderTimeline,
    getFileMetadata,
    clearSession,
    formatFileSize,
    formatDuration,
    sessionId: getSessionId(),
    getProxyUrl,
    ensureProxy,
    getProxyStatus
  };
}
