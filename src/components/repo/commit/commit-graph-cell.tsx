import {
  branchLaneColorAtTip,
  laneColor,
  type GraphRow,
} from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";

const LANE_WIDTH = 14;
const ROW_HEIGHT = 80;
const DOT_RADIUS = 4;

export function CommitGraphCell({
  row,
  maxLanes,
  branches,
}: {
  row: GraphRow;
  maxLanes: number;
  branches: Branch[];
}) {
  const width = Math.max(1, maxLanes) * LANE_WIDTH;
  const midY = ROW_HEIGHT / 2;
  const laneX = (i: number) => i * LANE_WIDTH + LANE_WIDTH / 2;

  const segments: {
    d: string;
    color: string;
  }[] = [];

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
      segments.push({
        d: `M ${x0} 0 C ${x0} ${midY / 2}, ${x1} ${midY / 2}, ${x1} ${midY}`,
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
      segments.push({
        d: `M ${x0} ${midY} C ${x0} ${midY + midY / 2}, ${x1} ${midY + midY / 2}, ${x1} ${ROW_HEIGHT}`,
        color: originColor,
      });
    }
  });

  const dotX = laneX(row.lane);
  const dotStroke =
    branchLaneColorAtTip(branches, row.commit.hash) ?? row.color;

  return (
    <svg
      width={width}
      height="100%"
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      preserveAspectRatio="none"
      className="shrink-0 self-stretch min-h-20"
      aria-hidden="true"
    >
      {segments.map((s, i) => (
        <path
          key={i}
          d={s.d}
          stroke={s.color}
          strokeWidth={1.5}
          fill="none"
        />
      ))}
      <circle
        cx={dotX}
        cy={midY}
        r={DOT_RADIUS}
        fill="var(--background)"
        stroke={dotStroke}
        strokeWidth={1.5}
      />
    </svg>
  );
}
