import { ChevronRight } from "lucide-react";
import { m, useReducedMotion } from "motion/react";

import { AgentRunStatusIcon } from "./agent-run-status-icon";
import type { AgentRun } from "./types";
import { Rotate } from "@/components/motion/kit";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentRunRow({
  run,
  expanded,
  height,
  index = 0,
  onToggle,
}: {
  run: AgentRun;
  expanded?: boolean;
  height: number;
  index?: number;
  onToggle?: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <m.button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      style={{ height }}
      initial={reduce ? false : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...SPRING_PANEL, delay: reduce ? 0 : Math.min(index, 10) * 0.04 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl bg-muted/40 px-3 text-left hover:bg-muted/70",
      )}
    >
      <AgentRunStatusIcon status={run.status} />
      <span className="shrink-0 text-sm font-semibold">{run.name}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          run.status === "failed" ? "text-red-500" : "text-muted-foreground",
          run.status === "running" && run.action ? "italic" : undefined,
        )}
      >
        {run.status === "running" && run.action ? (
          <>
            <span className="text-foreground not-italic">{run.action.kind}</span>{" "}
            <span className="font-mono text-xs not-italic">{run.action.target}</span>
          </>
        ) : run.action ? (
          <>
            <span className="text-foreground">{run.action.kind}</span>{" "}
            <span className="font-mono text-xs">{run.action.target}</span>
          </>
        ) : (
          run.summary
        )}
      </span>
      <Rotate open={Boolean(expanded)} angle={90} className="size-4 shrink-0 text-muted-foreground">
        <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden />
      </Rotate>
    </m.button>
  );
}
