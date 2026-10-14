import { area, curveMonotoneX, line } from "d3-shape";
import { memo, useId, useMemo } from "react";

import type { CheckState, ContributionDay, HubLanguage } from "@/lib/hub/types";
import { cn } from "@/lib/utils";

// Everything here is static SVG computed once per data change: no animation
// loop, no layout reads, so it costs nothing per frame even on weak GPUs.

export const CHECK_COLOR: Record<Exclude<CheckState, null>, string> = {
  success: "var(--git-added)",
  failure: "var(--destructive)",
  pending: "var(--git-modified)",
};

export const StarArea = memo(function StarArea({ values, className }: { values: number[]; className?: string }) {
  const id = useId();
  const W = 300;
  const H = 56;
  const { linePath, areaPath, last } = useMemo(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i: number) => (i / Math.max(1, values.length - 1)) * W;
    const y = (v: number) => H - 4 - ((v - min) / span) * (H - 10);
    const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
    return {
      linePath: line().curve(curveMonotoneX)(pts) ?? "",
      areaPath: area().curve(curveMonotoneX).y0(H)(pts) ?? "",
      last: pts[pts.length - 1],
    };
  }, [values]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-14 w-full overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--hub-accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--hub-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id})`} />
      <path d={linePath} fill="none" stroke="var(--hub-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--hub-accent)" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
});

export function CiStrip({ states, className }: { states: CheckState[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-[3px]", className)} aria-hidden>
      {states.map((s, i) => (
        <span
          key={i}
          className="h-3.5 w-2 rounded-[3px]"
          style={{ background: s ? CHECK_COLOR[s] : "var(--muted)" }}
        />
      ))}
    </div>
  );
}

const FALLBACK_LANG = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function langColor(l: { color: string | null }, i: number) {
  return l.color ?? FALLBACK_LANG[i % FALLBACK_LANG.length];
}

export function LanguageBar({ languages }: { languages: HubLanguage[] }) {
  return (
    <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
      {languages.map((l, i) => (
        <span key={l.name} title={`${l.name} ${(l.share * 100).toFixed(1)}%`} style={{ flexGrow: l.share, background: langColor(l, i) }} />
      ))}
    </div>
  );
}

/** Donut segments for a share breakdown; used for contributor commit share. */
export const ShareRing = memo(function ShareRing({ parts, size = 72 }: { parts: { value: number; color: string; label: string }[]; size?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 15.9155; // circumference 100 → dasharray in percent
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" width={size} height={size} aria-hidden>
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
      {parts.map((p) => {
        const pct = (p.value / total) * 100;
        const el = (
          <circle
            key={p.label}
            cx="21"
            cy="21"
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth="5"
            strokeDasharray={`${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`}
            strokeDashoffset={offset}
          >
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        );
        offset -= pct;
        return el;
      })}
    </svg>
  );
});

// Shaded faces via color-mix instead of CSS filters: filters force a raster pass per element.
const TOP = { fill: "var(--git-added)" };
const FRONT = { fill: "color-mix(in oklab, var(--git-added) 72%, black)" };
const SIDE = { fill: "color-mix(in oklab, var(--git-added) 48%, black)" };

/**
 * Isometric "skyline" of the contribution calendar: one extruded block per
 * day, weeks run left to right, weekdays recede into depth.
 */
export const ContributionSkyline = memo(function ContributionSkyline({
  days,
  label,
}: {
  days: ContributionDay[];
  label: (d: ContributionDay) => string;
}) {
  const model = useMemo(() => {
    const CS = 11; // column step
    const BW = 8; // block width
    const DX = 3.2; // depth step per weekday row
    const DY = 5;
    const MAXH = 46;
    const weeks: (ContributionDay | null)[][] = [];
    const first = days[0] ? new Date(`${days[0].date}T00:00:00`).getDay() : 0;
    let col: (ContributionDay | null)[] = Array(first).fill(null);
    for (const d of days) {
      col.push(d);
      if (col.length === 7) {
        weeks.push(col);
        col = [];
      }
    }
    if (col.length) weeks.push(col);
    // sqrt keeps one huge day from flattening everything else.
    const max = Math.sqrt(Math.max(1, ...days.map((d) => d.count)));
    const blocks: { key: string; top: string; front: string; side: string; level: number; day: ContributionDay }[] = [];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < weeks.length; x++) {
        const day = weeks[x][y];
        if (!day) continue;
        const h = day.count > 0 ? 3 + (Math.sqrt(day.count) / max) * MAXH : 1;
        const X = x * CS + (6 - y) * DX;
        const Y = MAXH + 8 + y * DY;
        const t = Y - h;
        const dx = DX * 0.9;
        const dy = DY * 0.9;
        blocks.push({
          key: day.date,
          day,
          level: day.count === 0 ? 0 : Math.min(4, 1 + Math.floor((Math.sqrt(day.count) / max) * 3.999)),
          top: `M${X} ${t}h${BW}l${dx} ${-dy}h${-BW}z`,
          front: `M${X} ${t}h${BW}v${h}h${-BW}z`,
          side: `M${X + BW} ${Y}v${-h}l${dx} ${-dy}v${h}z`,
        });
      }
    }
    return { blocks, w: weeks.length * CS + 7 * DX + 4, h: MAXH + 8 + 7 * DY + 2 };
  }, [days]);

  return (
    <svg viewBox={`0 0 ${model.w} ${model.h}`} className="h-auto w-full" role="img" shapeRendering="geometricPrecision">
      {model.blocks.map((b) =>
        b.level === 0 ? (
          <path key={b.key} d={b.top} fill="var(--muted-foreground)" fillOpacity={0.14}>
            <title>{label(b.day)}</title>
          </path>
        ) : (
          <g key={b.key} fillOpacity={0.35 + b.level * 0.16}>
            <title>{label(b.day)}</title>
            <path d={b.side} style={SIDE} />
            <path d={b.front} style={FRONT} />
            <path d={b.top} style={TOP} />
          </g>
        ),
      )}
    </svg>
  );
});
