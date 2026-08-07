import { GitBranch, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

function repoName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

export function AgentRepositoryList({
  paths,
  selectedPath,
  branchByPath,
  onSelectPath,
  onNewThread,
}: {
  paths: string[];
  selectedPath: string;
  branchByPath: Record<string, string | undefined>;
  onSelectPath: (path: string) => void;
  onNewThread: (path: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="px-3 pb-3">
      <div className="mb-1.5 flex items-center px-2">
        <h2 className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
          {t("agents.repos")}
        </h2>
        <span className="ml-auto text-[9px] tabular-nums text-muted-foreground/70">
          {paths.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {paths.map((path) => {
          const selected = path === selectedPath;
          return (
            <div key={path} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectPath(path)}
                aria-pressed={selected}
                className={cn(
                  "relative flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "agents-active-rail bg-foreground/[0.06] pl-3 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground",
                )}
              >
                <span className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-[8px] text-[10px] font-semibold uppercase",
                  selected ? "agents-accent-surface" : "bg-foreground/[0.045]",
                )}>
                  {repoName(path).slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium">{repoName(path)}</span>
                  {branchByPath[path] ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground/75">
                      <GitBranch className="size-2.5" />
                      <span className="truncate">{branchByPath[path]}</span>
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNewThread(path)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 outline-none transition-[opacity,background-color,color,transform] hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${t("agentChat.newConversation")} · ${repoName(path)}`}
              >
                <Plus className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
