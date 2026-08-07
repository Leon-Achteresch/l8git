import { useRouterState } from "@tanstack/react-router";

import { useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import {
  filterForest,
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
} from "@dnd-kit/sortable";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { IslandDock, useDockOpen } from "@/components/app/island-dock";
import { ISLAND_PAD, useIslandDocks } from "@/lib/island-store";
import { AddRepoButton } from "./add-repo-button";
import { ForestNodes } from "./repo-group";
import { RepoWorkspaceSwitch } from "./repo-workspace-switch";

const TAB_GAP = 4;

export function RepoTabBar() {
  const { paths, activePath: repoActivePath, activeLoading } = useRepoStore(
    useShallow((s) => ({
      paths: s.paths,
      activePath: s.activePath,
      activeLoading: s.activePath ? !!s.loading[s.activePath] : false,
    })),
  );

  const onAgents = useRouterState({
    select: (s) => s.location.pathname.startsWith("/agents"),
  });
  const agentPath = useAgentRepoStore((s) => s.path);
  const activePath = onAgents ? agentPath : repoActivePath;

  const forest = useRepoGroupsStore((s) => s.forest);
  const moveNodeRelativeTo = useRepoGroupsStore((s) => s.moveNodeRelativeTo);

  const { workspaces, activeWorkspaceId } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
    })),
  );

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

  const stripRef = useRef<HTMLDivElement | null>(null);
  const [slotAt, setSlotAt] = useState(0);
  const [slotPad, setSlotPad] = useState(ISLAND_PAD);
  const [floatLeft, setFloatLeft] = useState<number | null>(0);
  const islandWidth = useIslandDocks((s) => s.size.width);
  const dockVersion = useIslandDocks((s) => s.version);
  const slotOpen = useDockOpen("header");

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      const stripLeft = strip.getBoundingClientRect().left;
      const holeLeft = window.innerWidth / 2 - islandWidth / 2;
      const limit = holeLeft - ISLAND_PAD;
      const scrollLeft = strip.scrollLeft;

      const slotEl = strip.querySelector<HTMLElement>("[data-island-slot]");
      const slotWidth = slotEl?.style.width ?? "";
      if (slotEl) slotEl.style.width = "0px";

      let x = stripLeft - scrollLeft;
      let index = 0;
      let crossing = -1;
      for (const el of Array.from(strip.children)) {
        if (el.hasAttribute("data-island-slot")) continue;
        const width = el.getBoundingClientRect().width;
        if (!el.hasAttribute("data-tab-sep")) {
          if (crossing < 0 && x + width > limit) crossing = index;
          index++;
        }
        x += width + TAB_GAP;
      }

      if (slotEl) {
        slotEl.style.width = slotWidth;
        strip.scrollLeft = scrollLeft;
      }

      if (crossing < 0) {
        setSlotAt(index);
        setFloatLeft(Math.round(holeLeft - stripLeft + scrollLeft));
        setSlotPad(ISLAND_PAD);
        return;
      }

      setSlotAt(crossing);
      setFloatLeft(null);
      if (slotEl) {
        const left = slotEl.getBoundingClientRect().left;
        const next = Math.max(ISLAND_PAD - TAB_GAP, Math.round(holeLeft - left));
        setSlotPad((prev) => (Math.abs(next - prev) <= 1 ? prev : next));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    for (const el of Array.from(strip.children)) {
      if (!el.hasAttribute("data-island-slot")) observer.observe(el);
    }
    strip.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [filteredForest, activePath, islandWidth, dockVersion, slotAt, floatLeft]);

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
    <div className="relative flex min-w-0 flex-1 items-stretch self-stretch">
      {repoActivePath && activeLoading && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-0.5 overflow-hidden"
          aria-hidden
        >
          <div className="h-full w-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-stretch gap-1.5 pr-1">
        <div
          className="flex shrink-0 items-center"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <RepoWorkspaceSwitch />
        </div>
        <div
          ref={stripRef}
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          className="relative flex min-w-0 flex-1 items-stretch gap-1 self-stretch overflow-x-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableKeys}
              strategy={horizontalListSortingStrategy}
            >
              <ForestNodes
                nodes={filteredForest}
                activePath={activePath}
                slot={
                  <IslandDock
                    id="header"
                    pad={slotPad}
                    padEnd={floatLeft === null ? ISLAND_PAD - TAB_GAP : ISLAND_PAD}
                    floatLeft={floatLeft}
                  />
                }
                slotAt={slotAt}
                slotOpen={slotOpen}
              />
            </SortableContext>
          </DndContext>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <div className="h-4 w-0.5 rounded-full bg-foreground/5" aria-hidden />
          <AddRepoButton />
        </div>
      </div>
    </div>
  );
}
