import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRepoStore, repoLabel } from "@/lib/repo-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { RepoTab } from "./repo-tab";
import { AddRepoButton } from "./add-repo-button";
import { RepoWorkspaceSwitch } from "./repo-workspace-switch";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

export function RepoTabBar() {
  const { paths, activePath, activeLoading } = useRepoStore(
    useShallow((s) => ({
      paths: s.paths,
      activePath: s.activePath,
      activeLoading: s.activePath ? !!s.loading[s.activePath] : false,
    })),
  );
  const reorderRepos = useRepoStore((s) => s.reorderRepos);

  const { workspaces, activeWorkspaceId } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
    })),
  );

  // Track previous paths in a ref so the effect can diff without subscribing to the store directly.
  // Using useEffect([paths]) instead of store.subscribe() ensures state updates happen after render,
  // avoiding the "maximum update depth exceeded" that occurs when Zustand's synchronous subscriber
  // calls set() on another store during React's useSyncExternalStore snapshot check.
  const prevPathsRef = useRef<string[] | null>(null);
  useEffect(() => {
    const {
      initDefaultWorkspace,
      addRepoToActiveWorkspace,
      removeRepoFromAllWorkspaces,
    } = useWorkspaceStore.getState();

    if (prevPathsRef.current === null) {
      initDefaultWorkspace(paths);
      prevPathsRef.current = paths;
      return;
    }

    const prevPaths = prevPathsRef.current;
    prevPathsRef.current = paths;
    paths.filter((p) => !prevPaths.includes(p)).forEach(addRepoToActiveWorkspace);
    prevPaths.filter((p) => !paths.includes(p)).forEach(removeRepoFromAllWorkspaces);
  }, [paths]);

  const filteredPaths = useMemo(() => {
    const activeRepoPaths =
      workspaces.find((w) => w.id === activeWorkspaceId)?.repoPaths ?? [];
    return paths.filter((p) => activeRepoPaths.includes(p));
  }, [paths, workspaces, activeWorkspaceId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = paths.indexOf(String(active.id));
      const to = paths.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      reorderRepos(from, to);
    },
    [paths, reorderRepos],
  );

  return (
    <div className="relative flex h-14 min-h-0 min-w-0 shrink-0 items-stretch border-b border-border/60 bg-background">
      {activePath && activeLoading && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-0.5 overflow-hidden"
          aria-hidden
        >
          <div className="h-full w-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
        <RepoWorkspaceSwitch />
        <div className="relative flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-0 items-center gap-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredPaths}
                strategy={horizontalListSortingStrategy}
              >
                {filteredPaths.map((p) => (
                  <RepoTab
                    key={p}
                    path={p}
                    label={repoLabel(p)}
                    active={p === activePath}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <AddRepoButton />
        </div>
      </div>
    </div>
  );
}
