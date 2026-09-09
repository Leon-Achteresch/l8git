import { ArrowRight, ChevronDown } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Collapse, Rotate, easeOutSoft } from "@/components/motion/kit";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type ContextSegment = { label: string; tokens: number; color: string };
export type PlanLimit = { label: string; resetLabel: string; percent: number };

export const CONTEXT_SEGMENT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--git-added)",
  "var(--chart-4)",
];

function formatTokens(value: number) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${value}`;
}

export function AgentContextUsage({
  used,
  total,
  segments = [],
  planLabel,
  limits = [],
  onOpenPlan,
  className,
}: {
  used: number;
  total: number;
  segments?: ContextSegment[];
  planLabel?: string;
  limits?: PlanLimit[];
  onOpenPlan?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <m.div
      className={cn("w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-sm", className)}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-sm text-muted-foreground"
      >
        <span>Context window</span>
        <span className="ml-auto tabular-nums">
          {formatTokens(used)} / {formatTokens(total)} ({percent}%)
        </span>
        <Rotate open={open} className="size-4">
          <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
        </Rotate>
      </button>

      <div
        role="progressbar"
        aria-label="Context window"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {segments.length === 0 ? (
          <m.span
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={reduce ? { duration: 0 } : easeOutSoft}
            style={{ background: "var(--chart-1)" }}
            className="h-full rounded-full"
          />
        ) : segments.map((segment, index) => (
          <m.span
            key={segment.label}
            title={`${segment.label} · ${formatTokens(segment.tokens)}`}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${total > 0 ? (segment.tokens / total) * 100 : 0}%` }}
            transition={reduce ? { duration: 0 } : { ...easeOutSoft, delay: index * 0.04 }}
            style={{ background: segment.color }}
            className="h-full rounded-full"
          />
        ))}
      </div>

      <Collapse open={open && limits.length > 0}>
        <div className="mt-4 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={onOpenPlan}
            disabled={!onOpenPlan}
            className="flex w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
          >
            <span>Plan usage limits{planLabel ? ` · ${planLabel}` : ""}</span>
            <ArrowRight className="ml-auto size-4" strokeWidth={1.75} aria-hidden />
          </button>

          <div className="mt-3 flex flex-col gap-3">
            {limits.map((limit, index) => (
              <div key={limit.label}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{limit.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{limit.resetLabel}</span>
                  <span className="font-medium tabular-nums">{limit.percent}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={limit.label}
                  aria-valuenow={limit.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <m.span
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(0, limit.percent))}%` }}
                    transition={reduce ? { duration: 0 } : { ...easeOutSoft, delay: 0.08 + index * 0.04 }}
                    style={{ background: "var(--chart-1)" }}
                    className="block h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Collapse>
    </m.div>
  );
}
