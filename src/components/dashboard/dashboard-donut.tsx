import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DonutSlice = {
  key: string;
  value: number;
  color: string;
};

export function DashboardDonut({
  slices,
  size = 88,
  thickness = 12,
  center,
  className,
}: {
  slices: readonly DonutSlice[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  className?: string;
}) {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="-rotate-90"
        role="presentation"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
          opacity={0.35}
        />
        {total > 0
          ? slices.map((slice) => {
              const len = (Math.max(0, slice.value) / total) * circumference;
              const dasharray = `${len} ${circumference - len}`;
              const node = (
                <circle
                  key={slice.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={thickness}
                  strokeDasharray={dasharray}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return node;
            })
          : null}
      </svg>
      {center ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {center}
        </div>
      ) : null}
    </div>
  );
}
