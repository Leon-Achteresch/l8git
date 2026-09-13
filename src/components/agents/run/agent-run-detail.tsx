import { Clock, FileText } from "lucide-react";
import { m, useReducedMotion } from "motion/react";

import type { AgentRun } from "./types";
import { SPRING_PANEL } from "@/lib/motion/ease";

export function AgentRunDetail({ run }: { run: AgentRun }) {
  const reduce = useReducedMotion();
  const detail = run.detail;
  if (!detail) return null;

  return (
    <div className="border-t border-border/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{detail.title ?? `${run.name} ${run.status}`}</h3>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {detail.fileCount !== undefined && (
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" strokeWidth={1.75} aria-hidden />
              {detail.fileCount}
            </span>
          )}
          {detail.durationLabel && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" strokeWidth={1.75} aria-hidden />
              {detail.durationLabel}
            </span>
          )}
        </div>
      </div>

      {detail.description && (
        <p className="mt-1.5 text-sm text-muted-foreground">{detail.description}</p>
      )}

      {detail.actions && detail.actions.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {detail.actions.map((action, i) => (
            <m.li
              key={i}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...SPRING_PANEL, delay: reduce ? 0 : i * 0.04 }}
              className="flex items-center gap-3 text-sm"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span className="w-16 shrink-0">{action.kind}</span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{action.target}</span>
            </m.li>
          ))}
        </ul>
      )}
    </div>
  );
}
