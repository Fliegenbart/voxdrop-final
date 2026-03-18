import { useState, useEffect, useCallback, useRef } from 'react';

// User-friendly error message translations for German users
const ERROR_TRANSLATIONS: Record<string, string> = {
  'GPU busy': 'Das System ist ausgelastet. Bitte in 1-2 Minuten erneut versuchen.',
  'Whisper service error': 'Der Transkriptionsdienst ist nicht erreichbar. Bitte später erneut versuchen.',
  'Whisper transcription failed': 'Der Transkriptionsdienst ist momentan nicht verfügbar. Bitte in wenigen Minuten erneut versuchen.',
  'Whisper service unavailable': 'Der Transkriptionsdienst ist nicht erreichbar. Bitte später erneut versuchen.',
  'Model not available': 'Der Transkriptionsdienst ist momentan nicht verfügbar. Bitte in wenigen Minuten erneut versuchen.',
  'no CUDA-capable device': 'Der Transkriptionsdienst ist momentan nicht verfügbar. Bitte in wenigen Minuten erneut versuchen.',
  'no CUDA capable device': 'Der Transkriptionsdienst ist momentan nicht verfügbar. Bitte in wenigen Minuten erneut versuchen.',
  'cuda device count': 'Der Transkriptionsdienst ist momentan nicht verfügbar. Bitte in wenigen Minuten erneut versuchen.',
  'Failed to initialize NVML': 'Der Transkriptionsdienst ist momentan nicht verfügbar. Bitte in wenigen Minuten erneut versuchen.',
  'ECONNREFUSED': 'Verbindung zum Server fehlgeschlagen. Bitte Internetverbindung prüfen.',
  'FFmpeg exited': 'Das Video konnte nicht verarbeitet werden. Bitte ein anderes Format versuchen.',
  'ENOSPC': 'Nicht genuegend Speicherplatz auf dem Server.',
  'timeout': 'Die Verarbeitung hat zu lange gedauert. Bitte mit einer kuerzeren Aufnahme versuchen.',
  'Job failed': 'Die Verarbeitung ist fehlgeschlagen. Bitte erneut versuchen.',
  'Failed to fetch': 'Netzwerkfehler. Bitte Internetverbindung prüfen.',
  'Network error': 'Netzwerkfehler. Bitte Internetverbindung prüfen.',
  '503': 'Der Server ist ausgelastet. Bitte in wenigen Minuten erneut versuchen.',
  '502': 'Der Server ist voruebergehend nicht erreichbar. Bitte später erneut versuchen.',
  '413': 'Upload wurde geblockt (413). Das ist oft ein Proxy-/Body-Limit und nicht zwingend die Dateigroesse.',
  'Archive Too Big': 'Upload oder Download vom Netzwerk-Proxy blockiert (Archiv zu gross). Bitte Einzeldownload nutzen.',
  'session_upload_failed': 'Session-Upload fehlgeschlagen. Bitte erneut versuchen.',
  'session_unavailable': 'Session nicht verfügbar. Bitte Seite neu laden und erneut versuchen.',
  '400': 'Fehler beim Hochladen. Bei Behördennetzwerken: IT-Admin kontaktieren (Proxy-Whitelist).',
};

const ERROR_CODE_TRANSLATIONS: Record<string, string> = {
  gpu_slot_timeout: 'GPU ist aktuell ausgelastet. Der Job bleibt in der Warteschlange und wird erneut versucht.',
  input_missing: 'Die Eingabedatei konnte nicht gefunden werden. Bitte Upload erneut starten.',
  llm_context_overflow: 'Die Anfrage war fuer das Modell zu lang. Der Job wurde mit reduziertem Kontext erneut versucht.',
  provider_timeout: 'Ein externer Dienst hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.',
  ffmpeg_oom: 'Videoverarbeitung wegen Speichermangel fehlgeschlagen. Bitte erneut versuchen.',
  file_too_large: 'Die Datei ist zu gross fuer diese Verarbeitung.',
};

