import { useMemo } from "react";

import { cn } from "@/lib/utils";

export function DashboardSparkline({
  data,
  className,
  stroke = "currentColor",
  fill = "currentColor",
  height = 40,
  width = 96,
}: {
  data: readonly number[];
  className?: string;
  stroke?: string;
  fill?: string;
  height?: number;
  width?: number;
}) {
  const { line, area } = useMemo(() => {
    if (data.length === 0) return { line: "", area: "" };
    const max = Math.max(1, ...data);
    const step = data.length > 1 ? width / (data.length - 1) : 0;
    const points = data.map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 2) - 1;
      return [x, y] as const;
    });
    const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
    const last = points[points.length - 1];
    const first = points[0];
    const area = `${line} L${last[0]},${height} L${first[0]},${height} Z`;
    return { line, area };
  }, [data, height, width]);

  return (
    <svg
      role="presentation"
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
    >
      {area ? <path d={area} fill={fill} fillOpacity={0.15} /> : null}
      {line ? (
        <path d={line} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
