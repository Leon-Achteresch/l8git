import { m, useReducedMotion } from "motion/react";

import { easeOutSoft } from "@/components/motion/kit";
import { cn } from "@/lib/utils";

export function AgentContextRing({
  percent,
  size = 16,
  thickness = 2.5,
  className,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const value = Math.min(100, Math.max(0, percent));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label="Context window"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "shrink-0",
        value >= 90 ? "text-destructive" : value >= 70 ? "text-yellow-500" : "text-current",
        className,
      )}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} className="stroke-current opacity-20" />
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        className="stroke-current"
        strokeDasharray={circumference}
        initial={reduce ? false : { strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - value / 100) }}
        transition={reduce ? { duration: 0 } : easeOutSoft}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
