import { m, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { easeOutSoft } from "@/components/motion/kit";

export function AgentRunFanout({
  count,
  rowHeight,
  rowGap,
  activeIndices,
  className,
}: {
  count: number;
  rowHeight: number;
  rowGap: number;
  activeIndices?: number[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const height = count * rowHeight + Math.max(0, count - 1) * rowGap;
  const width = 96;
  const midY = height / 2;

  return (
    <svg
      aria-hidden
      className={cn("shrink-0 overflow-visible", className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      {Array.from({ length: count }, (_, i) => {
        const y = i * (rowHeight + rowGap) + rowHeight / 2;
        const active = activeIndices?.includes(i) ?? false;
        return (
          <g key={i}>
            <m.path
              d={`M0 ${midY} C ${width * 0.55} ${midY}, ${width * 0.45} ${y}, ${width} ${y}`}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray={active ? "4 4" : undefined}
              className={active ? "text-blue-500" : "text-border"}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { ...easeOutSoft, delay: i * 0.05 }}
            />
            <m.circle
              cx={width}
              cy={y}
              r={3}
              className={active ? "fill-blue-500" : "fill-border"}
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={reduce ? { duration: 0 } : { ...easeOutSoft, delay: 0.08 + i * 0.05 }}
            />
          </g>
        );
      })}
    </svg>
  );
}