export function translateError(error: string, errorCode?: string | null): string {
  if (errorCode && ERROR_CODE_TRANSLATIONS[errorCode]) {
    return ERROR_CODE_TRANSLATIONS[errorCode];
  }
  // Check for exact matches first
  if (ERROR_TRANSLATIONS[error]) {
    return ERROR_TRANSLATIONS[error];
  }
  // Check for partial matches
  for (const [key, translation] of Object.entries(ERROR_TRANSLATIONS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return translation;
    }
  }
  // Return original if no translation found
  return error;
}

// Job status types
export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface JobProgress {
  stage: string;
  percent: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  progress: JobProgress;
  error?: string;
  errorCode?: string | null;
  phase?: string;
  retryCount?: number;
  gpuWaitMs?: number;
  lastHeartbeatAt?: string;
  queueMetadata?: {
    attempt?: number;
    queuedAt?: string;
    startedAt?: string;
    finishedAt?: string;
    inputPath?: string;
    inputChecksum?: string;
  };
  createdAt?: string;
  completedAt?: string;
  hasResult?: boolean;
}

interface UseJobOptions {
  onComplete?: (job: Job) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: JobProgress) => void;
  onConnectionIssue?: (message: string, jobId?: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

// Proxy detection: check if SSE is being blocked by corporate proxy
const PROXY_MODE_KEY = 'voxdrop_proxy_mode';
const SSE_FAIL_COUNT_KEY = 'voxdrop_sse_fail_count';

function isProxyModeEnabled(): boolean {
  try {
    return localStorage.getItem(PROXY_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function incrementSSEFailCount(): number {
  try {
    const count = parseInt(localStorage.getItem(SSE_FAIL_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(SSE_FAIL_COUNT_KEY, String(count));
    // Auto-enable proxy mode after 3 SSE failures
    if (count >= 3) {
      localStorage.setItem(PROXY_MODE_KEY, 'true');
      console.log('[useJob] Auto-enabled proxy mode after repeated SSE failures');
    }
    return count;
  } catch {
    return 0;
  }
}

function resetSSEFailCount(): void {
  try {
    localStorage.removeItem(SSE_FAIL_COUNT_KEY);
  } catch {
    // Ignore
  }
}

export function enableProxyMode(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(PROXY_MODE_KEY, 'true');
    } else {
      localStorage.removeItem(PROXY_MODE_KEY);
      localStorage.removeItem(SSE_FAIL_COUNT_KEY);
    }
  } catch {
    // Ignore
  }
}

const ENDPOINT_QUEUE_MAP: Record<string, string> = {
  '/api/jobs/transcribe': 'transcription',
  '/api/jobs/transcribe-session': 'transcription',
  '/api/jobs/convert': 'video-conversion',
  '/api/jobs/embed-subtitles': 'subtitle-embed',
  '/api/jobs/embed-subtitles-session': 'subtitle-embed',
  '/api/jobs/split-chapters': 'chapter-splitting',
  '/api/jobs/pptx-summary': 'pptx-summary',
  '/api/jobs/pdfua': 'pdfua-conversion',
};

const normalizeDateString = (value?: string) =>
  value && !value.includes('T') ? value.replace(' ', 'T') : value;

const parseDateMs = (value?: string) => {
  const normalized = normalizeDateString(value);
  const ms = normalized ? Date.parse(normalized) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

const inferQueueFromEndpoint = (endpoint: string): string | null => {
  const direct = ENDPOINT_QUEUE_MAP[endpoint];
  if (direct) return direct;

  const match = Object.entries(ENDPOINT_QUEUE_MAP).find(([key]) =>
    endpoint.includes(key)
  );
  return match?.[1] ?? null;
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      // Retry briefly on transient 5xx errors for GET requests.
      if (response.status >= 500 && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Fetch failed');
}

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchWithAuthRetry(
  url: string,
  options: RequestInit = {},
  retries = 2
): Promise<Response> {
  const mergedOptions: RequestInit = {
    credentials: 'include',
    ...options,
  };

  let response = await fetchWithRetry(url, mergedOptions, retries);
  if (response.status !== 401) return response;

  const refreshed = await refreshSession();
  if (!refreshed) return response;

  return fetchWithRetry(url, mergedOptions, retries);
}

interface ParsedSubmitError {
  message: string;
  fallback: boolean;
}

async function parseJobSubmitError(
  response: Response,
  defaultMessage: string
): Promise<ParsedSubmitError> {
  const statusPrefix = `${response.status}`;

  try {
    const raw = await response.text();
    if (!raw) {
      return { message: `${statusPrefix}: ${defaultMessage}`, fallback: false };
    }

    try {
      const parsed = JSON.parse(raw) as {
        error?: unknown;
        message?: unknown;
        fallback?: unknown;
      };
      const message =
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.message === 'string'
            ? parsed.message
            : defaultMessage;
      return {
        message: `${statusPrefix}: ${message}`,
        fallback: Boolean(parsed.fallback),
      };
    } catch {
      const compact = raw
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      if (!compact) {
        return { message: `${statusPrefix}: ${defaultMessage}`, fallback: false };
      }
      return { message: `${statusPrefix}: ${compact}`, fallback: false };
    }
  } catch {
    return { message: `${statusPrefix}: ${defaultMessage}`, fallback: false };
  }
}

interface JobsListResponse {
  jobs: Array<{
    id: string;
    queue: string;
    status: JobStatus;
    progress?: { stage?: string; percent?: number };
    error?: string | null;
    errorCode?: string | null;
    phase?: string | null;
    retryCount?: number;
    gpuWaitMs?: number;
    lastHeartbeatAt?: string | null;
    queueMetadata?: {
      attempt?: number;
      queuedAt?: string;
      startedAt?: string;
      finishedAt?: string;
      inputPath?: string;
      inputChecksum?: string;
    };
    createdAt?: string;
    completedAt?: string | null;
    hasResult?: boolean;
  }>;
}

/**
 * React hook for managing async job status with SSE (Server-Sent Events)
 *
 * Usage:
 * ```tsx
 * const { job, isLoading, error, submitJob, downloadResult } = useJob({
 *   onComplete: (job) => toast.success('Job completed!'),
 *   onError: (error) => toast.error(error),
 * });
 *
 * // Submit a video conversion job
 * const handleConvert = async (file: File) => {
 *   const formData = new FormData();
 *   formData.append('video', file);
 *   await submitJob('/api/jobs/convert', formData);
 * };
 *
 * // Download result when ready
 * if (job?.status === 'completed') {
 *   downloadResult();
 * }
 * ```
 */
export function useJob(options: UseJobOptions = {}) {
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const pollFailureCountRef = useRef(0);
  const pollingRef = useRef(false);
  const connectionIssueReportedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const setLoading = useCallback((value: boolean) => {
    isLoadingRef.current = value;
    setIsLoading(value);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollingRef.current = false;
    pollFailureCountRef.current = 0;
    connectionIssueReportedRef.current = false;
  }, []);

  // Cleanup SSE connection
  const closeConnection = useCallback(() => {
    stopPolling();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [stopPolling]);

  // Poll job status (fallback if SSE fails)
  const pollJobStatus = useCallback(async (jobId: string): Promise<Job | null> => {
    try {
      const response = await fetchWithAuthRetry(`/api/jobs/${jobId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }

      const data = await response.json();
      return {
        id: data.id,
        status: data.status,
        progress: data.progress || { stage: 'unknown', percent: 0 },
        error: data.error,
        errorCode: data.errorCode || null,
        phase: data.phase,
        retryCount: data.retryCount,
        gpuWaitMs: data.gpuWaitMs,
        lastHeartbeatAt: data.lastHeartbeatAt,
        queueMetadata: data.queueMetadata,
        createdAt: data.createdAt,
        completedAt: data.completedAt,
        hasResult: data.hasResult,
      };
    } catch (err) {
      console.error('[useJob] Poll error:', err);
      return null;
    }
  }, []);

  const handlePolledJobUpdate = useCallback((polledJob: Job) => {
    setJob(polledJob);

    if (polledJob.status === 'completed') {
      setLoading(false);
      options.onComplete?.(polledJob);
      closeConnection();
      return;
    }

    if (polledJob.status === 'failed') {
      const errorMsg = translateError(polledJob.error || 'Job failed', polledJob.errorCode);
      setError(errorMsg);
      setLoading(false);
      options.onError?.(errorMsg);
      closeConnection();
    }
  }, [closeConnection, options, setLoading]);

  const startPolling = useCallback((jobId: string, reason: string) => {
    if (pollingRef.current) return;
    pollingRef.current = true;

    if (!connectionIssueReportedRef.current) {
      connectionIssueReportedRef.current = true;
      const message = reason === 'sse_error'
        ? 'Verbindung unterbrochen. Der Job läuft weiter, wir fragen den Status neu ab.'
        : 'Verbindung instabil. Der Job läuft weiter, wir fragen den Status neu ab.';
      options.onConnectionIssue?.(message, jobId);
    }

    const pollOnce = async () => {
      const polledJob = await pollJobStatus(jobId);
      if (polledJob) {
        pollFailureCountRef.current = 0;
        handlePolledJobUpdate(polledJob);
        return;
      }

      pollFailureCountRef.current += 1;
      if (pollFailureCountRef.current === 3) {
        options.onConnectionIssue?.(
          'Netzwerkprobleme. Der Job läuft serverseitig weiter. Bitte kurz warten oder neu laden.',
          jobId
        );
      }
    };

    void pollOnce();
    pollIntervalRef.current = window.setInterval(pollOnce, 5000);
  }, [handlePolledJobUpdate, options, pollJobStatus]);

  const recoverRecentJob = useCallback(async (endpoint: string): Promise<Job | null> => {
    const queueName = inferQueueFromEndpoint(endpoint);

    try {
      const response = await fetchWithAuthRetry('/api/jobs?limit=15');
      if (!response.ok) return null;

      const data = (await response.json()) as JobsListResponse;
      const now = Date.now();

      const candidates = (data.jobs || [])
        .filter((job) => (queueName ? job.queue === queueName : true))
        .filter((job) => {
          const createdMs = parseDateMs(job.createdAt);
          return createdMs > 0 && now - createdMs <= RECOVERY_WINDOW_MS;
        })
        .sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt));

      const latest = candidates[0];
      if (!latest) return null;

      const progress = latest.progress || {};
      return {
        id: latest.id,
        status: latest.status,
        progress: {
          stage: progress.stage || latest.status,
          percent: typeof progress.percent === 'number'
            ? progress.percent
            : latest.status === 'completed'
              ? 100
              : 0,
        },
        error: latest.error || undefined,
        errorCode: latest.errorCode || null,
        phase: latest.phase || undefined,
        retryCount: latest.retryCount,
        gpuWaitMs: latest.gpuWaitMs,
        lastHeartbeatAt: latest.lastHeartbeatAt || undefined,
        queueMetadata: latest.queueMetadata,
        createdAt: latest.createdAt,
        completedAt: latest.completedAt || undefined,
        hasResult: latest.hasResult,
      };
    } catch (err) {
      console.warn('[useJob] Recovery check failed:', err);
      return null;
    }
  }, []);

  // Connect to SSE for real-time updates
  const connectSSE = useCallback((jobId: string) => {
    closeConnection();

    // Skip SSE entirely if proxy mode is enabled (corporate proxy detected)
    if (isProxyModeEnabled()) {
      console.log('[useJob] Proxy mode enabled - using polling only');
      startPolling(jobId, 'proxy_mode');
      return;
    }

    let sseConnected = false;
    const sseTimeout = window.setTimeout(() => {
      if (!sseConnected) {
        console.warn('[useJob] SSE connection timeout - falling back to polling');
        incrementSSEFailCount();
        startPolling(jobId, 'sse_timeout');
      }
    }, 5000);

    const eventSource = new EventSource(`/api/jobs/events?jobIds=${jobId}`, {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      sseConnected = true;
      clearTimeout(sseTimeout);
      resetSSEFailCount();
      // SSE recovered - stop polling fallback.
      if (pollingRef.current) {
        stopPolling();
      }
    };

    eventSource.addEventListener('connected', (event) => {
      console.log('[SSE] Connected:', JSON.parse(event.data));
    });

    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      if (data.jobId === jobId) {
        const progress: JobProgress = {
          stage: data.stage || 'processing',
          percent: data.percent || 0,
        };
        setJob((prev) => prev ? { ...prev, status: 'active', progress } : null);
        options.onProgress?.(progress);
      }
    });

    eventSource.addEventListener('completed', (event) => {
      const data = JSON.parse(event.data);
      if (data.jobId === jobId) {
        const updatedJob: Job = {
          id: jobId,
          status: 'completed',
          progress: { stage: 'done', percent: 100 },
          hasResult: true,
        };
        setJob(updatedJob);
        setLoading(false);
        options.onComplete?.(updatedJob);
        closeConnection();
      }
    });

    eventSource.addEventListener('failed', (event) => {
      const data = JSON.parse(event.data);
      if (data.jobId === jobId) {
        const errorMsg = translateError(data.error || 'Job failed', data.errorCode);
        setJob((prev) => prev ? { ...prev, status: 'failed', error: data.error || errorMsg, errorCode: data.errorCode || null } : null);
        setError(errorMsg);
        setLoading(false);
        options.onError?.(errorMsg);
        closeConnection();
      }
    });

    eventSource.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      clearTimeout(sseTimeout);
      incrementSSEFailCount();
      // SSE auto-reconnects, but we also start polling as a safe fallback.
      if (jobIdRef.current === jobId && isLoadingRef.current) {
        startPolling(jobId, 'sse_error');
      }
    };

    eventSourceRef.current = eventSource;
  }, [closeConnection, options, setLoading, startPolling, stopPolling]);

  // Submit a new job
  const submitJob = useCallback(async (
    endpoint: string,
    formData: FormData
  ): Promise<string | null> => {
    stopPolling();
    setLoading(true);
    setError(null);
    setJob(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (response.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) {
          const retriedResponse = await fetch(endpoint, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          if (!retriedResponse.ok) {
            const parsedError = await parseJobSubmitError(retriedResponse, 'Failed to submit job');
            if (parsedError.fallback) {
              throw new Error('async_unavailable');
            }
            throw new Error(parsedError.message);
          }
          const retriedData = await retriedResponse.json().catch(() => ({} as Record<string, unknown>));
          const jobId = typeof retriedData.jobId === 'string' ? retriedData.jobId : '';
          if (!jobId) {
            throw new Error('Failed to submit job');
          }
          jobIdRef.current = jobId;

          setJob({
            id: jobId,
            status: 'pending',
            progress: { stage: 'queued', percent: 0 },
          });

          connectSSE(jobId);
          return jobId;
        }
      }

      if (!response.ok) {
        const parsedError = await parseJobSubmitError(response, 'Failed to submit job');
        // Check if fallback to sync mode is suggested
        if (parsedError.fallback) {
          throw new Error('async_unavailable');
        }
        throw new Error(parsedError.message);
      }

      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      const jobId = typeof data.jobId === 'string' ? data.jobId : '';
      if (!jobId) {
        throw new Error('Failed to submit job');
      }
      jobIdRef.current = jobId;

      // Initialize job state
      setJob({
        id: jobId,
        status: 'pending',
        progress: { stage: 'queued', percent: 0 },
      });

      // Connect to SSE for real-time updates
      connectSSE(jobId);

      return jobId;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const looksLikeNetworkIssue =
        err instanceof TypeError ||
        /failed to fetch|network|load failed|fetch/i.test(errorMsg);

      if (looksLikeNetworkIssue) {
        const recoveredJob = await recoverRecentJob(endpoint);
        if (recoveredJob) {
          jobIdRef.current = recoveredJob.id;
          setError(null);
          setJob(recoveredJob);

          const stillRunning =
            recoveredJob.status !== 'completed' && recoveredJob.status !== 'failed';
          setLoading(stillRunning);

          // Ensure we have a fallback even if SSE is blocked.
          connectionIssueReportedRef.current = true;
          startPolling(recoveredJob.id, 'recovered');
          connectSSE(recoveredJob.id);

          options.onConnectionIssue?.(
            'Upload angekommen. Wir stellen die Verbindung wieder her.',
            recoveredJob.id
          );

          if (recoveredJob.status === 'completed') {
            options.onComplete?.(recoveredJob);
            closeConnection();
          }

          return recoveredJob.id;
        }
      }

      setError(errorMsg);
      setLoading(false);
      options.onError?.(errorMsg);
      return null;
    }
  }, [closeConnection, connectSSE, options, recoverRecentJob, setLoading, startPolling, stopPolling]);

  // Download job result
  const downloadResult = useCallback(async (filename?: string): Promise<Blob | null> => {
    if (!jobIdRef.current) {
      console.error('[useJob] No job ID for download');
      return null;
    }

    try {
      const response = await fetchWithAuthRetry(`/api/jobs/${jobIdRef.current}/result`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to download result');
      }

      const blob = await response.blob();

      // Trigger browser download if filename provided
      if (filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      return blob;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Download failed';
      setError(errorMsg);
      options.onError?.(errorMsg);
      return null;
    }
  }, [options]);

  // Cancel a pending job
  const cancelJob = useCallback(async (): Promise<boolean> => {
    if (!jobIdRef.current) return false;

    try {
      let response = await fetch(`/api/jobs/${jobIdRef.current}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) {
          response = await fetch(`/api/jobs/${jobIdRef.current}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel job');
      }

      closeConnection();
      setJob(null);
      setLoading(false);
      jobIdRef.current = null;
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Cancel failed';
      setError(errorMsg);
      return false;
    }
  }, [closeConnection, setLoading]);

  // Reset state
  const reset = useCallback(() => {
    closeConnection();
    setJob(null);
    setError(null);
    setLoading(false);
    jobIdRef.current = null;
  }, [closeConnection, setLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeConnection();
    };
  }, [closeConnection]);

  return {
    job,
    isLoading,
    error,
    submitJob,
    pollJobStatus,
    downloadResult,
    cancelJob,
    reset,
  };
}

/**
 * Hook to check if async jobs are available (Redis running)
 */
export function useAsyncJobsAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const response = await fetch('/api/jobs/status', {
          credentials: 'include',
        });
        const data = await response.json();
        setAvailable(data.asyncJobsAvailable);
      } catch {
        setAvailable(false);
      } finally {
        setLoading(false);
      }
    };

    checkAvailability();
  }, []);

  return { available, loading };
}

/**
 * Hook to check if SSE (Server-Sent Events) connections work
 * Some corporate browsers block SSE via Content Security Policy
 */
export function useSSEAvailable(isAuthenticated?: boolean) {
  const [sseAvailable, setSSEAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let timeoutId: number | null = null;

    const testSSE = () => {
      try {
        // Try to connect to SSE endpoint with a test connection
        eventSource = new EventSource(`/api/jobs/events?jobIds=test`, {
          withCredentials: true,
        });

        // If we get any event or the connection opens, SSE works
        eventSource.onopen = () => {
          console.log('[SSE Test] Connection successful');
          setSSEAvailable(true);
          setLoading(false);
          eventSource?.close();
        };

        // Listen for the connected event
        eventSource.addEventListener('connected', () => {
          console.log('[SSE Test] Connected event received');
          setSSEAvailable(true);
          setLoading(false);
          eventSource?.close();
        });

        // If there's an error (CSP block, 401, etc.), SSE doesn't work
        eventSource.onerror = (err) => {
          console.warn('[SSE Test] Connection failed (CSP or auth issue):', err);
          setSSEAvailable(false);
          setLoading(false);
          eventSource?.close();
        };

        // Timeout after 5 seconds - if no response, assume it doesn't work
        timeoutId = window.setTimeout(() => {
          if (loading) {
            console.warn('[SSE Test] Connection timeout');
            setSSEAvailable(false);
            setLoading(false);
            eventSource?.close();
          }
        }, 5000);

      } catch (err) {
        // EventSource constructor threw - CSP blocking
        console.warn('[SSE Test] EventSource blocked:', err);
        setSSEAvailable(false);
        setLoading(false);
      }
    };

    // Only test if we have a token (user is authenticated)
    if (isAuthenticated) {
      testSSE();
    } else {
      // No token yet, wait for auth
      setLoading(false);
      setSSEAvailable(null);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      eventSource?.close();
    };
  }, [isAuthenticated]);

  return { sseAvailable, loading };
}
