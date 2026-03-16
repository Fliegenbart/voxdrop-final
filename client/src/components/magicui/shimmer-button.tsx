import * as React from "react";

import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  shimmerColor?: string;
  shimmerSize?: string;
  shimmerDuration?: string;
  borderRadius?: string;
  background?: string;
}

// MagicUI-inspired shimmer button with animated border + shimmer sweep.
export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      asChild = false,
      shimmerColor = "rgba(255,255,255,0.85)",
      shimmerSize = "0.12em",
      shimmerDuration = "1.6s",
      borderRadius = "14px",
      background = "rgb(37 99 235)", // blue-600
      className,
      children,
      ...props
    },
    ref
  ) => {
    const styleVars = {
      "--spread": "90deg",
      "--shimmer-color": shimmerColor,
      "--radius": borderRadius,
      "--speed": shimmerDuration,
      "--cut": shimmerSize,
      "--bg": background,
    } as React.CSSProperties;

    const baseClassName = cn(
      "group relative z-0 inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap",
      "px-6 py-3 text-white [border-radius:var(--radius)]",
      "shadow-lg shadow-blue-600/25",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
      "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-[1px]",
      className
    );

    // NOTE: We can't use Radix Slot for `asChild` here because this component renders
    // multiple decorative spans. Slot requires a single element child.
    if (asChild) {
      const child = React.Children.only(children);
      if (!React.isValidElement(child)) {
        throw new Error("ShimmerButton `asChild` expects a single React element child.");
      }

      return React.cloneElement(child, {
        ...props,
        style: { ...(child.props as any)?.style, ...styleVars },
        className: cn(baseClassName, (child.props as any)?.className),
        children: (
          <>
            <span className="relative z-10 inline-flex items-center gap-2">
              {(child.props as any)?.children}
            </span>

            {/* Animated border */}
            <span className="pointer-events-none absolute inset-0 overflow-hidden [border-radius:var(--radius)]">
              <span className="absolute inset-0 [border-radius:var(--radius)] [padding:var(--cut)]">
                <span
                  className={cn(
                    "absolute inset-0 [border-radius:var(--radius)]",
                    "bg-[conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent,var(--shimmer-color),transparent)]",
                    "animate-spin-around motion-reduce:animate-none [animation-duration:var(--speed)]",
                    "[mask:linear-gradient(#0000,#0000),linear-gradient(#000,#000)]",
                    "[mask-composite:intersect]",
                    "[mask-clip:padding-box,border-box]"
                  )}
                />
              </span>
            </span>

            {/* Base fill */}
            <span className="pointer-events-none absolute inset-[var(--cut)] [border-radius:var(--radius)] bg-[var(--bg)]" />

            {/* Shimmer sweep */}
            <span className="pointer-events-none absolute inset-[var(--cut)] [border-radius:var(--radius)] bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer motion-reduce:animate-none [animation-duration:var(--speed)]" />
          </>
        ),
      } as any);
    }

    return (
      <button ref={ref} style={styleVars} className={baseClassName} {...props}>
        <span className="relative z-10 inline-flex items-center gap-2">{children}</span>

        {/* Animated border */}
        <span className="pointer-events-none absolute inset-0 overflow-hidden [border-radius:var(--radius)]">
          <span className="absolute inset-0 [border-radius:var(--radius)] [padding:var(--cut)]">
            <span
              className={cn(
                "absolute inset-0 [border-radius:var(--radius)]",
                "bg-[conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent,var(--shimmer-color),transparent)]",
                "animate-spin-around motion-reduce:animate-none [animation-duration:var(--speed)]",
                "[mask:linear-gradient(#0000,#0000),linear-gradient(#000,#000)]",
                "[mask-composite:intersect]",
                "[mask-clip:padding-box,border-box]"
              )}
            />
          </span>
        </span>

        {/* Base fill */}
        <span className="pointer-events-none absolute inset-[var(--cut)] [border-radius:var(--radius)] bg-[var(--bg)]" />

        {/* Shimmer sweep */}
        <span className="pointer-events-none absolute inset-[var(--cut)] [border-radius:var(--radius)] bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer motion-reduce:animate-none [animation-duration:var(--speed)]" />
      </button>
    );
  }
);

ShimmerButton.displayName = "ShimmerButton";
