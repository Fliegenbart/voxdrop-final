import { useState, useRef, useCallback, useEffect } from "react";

interface Segment {
  start: number;
  end: number;
}

interface UsePreviewPlaybackOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  segments: Segment[];
  onComplete?: () => void;
}

interface UsePreviewPlaybackReturn {
  /** Whether preview is currently playing. */
  isPreviewing: boolean;
  /** Start previewing the segments. */
  startPreview: () => void;
  /** Stop the preview and return to the original position. */
  stopPreview: () => void;
  /** Current segment index being played (0-based). */
  currentSegmentIndex: number;
}

/**
 * Preview playback that plays only the selected segments of a video.
 *
 * Use case: Before exporting a trim or cut, the user can preview exactly
 * what the result will look like. The video plays through the segments
 * sequentially, automatically jumping between them.
 */
export function usePreviewPlayback({
  videoRef,
  segments,
  onComplete,
}: UsePreviewPlaybackOptions): UsePreviewPlaybackReturn {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  const rafRef = useRef<number | null>(null);
  const segmentIndexRef = useRef(0);
  const savedTimeRef = useRef(0);

  const cancel = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    cancel();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.playbackRate = 1;
      // Restore original position.
      video.currentTime = savedTimeRef.current;
    }
    setIsPreviewing(false);
    setCurrentSegmentIndex(0);
    segmentIndexRef.current = 0;
  }, [cancel, videoRef]);

  const startPreview = useCallback(() => {
    const video = videoRef.current;
    if (!video || segments.length === 0) return;

    // Filter out invalid segments.
    const validSegments = segments.filter((s) => s.end > s.start);
    if (validSegments.length === 0) return;

    // Save current position.
    savedTimeRef.current = video.currentTime;

    setIsPreviewing(true);
    segmentIndexRef.current = 0;
    setCurrentSegmentIndex(0);

    // Seek to start of first segment.
    video.currentTime = validSegments[0].start;
    video.playbackRate = 1;
    video.play().catch(() => {});

    const tick = () => {
      if (!video) return;

      const idx = segmentIndexRef.current;
      const seg = validSegments[idx];

      if (!seg) {
        // All segments done.
        stopPreview();
        onComplete?.();
        return;
      }

      if (video.currentTime >= seg.end) {
        // Move to next segment.
        const nextIdx = idx + 1;
        if (nextIdx >= validSegments.length) {
          // All done.
          stopPreview();
          onComplete?.();
          return;
        }

        segmentIndexRef.current = nextIdx;
        setCurrentSegmentIndex(nextIdx);
        video.currentTime = validSegments[nextIdx].start;
        video.play().catch(() => {});
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [videoRef, segments, stopPreview, onComplete]);

  // Cleanup on unmount.
  useEffect(() => cancel, [cancel]);

  return {
    isPreviewing,
    startPreview,
    stopPreview,
    currentSegmentIndex,
  };
}
