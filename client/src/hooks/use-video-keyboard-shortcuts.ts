import { useEffect, useRef, useCallback } from "react";

interface UseVideoKeyboardShortcutsOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  duration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSetInPoint?: () => void;
  onSetOutPoint?: () => void;
  onAddCutMarker?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  enabled?: boolean;
}

/**
 * Keyboard shortcuts for the Videoschnitt editor.
 *
 * Space       – Play / Pause
 * I           – Set In-Point (trim start / cut marker depending on mode)
 * O           – Set Out-Point (trim end)
 * J / K / L   – Shuttle reverse / stop / forward (1×, 2×, 4×, 8×)
 * ← / →      – Step 1 frame (1/30 s); with Shift: 1 s; with Alt: 10 frames
 * , / .       – Step 1 frame backward / forward (NLE standard)
 * Ctrl+Z      – Undo
 * Ctrl+Y      – Redo  (also Ctrl+Shift+Z)
 */
export function useVideoKeyboardShortcuts({
  videoRef,
  duration,
  onPlayPause,
  onSeek,
  onSetInPoint,
  onSetOutPoint,
  onAddCutMarker,
  onUndo,
  onRedo,
  enabled = true,
}: UseVideoKeyboardShortcutsOptions) {
  const shuttleSpeedRef = useRef(0);
  const shuttleRafRef = useRef<number | null>(null);
  const shuttleLastTsRef = useRef<number>(0);

  const FRAME_DURATION = 1 / 30; // ~33 ms at 30 fps

  // Cancel any running reverse-shuttle animation loop.
  const cancelShuttleLoop = useCallback(() => {
    if (shuttleRafRef.current !== null) {
      cancelAnimationFrame(shuttleRafRef.current);
      shuttleRafRef.current = null;
    }
  }, []);

  // Start a requestAnimationFrame loop that manually seeks backward for negative playback rates.
  const startReverseShuttle = useCallback(() => {
    cancelShuttleLoop();
    shuttleLastTsRef.current = performance.now();

    const step = (now: number) => {
      const video = videoRef.current;
      if (!video || shuttleSpeedRef.current >= 0) {
        cancelShuttleLoop();
        return;
      }
      const dt = (now - shuttleLastTsRef.current) / 1000;
      shuttleLastTsRef.current = now;
      const newTime = Math.max(0, video.currentTime + shuttleSpeedRef.current * dt);
      video.currentTime = newTime;
      shuttleRafRef.current = requestAnimationFrame(step);
    };
    shuttleRafRef.current = requestAnimationFrame(step);
  }, [videoRef, cancelShuttleLoop]);

  // Apply the current shuttle speed to the video element.
  const applyShuttleSpeed = useCallback(
    (speed: number) => {
      shuttleSpeedRef.current = speed;
      const video = videoRef.current;
      if (!video) return;

      cancelShuttleLoop();

      if (speed === 0) {
        video.pause();
        video.playbackRate = 1;
        return;
      }

      if (speed > 0) {
        video.playbackRate = speed;
        video.play().catch(() => {});
      } else {
        // Negative playback: pause native playback and use manual seeking.
        video.pause();
        video.playbackRate = 1;
        startReverseShuttle();
      }
    },
    [videoRef, cancelShuttleLoop, startReverseShuttle],
  );

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs.
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const video = videoRef.current;
      const ct = video?.currentTime ?? 0;

      switch (e.key) {
        // ── Play / Pause ─────────────────────────────────
        case " ": {
          e.preventDefault();
          // Reset shuttle before toggling play.
          if (shuttleSpeedRef.current !== 0) {
            applyShuttleSpeed(0);
          }
          onPlayPause();
          break;
        }

        // ── In / Out Points ──────────────────────────────
        case "i":
        case "I": {
          e.preventDefault();
          onSetInPoint?.();
          break;
        }
        case "o":
        case "O": {
          e.preventDefault();
          onSetOutPoint?.();
          break;
        }

        // ── Cut marker (M key) ───────────────────────────
        case "m":
        case "M": {
          e.preventDefault();
          onAddCutMarker?.();
          break;
        }

        // ── J / K / L Shuttle ────────────────────────────
        case "j":
        case "J": {
          e.preventDefault();
          const cur = shuttleSpeedRef.current;
          let next: number;
          if (cur > 0) {
            // If shuttling forward, stop first.
            next = 0;
          } else if (cur === 0) {
            next = -1;
          } else {
            // Already reversing – increase speed.
            next = Math.max(-8, cur * 2);
          }
          applyShuttleSpeed(next);
          break;
        }
        case "k":
        case "K": {
          e.preventDefault();
          applyShuttleSpeed(0);
          break;
        }
        case "l":
        case "L": {
          e.preventDefault();
          const cur = shuttleSpeedRef.current;
          let next: number;
          if (cur < 0) {
            next = 0;
          } else if (cur === 0) {
            next = 1;
          } else {
            next = Math.min(8, cur * 2);
          }
          applyShuttleSpeed(next);
          break;
        }

        // ── Frame Stepping ───────────────────────────────
        case "ArrowLeft": {
          e.preventDefault();
          if (shuttleSpeedRef.current !== 0) applyShuttleSpeed(0);
          const step = e.shiftKey ? 1 : e.altKey ? FRAME_DURATION * 10 : FRAME_DURATION;
          onSeek(Math.max(0, ct - step));
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (shuttleSpeedRef.current !== 0) applyShuttleSpeed(0);
          const step = e.shiftKey ? 1 : e.altKey ? FRAME_DURATION * 10 : FRAME_DURATION;
          onSeek(Math.min(duration, ct + step));
          break;
        }
        case ",": {
          e.preventDefault();
          if (shuttleSpeedRef.current !== 0) applyShuttleSpeed(0);
          onSeek(Math.max(0, ct - FRAME_DURATION));
          break;
        }
        case ".": {
          e.preventDefault();
          if (shuttleSpeedRef.current !== 0) applyShuttleSpeed(0);
          onSeek(Math.min(duration, ct + FRAME_DURATION));
          break;
        }

        // ── Undo / Redo ─────────────────────────────────
        case "z":
        case "Z": {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              onRedo?.();
            } else {
              onUndo?.();
            }
          }
          break;
        }
        case "y":
        case "Y": {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onRedo?.();
          }
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      cancelShuttleLoop();
      // Reset playback rate on unmount.
      if (videoRef.current) {
        videoRef.current.playbackRate = 1;
      }
    };
  }, [
    enabled,
    videoRef,
    duration,
    onPlayPause,
    onSeek,
    onSetInPoint,
    onSetOutPoint,
    onAddCutMarker,
    onUndo,
    onRedo,
    applyShuttleSpeed,
    cancelShuttleLoop,
  ]);

  // Cleanup shuttle loop on unmount (safety net).
  useEffect(() => cancelShuttleLoop, [cancelShuttleLoop]);
}
