import { useMemo, useState } from "react";

import { ChartTooltip, ChartTooltipRow } from "@/components/dashboard/chart-tooltip";
import { useMeasure } from "@/hooks/use-measure";
import { cn } from "@/lib/utils";

export type HeatmapDay = {
  date: string;
  count: number;
};

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT_W = 30;
const TOP_H = 18;

const LEVEL_OPACITY = [0.07, 0.22, 0.42, 0.65, 0.92];

function level(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

export function CalendarHeatmap({
  days,
  locale,
  countLabel,
  className,
}: {
  days: HeatmapDay[];
  locale?: string;
  countLabel: string;
  className?: string;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<{ week: number; dow: number } | null>(null);

  const weeks = useMemo(() => {
    if (days.length === 0) return [];
    const result: (HeatmapDay | null)[][] = [];
    let current: (HeatmapDay | null)[] = [];
    const firstDow = (new Date(days[0].date + "T00:00:00Z").getUTCDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) current.push(null);
    for (const d of days) {
      current.push(d);
      if (current.length === 7) {
        result.push(current);
        current = [];
      }
    }
    if (current.length > 0) {
      while (current.length < 7) current.push(null);
      result.push(current);
    }
    return result;
  }, [days]);

  const weeksFit = Math.max(1, Math.floor((width - LEFT_W) / STEP));
  const visible = weeks.slice(-weeksFit);
  const max = Math.max(...days.map((d) => d.count), 0);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short" }),
    [locale],
  );
  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  );
  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );

  const weekdayLabels = useMemo(() => {
    const monday = new Date(Date.UTC(2024, 0, 1));
    return [0, 2, 4].map((offset) => {
      const d = new Date(monday.getTime() + offset * 86_400_000);
      return { row: offset, label: weekdayFmt.format(d) };
    });
  }, [weekdayFmt]);

  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = [];
    let prevMonth = -1;
    visible.forEach((week, wi) => {
      const first = week.find((d) => d !== null);
      if (!first) return;
      const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
      if (m !== prevMonth) {
        if (prevMonth !== -1 || wi === 0) {
          labels.push({ week: wi, label: monthFmt.format(new Date(first.date + "T00:00:00Z")) });
        }
        prevMonth = m;
      }
    });
    return labels.filter((l, i) => i === 0 || l.week - labels[i - 1].week >= 3);
  }, [visible, monthFmt]);

  const gridH = TOP_H + 7 * STEP;
  const hoveredDay =
    hover !== null ? (visible[hover.week]?.[hover.dow] ?? null) : null;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height: gridH }}>
      {width > 0 && visible.length > 0 ? (
        <svg width={width} height={gridH} className="block">
          {monthLabels.map((m) => (
            <text
              key={`${m.week}-${m.label}`}
              x={LEFT_W + m.week * STEP}
              y={11}
              className="fill-muted-foreground text-[10px]"
            >
              {m.label}
            </text>
          ))}
          {weekdayLabels.map((w) => (
            <text
              key={w.row}
              x={LEFT_W - 8}
              y={TOP_H + w.row * STEP + CELL - 2}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {w.label}
            </text>
          ))}
          {visible.map((week, wi) =>
            week.map((d, di) =>
              d === null ? null : (
                <rect
                  key={d.date}
                  x={LEFT_W + wi * STEP}
                  y={TOP_H + di * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2.5}
                  className={cn(
                    "fill-foreground",
                    hover?.week === wi && hover?.dow === di && "stroke-foreground/60",
                  )}
                  fillOpacity={LEVEL_OPACITY[level(d.count, max)]}
                  onMouseEnter={() => setHover({ week: wi, dow: di })}
                  onMouseLeave={() => setHover(null)}
                />
              ),
            ),
          )}
        </svg>
      ) : null}

      {hoveredDay && hover ? (
        <ChartTooltip
          x={LEFT_W + hover.week * STEP + CELL / 2}
          y={TOP_H + hover.dow * STEP - 8}
          containerWidth={width}
        >
          <div className="mb-1 text-[11px] font-medium">
            {dayFmt.format(new Date(hoveredDay.date + "T00:00:00Z"))}
          </div>
          <ChartTooltipRow label={countLabel} value={hoveredDay.count} />
        </ChartTooltip>
      ) : null}
    </div>
  );
}
