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
import { useCallback, useMemo } from "react";

export function RepoTabBar() {
  const paths = useRepoStore((s) => s.paths);
  const activePath = useRepoStore((s) => s.activePath);
  const setActive = useRepoStore((s) => s.setActive);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const reload = useRepoStore((s) => s.reload);
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

  const tabHandlers = useMemo(
    () =>
      new Map(
        paths.map((p) => [
          p,
          {
            onSelect: () => setActive(p),
            onClose: () => removeRepo(p),
            onReload: () => void reload(p),
          },
        ]),
      ),
    [paths, setActive, removeRepo, reload],
  );

  return (
    <div className="relative flex min-h-0 min-w-0 items-stretch border-b bg-muted/30">
      <div className="relative flex min-w-0 flex-1 items-end overflow-x-auto [&::-webkit-scrollbar]:hidden">
        <div className="flex items-end gap-0.5 px-1 pt-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={paths}
              strategy={horizontalListSortingStrategy}
            >
              {paths.map((p) => {
                const handlers = tabHandlers.get(p)!;
                return (
                  <RepoTab
                    key={p}
                    path={p}
                    label={repoLabel(p)}
                    active={p === activePath}
                    onSelect={handlers.onSelect}
                    onClose={handlers.onClose}
                    onReload={handlers.onReload}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-muted/60 to-transparent" />
      </div>
      <div className="flex shrink-0 items-center px-1">
        <AddRepoButton />
      </div>
    </div>
  );
}
