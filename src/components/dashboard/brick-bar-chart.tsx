import { Fragment, useState } from "react";

import { ChartTooltip, ChartTooltipRow } from "@/components/dashboard/chart-tooltip";
import { useMeasure } from "@/hooks/use-measure";
import { cn } from "@/lib/utils";

export type BrickDatum = {
  key: string;
  label: string;
  primary: number;
  secondary: number;
};

const BRICK_H = 4;
const BRICK_GAP = 2;
const UNIT = BRICK_H + BRICK_GAP;
const AXIS_W = 38;
const LABEL_H = 22;

function niceCeil(value: number): number {
  if (value <= 0) return 4;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) {
    if (m * base >= value) return m * base;
  }
  return 10 * base;
}

export function BrickBarChart({
  data,
  height = 260,
  primaryLabel,
  secondaryLabel,
  formatValue,
  className,
}: {
  data: BrickDatum[];
  height?: number;
  primaryLabel: string;
  secondaryLabel: string;
  formatValue: (n: number) => string;
  className?: string;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const chartW = Math.max(0, width - AXIS_W);
  const chartH = height - LABEL_H;
  const rows = Math.max(4, Math.floor(chartH / UNIT));
  const maxVal = Math.max(...data.map((d) => d.primary + d.secondary), 0);
  const axisMax = niceCeil(maxVal);

  const slot = data.length > 0 ? chartW / data.length : 0;
  const barW = Math.max(3, Math.min(15, slot * 0.62));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(chartW / 88))));

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && data.length > 0 ? (
        <svg width={width} height={height} className="block">
          {[0.25, 0.5, 0.75, 1].map((f) => {
            const y = chartH - f * rows * UNIT + BRICK_GAP;
            return (
              <Fragment key={f}>
                <line
                  x1={AXIS_W}
                  x2={width}
                  y1={y}
                  y2={y}
                  strokeDasharray="2 5"
                  className="stroke-border"
                />
                <text
                  x={AXIS_W - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {formatValue(f * axisMax)}
                </text>
              </Fragment>
            );
          })}
          <text
            x={AXIS_W - 8}
            y={chartH + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            0
          </text>

          {data.map((d, idx) => {
            const x = AXIS_W + idx * slot + (slot - barW) / 2;
            const total = d.primary + d.secondary;
            const totalUnits =
              total <= 0 ? 0 : Math.max(1, Math.round((total / axisMax) * rows));
            const primaryUnits =
              d.primary <= 0
                ? 0
                : Math.max(1, Math.min(totalUnits, Math.round((d.primary / axisMax) * rows)));
            const secondaryUnits = Math.max(0, totalUnits - primaryUnits);
            const isHover = hover === idx;
            const bricks = [];
            for (let i = 0; i < primaryUnits + secondaryUnits; i++) {
              bricks.push(
                <rect
                  key={i}
                  x={x}
                  y={chartH - BRICK_H - i * UNIT}
                  width={barW}
                  height={BRICK_H}
                  rx={1.5}
                  className={cn(
                    i < primaryUnits
                      ? isHover
                        ? "fill-foreground/40"
                        : "fill-foreground/[0.22]"
                      : isHover
                        ? "fill-foreground"
                        : "fill-foreground/80",
                  )}
                />,
              );
            }
            return (
              <Fragment key={d.key}>
                {bricks}
                {idx % labelEvery === 0 ? (
                  <text
                    x={AXIS_W + idx * slot + slot / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {d.label}
                  </text>
                ) : null}
                <rect
                  x={AXIS_W + idx * slot}
                  y={0}
                  width={slot}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHover(idx)}
                  onMouseLeave={() => setHover(null)}
                />
              </Fragment>
            );
          })}
        </svg>
      ) : null}

      {hovered && hover !== null ? (
        <ChartTooltip
          x={AXIS_W + hover * slot + slot / 2}
          y={chartH - Math.min(rows, Math.round(((hovered.primary + hovered.secondary) / axisMax) * rows)) * UNIT - 10}
          containerWidth={width}
        >
          <div className="mb-1 text-[11px] font-medium">{hovered.label}</div>
          <ChartTooltipRow
            swatchClassName="bg-foreground/[0.22]"
            label={primaryLabel}
            value={formatValue(hovered.primary)}
          />
          <ChartTooltipRow
            swatchClassName="bg-foreground/80"
            label={secondaryLabel}
            value={formatValue(hovered.secondary)}
          />
        </ChartTooltip>
      ) : null}
    </div>
  );
}
