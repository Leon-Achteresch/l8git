import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export type PieSlice = {
  key: string;
  label: string;
  value: number;
  detail?: string;
};

const PATTERNS = [
  { rotate: 45, spacing: 5, strokeWidth: 1.6, opacity: 0.85 },
  { rotate: -45, spacing: 5, strokeWidth: 1.4, opacity: 0.6 },
  { rotate: 0, spacing: 4.5, strokeWidth: 1.3, opacity: 0.7 },
  { rotate: 90, spacing: 4.5, strokeWidth: 1.3, opacity: 0.5 },
  { rotate: 45, spacing: 7, strokeWidth: 2.6, opacity: 0.65 },
  { rotate: -45, spacing: 7, strokeWidth: 2.4, opacity: 0.4 },
] as const;

function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= Math.PI * 2 - 0.0001) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const x0 = cx + r * Math.cos(start);
  const y0 = cy + r * Math.sin(start);
  const x1 = cx + r * Math.cos(end);
  const y1 = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function PatternPie({
  slices,
  size = 168,
  formatValue,
  className,
}: {
  slices: PieSlice[];
  size?: number;
  formatValue: (n: number) => string;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const sweep = total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const arc = { slice: s, index: i, start: angle, end: angle + sweep };
    angle += sweep;
    return arc;
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-x-7 gap-y-4", className)}>
      <svg width={size} height={size} className="shrink-0">
        <defs>
          {PATTERNS.map((p, i) => (
            <pattern
              key={i}
              id={`${id}-p${i}`}
              patternUnits="userSpaceOnUse"
              width={p.spacing}
              height={p.spacing}
              patternTransform={`rotate(${p.rotate})`}
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={p.spacing}
                strokeWidth={p.strokeWidth}
                className="stroke-foreground"
                strokeOpacity={p.opacity}
              />
            </pattern>
          ))}
        </defs>
        {arcs.map((a) =>
          a.end - a.start <= 0 ? null : (
            <path
              key={a.slice.key}
              d={slicePath(cx, cy, hover === a.index ? r : r - 2, a.start, a.end)}
              fill={`url(#${id}-p${a.index % PATTERNS.length})`}
              stroke="var(--card)"
              strokeWidth={2}
              onMouseEnter={() => setHover(a.index)}
              onMouseLeave={() => setHover(null)}
            />
          ),
        )}
      </svg>

      <ul className="min-w-[180px] flex-1 space-y-2">
        {slices.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li
              key={s.key}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-1 py-0.5 text-xs transition-opacity",
                hover !== null && hover !== i && "opacity-40",
              )}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <svg width={14} height={14} className="shrink-0">
                <rect
                  x={0.5}
                  y={0.5}
                  width={13}
                  height={13}
                  rx={3}
                  fill={`url(#${id}-p${i % PATTERNS.length})`}
                  className="stroke-border"
                />
              </svg>
              <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
              <span className="w-12 text-right tabular-nums text-muted-foreground">
                {pct.toFixed(1)}%
              </span>
              <span className="w-14 text-right tabular-nums text-muted-foreground">
                {s.detail ?? formatValue(s.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
