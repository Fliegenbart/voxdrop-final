import { useState, useEffect, useRef, useCallback } from "react";

interface UseExportProgressOptions {
  /** Whether an export operation is currently running. */
  isProcessing: boolean;
  /** Estimated output duration in seconds (used to guess total processing time). */
  estimatedDurationSeconds?: number;
}

interface UseExportProgressReturn {
  /** 0–100 percent progress. */
  percent: number;
  /** Human-readable stage label (German). */
  stage: string;
  /** Elapsed seconds since processing started. */
  elapsedSeconds: number;
  /** Reset the progress (e.g. after completion toast). */
  reset: () => void;
}

/**
 * Time-based export progress estimation.
 *
 * Since the current video API calls block synchronously (no job ID returned),
 * we cannot get real progress from the server.  Instead we show a smooth,
 * time-based progress bar that gives the user visual feedback during export.
 *
 * Phases:
 *   0% –  5%  "Vorbereitung..."    (first 1.5 s)
 *   5% – 90%  "Verarbeitung..."    (proportional to estimated duration)
 *  90% – 95%  "Fertigstellung..."  (last 10% of estimated time)
 *  → jumps to 100% when isProcessing becomes false
 */
export function useExportProgress({
  isProcessing,
  estimatedDurationSeconds = 30,
}: UseExportProgressOptions): UseExportProgressReturn {
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const wasProcessingRef = useRef(false);

  // Estimated total processing time: input duration * factor, min 5s.
  const estimatedTotalSeconds = Math.max(5, estimatedDurationSeconds * 1.5);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancelRaf();
    setPercent(0);
    setStage("");
    setElapsed(0);
    wasProcessingRef.current = false;
  }, [cancelRaf]);

  useEffect(() => {
    if (isProcessing && !wasProcessingRef.current) {
      // Export just started.
      wasProcessingRef.current = true;
      startTimeRef.current = performance.now();
      setPercent(0);
      setStage("Vorbereitung...");
      setElapsed(0);

      const tick = () => {
        const elapsedMs = performance.now() - startTimeRef.current;
        const elapsedSec = elapsedMs / 1000;
        setElapsed(elapsedSec);

        const ratio = Math.min(elapsedSec / estimatedTotalSeconds, 1);

        let p: number;
        let s: string;

        if (ratio < 0.05) {
          // First ~5% of estimated time → preparation phase
          p = ratio * 100; // 0–5%
          s = "Vorbereitung...";
        } else if (ratio < 0.9) {
          // 5%–90% of estimated time → processing phase
          // Map ratio 0.05..0.9 → percent 5..90
          p = 5 + ((ratio - 0.05) / 0.85) * 85;
          s = "Verarbeitung...";
        } else {
          // Last 10% → finalization (caps at 95% until done)
          p = Math.min(95, 90 + ((ratio - 0.9) / 0.1) * 5);
          s = "Fertigstellung...";
        }

        setPercent(Math.round(p));
        setStage(s);

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    }

    if (!isProcessing && wasProcessingRef.current) {
      // Export just finished.
      cancelRaf();
      setPercent(100);
      setStage("Fertig!");
      wasProcessingRef.current = false;
    }

    return cancelRaf;
  }, [isProcessing, estimatedTotalSeconds, cancelRaf]);

  return { percent, stage, elapsedSeconds: elapsed, reset };
}
