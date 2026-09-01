import { m, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function AgentWorkingRing({
  size = 22,
  thickness = 1.7,
  className,
}: {
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <m.svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("text-current", className)}
      animate={reduce ? undefined : { rotate: 360 }}
      transition={reduce ? undefined : { repeat: Infinity, duration: 1.05, ease: "linear" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        className="stroke-current opacity-20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        className="stroke-current"
        strokeDasharray={`${circumference * 0.28} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </m.svg>
  );
}
