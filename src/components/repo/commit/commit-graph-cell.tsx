import {
  branchLaneColorAtTip,
  laneColor,
  normalizeGitOid,
  type GraphRow,
} from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";
import type { ReactNode } from "react";

const COL_W = 88;
const PAD = 4;
const ROW_HEIGHT = 80;
const STROKE = 2;

export function CommitGraphCell({
  row,
  maxLanes,
  branches,
  showRefs = true,
}: {
  row: GraphRow;
  maxLanes: number;
  branches: Branch[];
  showRefs?: boolean;
}) {
  const lanes = Math.max(1, maxLanes);
  const usable = COL_W - PAD * 2;
  const laneW = usable / lanes;
  const midY = ROW_HEIGHT / 2;
  const laneX = (i: number) => PAD + i * laneW + laneW / 2;

  const segments: { d: string; color: string }[] = [];

  row.lanesBefore.forEach((hash, i) => {
    if (hash === null) return;
    const originColor =
      branchLaneColorAtTip(branches, row.laneOriginsBefore[i]) ??
      laneColor(row.laneOriginsBefore[i]);
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
    const originColor =
      branchLaneColorAtTip(branches, row.laneOriginsAfter[i]) ??
      laneColor(row.laneOriginsAfter[i]);
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
  const dotStroke =
    branchLaneColorAtTip(branches, row.commit.hash) ?? row.color;

  const commitHash = normalizeGitOid(row.commit.hash);
  const isBranchTip = showRefs && branches.some(
    (b) => normalizeGitOid(b.tip) === commitHash,
  );
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
      width={COL_W}
      height="100%"
      viewBox={`0 0 ${COL_W} ${ROW_HEIGHT}`}
      preserveAspectRatio="none"
      className="shrink-0 self-stretch min-h-[4.5rem] text-foreground"
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
}
