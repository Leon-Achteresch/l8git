import {
  laneColor,
  type GraphRow,
} from "@/lib/graph";
import { memo, type ReactNode } from "react";

/** Pixels per lane when the graph has enough room. */
const LANE_W = 11;
const PAD = 5;
const ROW_HEIGHT = 80;
const STROKE = 2;
const MIN_COL_W = 36;
const MAX_COL_W = 160;

/**
 * Returns the pixel width of the graph column for a given lane count.
 * `minW` and `maxW` come from user prefs (graphLanePxMin / graphLanePxMax).
 * Exported so CommitRow can size its wrapper div consistently.
 */
export function graphColWidth(
  maxLanes: number,
  minW = MIN_COL_W,
  maxW = MAX_COL_W,
): number {
  const lanes = Math.max(1, maxLanes);
  return Math.min(maxW, Math.max(minW, PAD * 2 + lanes * LANE_W));
}

export const CommitGraphCell = memo(function CommitGraphCell({
  row,
  maxLanes,
  isBranchTip: isBranchTipProp = false,
  showRefs = true,
  originColors,
  colWidth,
}: {
  row: GraphRow;
  maxLanes: number;
  isBranchTip?: boolean;
  showRefs?: boolean;
  originColors: ReadonlyMap<string, string>;
  /** Pre-computed column width from the parent (avoids duplicate pref reads). */
  colWidth?: number;
}) {
  const lanes = Math.max(1, maxLanes);
  const colW = colWidth ?? graphColWidth(maxLanes);
  const usable = colW - PAD * 2;
  const laneW = usable / lanes;
  const midY = ROW_HEIGHT / 2;
  const laneX = (i: number) => PAD + i * laneW + laneW / 2;

  /** Resolves a colour for an origin key using the graph-build map first,
   *  then falling back to the deterministic name-hash helper. */
  const colorOf = (origin: string | null | undefined): string =>
    origin
      ? (originColors.get(origin) ?? laneColor(origin))
      : '#888';

  const segments: { d: string; color: string }[] = [];

  row.lanesBefore.forEach((hash, i) => {
    if (hash === null) return;
    const originColor = colorOf(row.laneOriginsBefore[i]);
    const x0 = laneX(i);
    if (i === row.lane && hash === row.commit.hash) {
      segments.push({ d: `M ${x0} 0 L ${x0} ${midY}`, color: originColor });
    } else if (row.mergedLanes.includes(i)) {
      const x1 = laneX(row.lane);
      const c1y = midY * 0.32;
      const c2y = midY * 0.68;
      segments.push({
        d: `M ${x0} 0 C ${x0} ${c1y}, ${x1} ${c2y}, ${x1} ${midY}`,
        color: originColor,
      });
    } else {
      segments.push({ d: `M ${x0} 0 L ${x0} ${midY}`, color: originColor });
    }
  });

  row.lanesAfter.forEach((hash, i) => {
    if (hash === null) return;
    const originColor = colorOf(row.laneOriginsAfter[i]);
    const x1 = laneX(i);
    const before = row.lanesBefore[i];
    const wasContinuing =
      before !== undefined && before !== null && before === hash;

    if (i === row.lane) {
      segments.push({
        d: `M ${x1} ${midY} L ${x1} ${ROW_HEIGHT}`,
        color: originColor,
      });
    } else if (wasContinuing) {
      segments.push({
        d: `M ${x1} ${midY} L ${x1} ${ROW_HEIGHT}`,
        color: originColor,
      });
    } else {
      const x0 = laneX(row.lane);
      const c1y = midY + (ROW_HEIGHT - midY) * 0.32;
      const c2y = midY + (ROW_HEIGHT - midY) * 0.68;
      segments.push({
        d: `M ${x0} ${midY} C ${x0} ${c1y}, ${x1} ${c2y}, ${x1} ${ROW_HEIGHT}`,
        color: originColor,
      });
    }
  });

  const dotX = laneX(row.lane);
  // Use the row's own colour directly – it was assigned by the graph builder
  // and is already consistent with the lane segments above/below.
  const dotStroke = row.color;

  const isBranchTip = showRefs && isBranchTipProp;
  const hasTag = showRefs && row.commit.tags.length > 0;
  const isMerge = row.commit.parents.length > 1;

  const DIAMOND_R = 5.5;
  const diamondPoints = [
    `${dotX},${midY - DIAMOND_R}`,
    `${dotX + DIAMOND_R},${midY}`,
    `${dotX},${midY + DIAMOND_R}`,
    `${dotX - DIAMOND_R},${midY}`,
  ].join(" ");

  let dotEl: ReactNode;
  if (hasTag) {
    const fill = isBranchTip ? dotStroke : "var(--color-git-tag)";
    dotEl = (
      <polygon
        points={diamondPoints}
        fill="var(--background)"
        stroke={fill}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    );
  } else if (isMerge) {
    dotEl = (
      <>
        <circle
          cx={dotX}
          cy={midY}
          r={9}
          fill={dotStroke}
          opacity={0.16}
          className="dark:opacity-25"
        />
        <circle
          cx={dotX}
          cy={midY}
          r={7}
          fill={dotStroke}
          stroke="var(--background)"
          strokeWidth={2}
        />
      </>
    );
  } else if (isBranchTip) {
    dotEl = (
      <>
        <circle
          cx={dotX}
          cy={midY}
          r={8}
          fill={dotStroke}
          opacity={0.14}
          className="dark:opacity-[0.22]"
        />
        <circle
          cx={dotX}
          cy={midY}
          r={5.5}
          fill="var(--background)"
          stroke={dotStroke}
          strokeWidth={2.5}
        />
      </>
    );
  } else {
    dotEl = (
      <circle
        cx={dotX}
        cy={midY}
        r={5}
        fill="var(--background)"
        stroke={dotStroke}
        strokeWidth={2.5}
      />
    );
  }

  return (
    <svg
      width={colW}
      height="100%"
      viewBox={`0 0 ${colW} ${ROW_HEIGHT}`}
      preserveAspectRatio="none"
      className="shrink-0 self-stretch min-h-[4.5rem] overflow-hidden text-foreground"
      aria-hidden="true"
    >
      {segments.map((s, i) => (
        <path
          key={i}
          d={s.d}
          stroke={s.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {dotEl}
    </svg>
  );
});
