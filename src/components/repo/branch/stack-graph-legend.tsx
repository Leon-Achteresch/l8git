import { laneColor } from "@/lib/graph";
import { useRepoStore } from "@/lib/repo-store";
import { EMPTY_STACK_LIST, stackChain } from "@/lib/stack";
import { useStackStore } from "@/lib/stack-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function StackGraphLegend({ path }: { path: string }) {
  const { t } = useTranslation();
  const list = useStackStore((s) => s.lists[path]) ?? EMPTY_STACK_LIST;
  const load = useStackStore((s) => s.load);
  const focusCommitFromBranchTip = useUiStore((s) => s.focusCommitFromBranchTip);
  const branchKey = useRepoStore((s) =>
    (s.repos[path]?.branches ?? [])
      .filter((b) => !b.is_remote)
      .map((b) => `${b.name}:${b.tip}`)
      .join("|"),
  );

  useEffect(() => {
    if (!path) return;
    void load(path);
  }, [path, branchKey, load]);

  const stacks = list.stacks.filter((s) => s.branches.some((b) => b.exists));
  if (stacks.length === 0) return null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto border-b border-border/60 px-3 py-1">
      <Layers
        className="h-3 w-3 shrink-0 text-muted-foreground/70"
        aria-label={t("stack.legendAria")}
      />
      {stacks.map((stack) => (
        <div key={stack.root} className="flex shrink-0 items-center gap-1">
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
            {stack.root}
          </span>
          {stackChain(stack)
            .filter((branch) => branch.exists)
            .map((branch) => (
              <button
                key={branch.name}
                type="button"
                title={t("stack.legendChipTitle", {
                  name: branch.name,
                  root: stack.root,
                  level: branch.level,
                })}
                onClick={() => focusCommitFromBranchTip(path, branch.tip)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] transition-colors",
                  branch.needs_restack
                    ? "border-git-modified/40 bg-git-modified/10 text-git-modified"
                    : "border-border/70 bg-background text-muted-foreground hover:text-foreground",
                  branch.is_current && "font-medium text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: laneColor(branch.name) }}
                />
                <span className="tabular-nums text-muted-foreground/80">
                  {branch.level}
                </span>
                <span className="max-w-[10rem] truncate font-mono">{branch.name}</span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
