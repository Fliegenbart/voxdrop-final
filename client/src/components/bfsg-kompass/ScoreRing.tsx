import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function scoreColor(score: number) {
  if (score >= 90) return "var(--color-accent)";
  if (score >= 60) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function ScoreRing({
  score,
  size = 160,
  className,
  children,
}: {
  score: number;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const s = clamp01(score);
  const data = useMemo(
    () => [
      { name: "score", value: s },
      { name: "rest", value: 100 - s },
    ],
    [s]
  );

  const c = scoreColor(s);
  const bg = "rgba(15, 23, 42, 0.08)"; // slate-900 @ 8%

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={Math.round(size * 0.34)}
          outerRadius={Math.round(size * 0.46)}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={!reduced}
          animationDuration={700}
          animationEasing="ease-out"
        >
          <Cell fill={c} />
          <Cell fill={bg} />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
