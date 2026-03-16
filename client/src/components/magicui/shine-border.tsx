import * as React from "react";

import { cn } from "@/lib/utils";

export interface ShineBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  borderWidth?: number;
  duration?: number;
  shineColor?: string | string[];
  animated?: boolean;
}

// MagicUI-inspired. Uses a conic-gradient that rotates, masked to only show the border.
export function ShineBorder({
  borderWidth = 1,
  duration = 14,
  shineColor = ["#22d3ee", "#60a5fa", "#6366f1"],
  animated = true,
  className,
  style,
  ...props
}: ShineBorderProps) {
  const colors = Array.isArray(shineColor) ? shineColor : [shineColor];
  const colorStops = colors.join(", ");

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={{ padding: borderWidth, ...style }}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-[inherit]",
          "[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]",
          "[mask-composite:exclude]",
          "[mask-clip:content-box,border-box]",
          "![-webkit-mask-composite:xor]"
        )}
      >
        <div
          className={cn("absolute inset-0 rounded-[inherit]", animated && "motion-safe:animate-spin")}
          style={{
            animationDuration: `${duration}s`,
            backgroundImage: `conic-gradient(from 90deg at 50% 50%, ${colorStops}, transparent 100deg)`,
          }}
        />
      </div>
    </div>
  );
}
