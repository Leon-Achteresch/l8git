import { useState } from "react";

import { ChartTooltip, ChartTooltipRow } from "@/components/dashboard/chart-tooltip";
import { useMeasure } from "@/hooks/use-measure";
import { cn } from "@/lib/utils";

export type DashedDatum = {
  key: string;
  label: string;
  value: number;
};

const LABEL_H = 22;
const PILL_SPACE = 30;

export function DashedBarChart({
  data,
  height = 260,
  valueLabel,
  formatValue,
  className,
}: {
  data: DashedDatum[];
  height?: number;
  valueLabel: string;
  formatValue: (n: number) => string;
  className?: string;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const chartH = height - LABEL_H;
  const maxVal = Math.max(...data.map((d) => d.value), 0);
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const slot = data.length > 0 ? width / data.length : 0;
  const barW = Math.max(4, Math.min(8, slot * 0.3));
  const usableH = chartH - PILL_SPACE;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(width / 56))));

  const barTop = (v: number) =>
    chartH - (maxVal > 0 ? Math.max(v > 0 ? 6 : 0, (v / maxVal) * usableH) : 0);

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && data.length > 0 ? (
        <svg width={width} height={height} className="block">
          {data.map((d, idx) => {
            const cx = idx * slot + slot / 2;
            const top = barTop(d.value);
            const isPeak = idx === peakIdx && d.value > 0;
            const isHover = hover === idx;
            return (
              <g key={d.key}>
                {d.value > 0 ? (
                  <line
                    x1={cx}
                    x2={cx}
                    y1={chartH - 1}
                    y2={top}
                    strokeWidth={barW}
                    strokeDasharray="2.5 3.5"
                    className={cn(
                      isPeak
                        ? "stroke-foreground/90"
                        : isHover
                          ? "stroke-foreground/60"
                          : "stroke-foreground/30",
                    )}
                  />
                ) : (
                  <line
                    x1={cx}
                    x2={cx}
                    y1={chartH - 1}
                    y2={chartH - 3}
                    strokeWidth={barW}
                    className="stroke-foreground/15"
                  />
                )}
                {idx % labelEvery === 0 ? (
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {d.label}
                  </text>
                ) : null}
                <rect
                  x={idx * slot}
                  y={0}
                  width={slot}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHover(idx)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      ) : null}

      {width > 0 && data.length > 0 && data[peakIdx].value > 0 && hover === null ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold tabular-nums text-background"
          style={{
            left: Math.min(Math.max(peakIdx * slot + slot / 2, 28), width - 28),
            top: barTop(data[peakIdx].value) - 24,
          }}
        >
          {formatValue(data[peakIdx].value)}
        </div>
      ) : null}

      {hovered && hover !== null ? (
        <ChartTooltip
          x={hover * slot + slot / 2}
          y={barTop(hovered.value) - 8}
          containerWidth={width}
        >
          <div className="mb-1 text-[11px] font-medium">{hovered.label}</div>
          <ChartTooltipRow
            swatchClassName="bg-foreground/60"
            label={valueLabel}
            value={formatValue(hovered.value)}
          />
        </ChartTooltip>
      ) : null}
    </div>
  );
}
