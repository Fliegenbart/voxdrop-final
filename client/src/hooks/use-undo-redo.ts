import { useState, useRef, useCallback } from "react";

interface UseUndoRedoReturn<T> {
  /** Current state value. */
  state: T;
  /** Replace the current state and push a snapshot onto the undo stack. */
  setState: (next: T | ((prev: T) => T)) => void;
  /** Revert to the previous state. */
  undo: () => void;
  /** Re-apply the last undone change. */
  redo: () => void;
  /** Whether there is a state to undo to. */
  canUndo: boolean;
  /** Whether there is a state to redo to. */
  canRedo: boolean;
  /** Discard all history (keeps current state). */
  clearHistory: () => void;
  /** Replace the current state WITHOUT recording history (useful for restoring persisted state). */
  replaceState: (next: T) => void;
}

/**
 * Simple undo/redo hook with a capped history buffer.
 *
 * Design: ring-buffer style state history.  We keep up to `maxHistory`
 * past snapshots.  This is intentionally simple – no command pattern –
 * because the editing state in Videoschnitt is small and serializable.
 */
export function useUndoRedo<T>(initialState: T, maxHistory = 50): UseUndoRedoReturn<T> {
  const [state, setStateRaw] = useState<T>(initialState);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);

  const setState = useCallback(
    (next: T | ((prev: T) => T)) => {
      setStateRaw((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        // Push current state onto undo stack.
        pastRef.current = [...pastRef.current.slice(-(maxHistory - 1)), prev];
        // Any new change clears the redo stack.
        futureRef.current = [];
        return resolved;
      });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setStateRaw((current) => {
      if (pastRef.current.length === 0) return current;
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, current];
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setStateRaw((current) => {
      if (futureRef.current.length === 0) return current;
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, current];
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  const replaceState = useCallback((next: T) => {
    setStateRaw(next);
    // Don't touch history – this is for external restoration (e.g. localStorage).
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    clearHistory,
    replaceState,
  };
}
