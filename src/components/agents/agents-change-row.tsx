import { m } from "motion/react";

import { SPRING_PANEL } from "@/@lib/ease";
import { AgentsDiffStat } from "@/components/agents/agents-diff-stat";
import { StatusIcon } from "@/components/repo/commit/commit-panel-status-icon";
import type { StatusEntry } from "@/lib/repo-store";

function sectorFor(entry: StatusEntry) {
  if (entry.untracked) return "unstaged" as const;
  if (entry.index_status.trim()) return "staged" as const;
  return "unstaged" as const;
}

export function AgentsChangeRow({ entry }: { entry: StatusEntry }) {
  const add = entry.additions_staged + entry.additions_unstaged;
  const del = entry.deletions_staged + entry.deletions_unstaged;
  const name = entry.path.split(/[\\/]/).pop() ?? entry.path;

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
      className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-xs transition-colors duration-200 hover:bg-foreground/[0.04]"
      title={entry.path}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] ring-1 ring-border/25 transition-colors duration-200 group-hover:bg-foreground/[0.07]">
        <StatusIcon entry={entry} sector={sectorFor(entry)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium tracking-tight text-foreground">
          {name}
        </div>
        {name !== entry.path && (
          <div className="truncate text-[10px] text-muted-foreground">
            {entry.path}
          </div>
        )}
      </div>
      <AgentsDiffStat add={add} del={del} />
    </m.div>
  );
}
