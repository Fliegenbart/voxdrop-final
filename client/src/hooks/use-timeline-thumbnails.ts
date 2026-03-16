import { useState, useEffect, useRef, useCallback } from "react";

interface ThumbnailEntry {
  time: number;
  url: string;
}

interface UseTimelineThumbnailsOptions {
  /** URL for the video to extract thumbnails from (preferably proxy). */
  videoUrl: string | null;
  /** Total video duration in seconds. */
  duration: number;
  /** Approximate pixels per thumbnail (determines density). */
  thumbWidthPx?: number;
  /** Container width in pixels (determines how many thumbnails to generate). */
  containerWidthPx?: number;
  /** Whether the hook is active (set false to skip extraction). */
  enabled?: boolean;
}

interface UseTimelineThumbnailsReturn {
  /** Array of thumbnail blob URLs with their timestamps. */
  thumbnails: ThumbnailEntry[];
  /** Whether thumbnails are still being generated. */
  isLoading: boolean;
  /** Percentage complete (0–100). */
  progress: number;
}

const THUMB_WIDTH = 80;
const THUMB_HEIGHT = 45;
const MAX_THUMBNAILS = 100;

/**
 * Extract video frame thumbnails using a hidden <video> + <canvas>.
 *
 * Uses the proxy video URL (same-origin) to avoid CORS issues.
 * Thumbnails are cached as blob URLs and cleaned up on unmount.
 */
export function useTimelineThumbnails({
  videoUrl,
  duration,
  thumbWidthPx = THUMB_WIDTH,
  containerWidthPx = 800,
  enabled = true,
}: UseTimelineThumbnailsOptions): UseTimelineThumbnailsReturn {
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const abortRef = useRef(false);
  const blobUrlsRef = useRef<string[]>([]);
  const lastKeyRef = useRef<string>("");

  // Cleanup blob URLs on unmount.
  useEffect(() => {
    return () => {
      abortRef.current = true;
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const extractThumbnails = useCallback(async () => {
    if (!videoUrl || !duration || duration <= 0 || !enabled) {
      setThumbnails([]);
      setIsLoading(false);
      return;
    }

    // Cache key to avoid re-extraction when nothing changed.
    const key = `${videoUrl}:${duration.toFixed(1)}:${containerWidthPx}`;
    if (key === lastKeyRef.current && thumbnails.length > 0) return;
    lastKeyRef.current = key;

    // Cleanup previous batch.
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current = [];
    setThumbnails([]);

    // Calculate how many thumbnails we need.
    const count = Math.min(
      MAX_THUMBNAILS,
      Math.max(1, Math.ceil(containerWidthPx / thumbWidthPx)),
    );
    const interval = duration / count;

    setIsLoading(true);
    setProgress(0);
    abortRef.current = false;

    // Create hidden video element for seeking.
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    // Create canvas for frame capture.
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setIsLoading(false);
      return;
    }

    // Wait for the video to be ready.
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video load failed"));
      // Timeout after 10 seconds.
      setTimeout(() => reject(new Error("Video load timeout")), 10000);
    }).catch(() => {
      setIsLoading(false);
      return;
    });

    const entries: ThumbnailEntry[] = [];

    for (let i = 0; i < count; i++) {
      if (abortRef.current) break;

      const time = Math.min(i * interval + interval / 2, duration - 0.1);

      try {
        // Seek and wait for the frame.
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          // Safety timeout.
          setTimeout(() => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          }, 2000);
        });

        if (abortRef.current) break;

        // Draw frame to canvas.
        ctx.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);

        // Convert to blob URL.
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.6);
        });

        if (blob && !abortRef.current) {
          const url = URL.createObjectURL(blob);
          blobUrlsRef.current.push(url);
          entries.push({ time, url });
        }
      } catch {
        // Skip failed frame, continue with next.
      }

      // Update progress.
      setProgress(Math.round(((i + 1) / count) * 100));
    }

    // Cleanup video element.
    video.src = "";
    video.load();

    if (!abortRef.current) {
      setThumbnails(entries);
    }
    setIsLoading(false);
  }, [videoUrl, duration, containerWidthPx, thumbWidthPx, enabled, thumbnails.length]);

  useEffect(() => {
    extractThumbnails();
  }, [extractThumbnails]);

  return { thumbnails, isLoading, progress };
}
