import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { ForestNodes } from "./repo-group";
import { RepoStripStyleContext } from "./repo-strip-style";
import { RepoForestDnd, useRepoForest } from "./use-repo-forest";

/** Vertical repo list for the rail ("rail") and sidebar ("list") shell layouts. */
export function RepoVerticalList({ style }: { style: "rail" | "list" }) {
  const activePath = useRepoStore((s) => s.activePath);
  const { filteredForest, sortableKeys } = useRepoForest();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePath) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-repo-path="${CSS.escape(activePath)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activePath, filteredForest]);

  return (
    <div
      ref={listRef}
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        style === "rail" ? "items-center gap-1.5 py-1" : "gap-0.5",
      )}
    >
      <RepoStripStyleContext.Provider value={style}>
        <RepoForestDnd sortableKeys={sortableKeys} vertical>
          <ForestNodes nodes={filteredForest} activePath={activePath} />
        </RepoForestDnd>
      </RepoStripStyleContext.Provider>
    </div>
  );
}
