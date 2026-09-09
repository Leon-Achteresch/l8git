import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { AgentRunDetail } from "./agent-run-detail";
import { AgentRunFanout } from "./agent-run-fanout";
import { AgentRunRow } from "./agent-run-row";
import type { AgentRunGroup } from "./types";
import { Collapse } from "@/components/motion/kit";
import { SPRING_PANEL, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;
const ROW_GAP = 8;

export function AgentRunPanel({
  group,
  className,
}: {
  group: AgentRunGroup;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    group.runs.find(r => r.detail)?.id ?? null,
  );

  const counts = group.runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.status] = (acc[run.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = [
    counts.running && `${counts.running} running`,
    counts.done && `${counts.done} done`,
    counts.failed && `${counts.failed} failed`,
    counts.queued && `${counts.queued} queued`,
  ]
    .filter(Boolean)
    .join(" · ");

  const expanded = group.runs.find(r => r.id === expandedId);
  const activeIndices = group.runs
    .map((run, i) => (run.status === "running" || run.status === "failed" ? i : -1))
    .filter(i => i >= 0);

  return (
    <m.div
      className={cn("w-full overflow-hidden rounded-2xl border border-border bg-card", className)}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <Bot className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span className="text-sm font-semibold">{group.label ?? "Agents"}</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{summary}</span>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {group.actionCount !== undefined && <span>{group.actionCount} actions</span>}
          {group.durationLabel && <span>· {group.durationLabel}</span>}
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
            className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted"
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={collapsed ? "down" : "up"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                transition={SPRING_SWAP}
                className="inline-flex"
              >
                {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </m.span>
            </AnimatePresence>
          </button>
        </div>
      </div>

      <Collapse open={!collapsed}>
        <div className="flex items-stretch gap-0 px-4 py-3">
          <div className="flex shrink-0 items-center">
            <span className="inline-flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm font-semibold">
              <Bot className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              {group.rootLabel ?? "Agent"}
            </span>
          </div>
          <AgentRunFanout
            count={group.runs.length}
            rowHeight={ROW_HEIGHT}
            rowGap={ROW_GAP}
            activeIndices={activeIndices}
            className="self-center"
          />
          <div className="flex min-w-0 flex-1 flex-col" style={{ gap: ROW_GAP }}>
            {group.runs.map((run, index) => (
              <AgentRunRow
                key={run.id}
                run={run}
                height={ROW_HEIGHT}
                index={index}
                expanded={run.id === expandedId}
                onToggle={() => setExpandedId(id => (id === run.id ? null : run.id))}
              />
            ))}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <m.div
              key={expanded.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={SPRING_PANEL}
              className="overflow-hidden"
            >
              <AgentRunDetail run={expanded} />
            </m.div>
          )}
        </AnimatePresence>
      </Collapse>
    </m.div>
  );
}
