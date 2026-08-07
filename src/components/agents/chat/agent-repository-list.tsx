import { GitBranch, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    <section className="px-2 pb-2">
      <h2 className="ag-label px-2 pb-1.5">{t("agents.repos")}</h2>
      <div className="space-y-px">
        {paths.map((path) => {
          const selected = path === selectedPath;
          const branch = branchByPath[path];
          return (
            <div key={path} className="group/repo relative">
              <button
                type="button"
                onClick={() => onSelectPath(path)}
                aria-pressed={selected}
                data-active={selected}
                className="ag-row h-11 pr-8"
                title={path}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-[7px] text-[10px] font-semibold uppercase ${
                    selected
                      ? "bg-[var(--ag-solid)] text-[var(--ag-solid-fg)]"
                      : "bg-[var(--ag-hover)] text-[var(--ag-text-2)]"
                  }`}
                >
                  {repoName(path).slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px]">{repoName(path)}</span>
                  {branch ? (
                    <span className="ag-faint mt-px flex items-center gap-1 text-[10px]">
                      <GitBranch className="size-2.5 shrink-0" />
                      <span className="truncate">{branch}</span>
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNewThread(path)}
                className="ag-icon-btn absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 transition-opacity group-hover/repo:opacity-100 focus-visible:opacity-100"
                aria-label={`${t("agentChat.newConversation")} · ${repoName(path)}`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
