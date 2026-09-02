import { useRef, useState } from "react";
import {
  contextRatio,
  contextTooltip,
  type ContextUsage,
} from "../lib/contextUsage";
import { Popover } from "./Popover";
import { estimateCost, formatUsd } from "../lib/tokenCost";
import { useSessionUsage } from "../lib/usageLedger";

const SIZE = 14;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring turns amber then red as the window fills. */
function ringClass(ratio: number): string {
  if (ratio >= 0.9) return "text-red-400";
  if (ratio >= 0.75) return "text-amber-400";
  return "text-content/45";
}

/**
 * Circular gauge for how full the model context window is.
 *
 * Renders nothing until the harness reports both halves — Cursor's ACP stream
 * carries no usage at all, and a ring guessing at a number is worse than no
 * ring.
 */
export function ContextMeter({
  usage,
  sessionId,
  model,
}: {
  usage?: ContextUsage;
  sessionId?: string;
  model?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const ratio = contextRatio(usage);
  const ledger = useSessionUsage(sessionId);
  const cost = estimateCost(ledger, ledger?.model ?? model);
  if (!usage || ratio === null) return null;

  const { headline, detail } = contextTooltip(usage);

  return (
    <div
      ref={root}
      className="relative flex shrink-0 items-center gap-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={ringClass(ratio)}
        role="img"
        aria-label={`${headline}, ${detail}`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="opacity-25"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      {cost ? (
        <span className="text-[11px] tabular-nums text-content/45">
          {formatUsd(cost.totalUsd)}
        </span>
      ) : null}
      {hovered ? (
        <Popover
          anchor={root}
          side="top"
          align="end"
          className="pointer-events-none w-max px-2.5 py-1.5"
        >
          <div className="text-[12px] leading-4 text-content">{headline}</div>
          <div className="text-[11px] leading-4 text-content/50">{detail}</div>
          {cost ? (
            <div className="mt-1 text-[11px] leading-4 text-content/50">
              ≈ {formatUsd(cost.totalUsd)} via API
              {cost.cacheSavedUsd > 0 ? ` · ${formatUsd(cost.cacheSavedUsd)} saved by cache` : ""}
            </div>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}
