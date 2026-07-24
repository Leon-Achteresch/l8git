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
    <div
      className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted/40"
      title={entry.path}
    >
      <StatusIcon entry={entry} sector={sectorFor(entry)} />
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
    </div>
  );
}
