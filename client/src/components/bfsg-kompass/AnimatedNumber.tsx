import { useEffect, useMemo, useRef, useState } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function AnimatedNumber({
  value,
  durationMs = 900,
  className,
  formatter,
}: {
  value: number;
  durationMs?: number;
  className?: string;
  formatter?: (n: number) => string;
}) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [display, setDisplay] = useState(() => clampInt(value, -1_000_000_000, 1_000_000_000));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const to = clampInt(value, -1_000_000_000, 1_000_000_000);
    if (reduced || durationMs <= 0) {
      setDisplay(to);
      return;
    }

    const from = display;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / durationMs));
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs, reduced]);

  return <span className={className}>{formatter ? formatter(display) : String(display)}</span>;
}

