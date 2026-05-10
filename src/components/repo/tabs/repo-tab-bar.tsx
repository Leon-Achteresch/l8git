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
import { RepoTab } from "./repo-tab";
import { AddRepoButton } from "./add-repo-button";
import { RepoWorkspaceSwitch } from "./repo-workspace-switch";
import { useCallback } from "react";
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
                items={paths}
                strategy={horizontalListSortingStrategy}
              >
                {paths.map((p) => (
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
