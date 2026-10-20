import {
  laneColor,
  type GraphRow,
} from "@/lib/graph";
import { memo, type ReactNode } from "react";

/** Pixels per lane when the graph has enough room. */
const LANE_W = 11;
const PAD = 5;
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

/**
 * One commit's lane segments and dot, drawn into the list's shared graph SVG at
 * the row's offset `top`. A single SVG for the whole window keeps each pooled row
 * free of its own SVG root, clip and transform while scrolling.
 */
export const CommitGraphShapes = memo(function CommitGraphShapes({
  row,
  maxLanes,
  isBranchTip = false,
  originColors,
  colWidth,
  top,
  rowHeight,
}: {
  row: GraphRow;
  maxLanes: number;
  isBranchTip?: boolean;
  originColors: ReadonlyMap<string, string>;
  colWidth: number;
  /** The row's top edge in the graph SVG's coordinates. */
  top: number;
  /** The list already measures each row, including responsive wrapping. */
  rowHeight: number;
}) {
  const lanes = Math.max(1, maxLanes);
  const colW = colWidth;
  const rowH = Math.max(1, rowHeight);
  const usable = colW - PAD * 2;
  const laneW = usable / lanes;
  const midY = top + rowH / 2;
  const half = rowH / 2;
  const bottom = top + rowH;
  const laneX = (i: number) => PAD + i * laneW + laneW / 2;

  /** Resolves a colour for an origin key using the graph-build map first,
   *  then falling back to the deterministic name-hash helper. */
  const colorOf = (origin: string | null | undefined): string =>
    origin
      ? (originColors.get(origin) ?? laneColor(origin))
      : '#888';

  // Butt caps end exactly at the row edges, where each row's own SVG used to
  // clip its round caps; every other segment end sits under the commit dot.
  const segments: { d: string; color: string }[] = [];
  // A lane passing straight through in one colour is one path, so no seam shows at midY.
  const passesThrough = (i: number) =>
    i !== row.lane &&
    row.lanesBefore[i] != null &&
    row.lanesBefore[i] === row.lanesAfter[i] &&
    !row.mergedLanes.includes(i) &&
    colorOf(row.laneOriginsBefore[i]) === colorOf(row.laneOriginsAfter[i]);

  row.lanesBefore.forEach((hash, i) => {
    if (hash === null) return;
    const originColor = colorOf(row.laneOriginsBefore[i]);
    const x0 = laneX(i);
    if (i === row.lane && hash === row.commit.hash) {
      segments.push({ d: `M ${x0} ${top} L ${x0} ${midY}`, color: originColor });
    } else if (row.mergedLanes.includes(i)) {
      const x1 = laneX(row.lane);
      const c1y = top + half * 0.32;
      const c2y = top + half * 0.68;
      segments.push({
        d: `M ${x0} ${top} C ${x0} ${c1y}, ${x1} ${c2y}, ${x1} ${midY}`,
        color: originColor,
      });
    } else {
      segments.push({ d: `M ${x0} ${top} L ${x0} ${passesThrough(i) ? bottom : midY}`, color: originColor });
    }
  });

  row.lanesAfter.forEach((hash, i) => {
    if (hash === null) return;
    const originColor = colorOf(row.laneOriginsAfter[i]);
    const x1 = laneX(i);
    const before = row.lanesBefore[i];
    const wasContinuing =
      before !== undefined && before !== null && before === hash;

    if (passesThrough(i)) return;
    if (i === row.lane || wasContinuing) {
      segments.push({
        d: `M ${x1} ${midY} L ${x1} ${bottom}`,
        color: originColor,
      });
    } else {
      const x0 = laneX(row.lane);
      const c1y = midY + half * 0.32;
      const c2y = midY + half * 0.68;
      segments.push({
        d: `M ${x0} ${midY} C ${x0} ${c1y}, ${x1} ${c2y}, ${x1} ${bottom}`,
        color: originColor,
      });
    }
  });

  const dotX = laneX(row.lane);
  // Use the row's own colour directly – it was assigned by the graph builder
  // and is already consistent with the lane segments above/below.
  const dotStroke = row.color;

  const hasTag = row.commit.tags.length > 0;
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
    <>
      {segments.map((s, i) => (
        <path
          key={i}
          d={s.d}
          stroke={s.color}
          strokeWidth={STROKE}
          fill="none"
        />
      ))}
      {dotEl}
    </>
  );
});
