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
import { useRepoStore } from "@/lib/repo-store";
import {
  filterForest,
  flattenVisibleKeys,
  useRepoGroupsStore,
} from "@/lib/repo-groups-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { AddRepoButton } from "./add-repo-button";
import { ForestNodes } from "./repo-group";
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

  const forest = useRepoGroupsStore((s) => s.forest);
  const moveNodeRelativeTo = useRepoGroupsStore((s) => s.moveNodeRelativeTo);

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

  useEffect(() => {
    useRepoGroupsStore.getState().reconcile(paths);
  }, [paths]);

  const filteredForest = useMemo(() => {
    const activeRepoPaths =
      workspaces.find((w) => w.id === activeWorkspaceId)?.repoPaths ?? [];
    const allowed = new Set(paths.filter((p) => activeRepoPaths.includes(p)));
    return filterForest(forest, allowed);
  }, [forest, paths, workspaces, activeWorkspaceId]);

  const sortableKeys = useMemo(
    () => flattenVisibleKeys(filteredForest),
    [filteredForest],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      moveNodeRelativeTo(String(active.id), String(over.id));
    },
    [moveNodeRelativeTo],
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
                items={sortableKeys}
                strategy={horizontalListSortingStrategy}
              >
                <ForestNodes nodes={filteredForest} activePath={activePath} />
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
