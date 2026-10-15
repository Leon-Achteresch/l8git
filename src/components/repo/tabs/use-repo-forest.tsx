import {
  filterForest,
  flattenRepoPaths,
  flattenVisibleKeys,
  useRepoGroupsStore,
} from "@/lib/repo-groups-store";
import { useRepoStore } from "@/lib/repo-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

/** Keeps workspaces and repo groups in sync with the open repos. Mount exactly once, independent of the shell layout. */
export function useRepoWorkspaceSync() {
  const paths = useRepoStore((s) => s.paths);
  const activePath = useRepoStore((s) => s.activePath);

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
    paths
      .filter((p) => !prevPaths.includes(p))
      .forEach(addRepoToActiveWorkspace);
    prevPaths
      .filter((p) => !paths.includes(p))
      .forEach(removeRepoFromAllWorkspaces);
  }, [paths]);

  useEffect(() => {
    useRepoGroupsStore.getState().reconcile(paths);
  }, [paths]);

  useEffect(() => {
    useRepoGroupsStore.getState().syncCollapseToActive(activePath);
  }, [activePath]);
}

/** The repo forest (groups + repos) of the active workspace. */
export function useRepoForest() {
  const paths = useRepoStore((s) => s.paths);
  const forest = useRepoGroupsStore((s) => s.forest);
  const { workspaces, activeWorkspaceId } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
    })),
  );

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
  const pickerPaths = useMemo(
    () => flattenRepoPaths(filteredForest),
    [filteredForest],
  );

  return { filteredForest, sortableKeys, pickerPaths };
}

export function RepoForestDnd({
  sortableKeys,
  vertical = false,
  children,
}: {
  sortableKeys: string[];
  vertical?: boolean;
  children: ReactNode;
}) {
  const moveNodeRelativeTo = useRepoGroupsStore((s) => s.moveNodeRelativeTo);
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortableKeys}
        strategy={
          vertical ? verticalListSortingStrategy : horizontalListSortingStrategy
        }
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}
