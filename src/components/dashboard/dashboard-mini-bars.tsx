import { cn } from "@/lib/utils";

export function DashboardMiniBars({
  data,
  className,
  height = 40,
  width = 96,
  color = "currentColor",
}: {
  data: readonly number[];
  className?: string;
  height?: number;
  width?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return <div className={cn("h-full w-full", className)} aria-hidden />;
  }
  const max = Math.max(1, ...data);
  const gap = 1;
  const barWidth = Math.max(1, (width - gap * (data.length - 1)) / data.length);
  return (
    <svg
      role="presentation"
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
    >
      {data.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2));
        const x = i * (barWidth + gap);
        return <rect key={i} x={x} y={height - h} width={barWidth} height={h} rx={1} fill={color} />;
      })}
    </svg>
  );
}

export function DashboardMirrorBars({
  positive,
  negative,
  height = 40,
  width = 96,
  positiveColor = "var(--chart-1, #10b981)",
  negativeColor = "var(--chart-2, #f43f5e)",
  className,
}: {
  positive: readonly number[];
  negative: readonly number[];
  height?: number;
  width?: number;
  positiveColor?: string;
  negativeColor?: string;
  className?: string;
}) {
  const len = Math.max(positive.length, negative.length);
  if (len === 0) return null;
  const max = Math.max(1, ...positive, ...negative);
  const gap = 1;
  const barWidth = Math.max(1, (width - gap * (len - 1)) / len);
  const mid = height / 2;
  return (
    <svg
      role="presentation"
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
    >
      {Array.from({ length: len }).map((_, i) => {
        const p = positive[i] ?? 0;
        const n = negative[i] ?? 0;
        const ph = (p / max) * (mid - 1);
        const nh = (n / max) * (mid - 1);
        const x = i * (barWidth + gap);
        return (
          <g key={i}>
            {ph > 0 ? <rect x={x} y={mid - ph} width={barWidth} height={ph} rx={1} fill={positiveColor} /> : null}
            {nh > 0 ? <rect x={x} y={mid} width={barWidth} height={nh} rx={1} fill={negativeColor} /> : null}
          </g>
        );
      })}
    </svg>
  );
}
