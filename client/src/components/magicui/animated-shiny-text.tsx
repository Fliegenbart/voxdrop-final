import * as React from "react";

import { cn } from "@/lib/utils";

export interface AnimatedShinyTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  shimmerWidth?: number;
}

// MagicUI-inspired.
// Animated gradient that "wipes" through the text. Useful for badges/headlines without loading external fonts.
export function AnimatedShinyText({
  shimmerWidth = 100,
  className,
  style,
  children,
  ...props
}: AnimatedShinyTextProps) {
  return (
    <span
      style={
        {
          "--shiny-width": `${shimmerWidth}px`,
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        "inline-block animate-shiny-text motion-reduce:animate-none bg-clip-text text-transparent",
        "bg-[length:200%_100%]",
        // Default: neutral/ink. Override via className for brand gradients.
        "bg-[linear-gradient(110deg,rgb(2_6_23),45%,rgb(255_255_255),55%,rgb(2_6_23))]",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
