import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type IslandPosition = { x: number; y: number };
export type IslandPanelSize = { width: number; height: number };
export type IslandSlotDock = "header" | "sidebar";
export type IslandDock = IslandSlotDock | "free";
export type IslandEdge = "top" | "right" | "bottom" | "left";
export type Rect = { x: number; y: number; width: number; height: number };

type IslandState = {
  position: IslandPosition | null;
  dock: IslandDock;
  dragging: boolean;
  hovered: IslandSlotDock | null;
  showBranch: boolean;
  showDirty: boolean;
  showAgents: boolean;
  showUsage: boolean;
  panelSize: IslandPanelSize;
  setPosition: (position: IslandPosition) => void;
  setDock: (dock: IslandDock) => void;
  setDragging: (dragging: boolean) => void;
  setHovered: (hovered: IslandSlotDock | null) => void;
  setPanelSize: (size: IslandPanelSize) => void;
  resetPosition: () => void;
  toggleBranch: () => void;
  toggleDirty: () => void;
  toggleAgents: () => void;
  toggleUsage: () => void;
};

export const ISLAND_WIDTH = 126;
export const ISLAND_HEIGHT = 28;
export const ISLAND_PAD = 12;
export const ISLAND_PANEL_MIN = { width: 280, height: 220 };
export const ISLAND_PANEL_MAX = { width: 720, height: 800 };
export const ISLAND_PANEL_DEFAULT = { width: 340, height: 440 };
export const ISLAND_OVERLAY_CLASS = "[translate:-50%_-18.5px]";

const DOCKS: IslandDock[] = ["header", "sidebar", "free"];

export function clampIslandPanel(size: IslandPanelSize): IslandPanelSize {
  return {
    width: Math.min(ISLAND_PANEL_MAX.width, Math.max(ISLAND_PANEL_MIN.width, Math.round(size.width))),
    height: Math.min(ISLAND_PANEL_MAX.height, Math.max(ISLAND_PANEL_MIN.height, Math.round(size.height))),
  };
}

export function defaultIslandPosition(): IslandPosition {
  const width = typeof window === "undefined" ? 1200 : window.innerWidth;
  return { x: Math.max(ISLAND_WIDTH / 2 + 8, width - 260), y: 20 };
}

export function isSlotDock(dock: IslandDock): dock is IslandSlotDock {
  return dock === "header" || dock === "sidebar";
}

export function isVerticalEdge(edge: IslandEdge | null): boolean {
  return edge === "left" || edge === "right";
}

export const useIslandStore = create<IslandState>()(
  persist(
    (set) => ({
      position: null,
      dock: "free",
      dragging: false,
      hovered: null,
      showBranch: true,
      showDirty: true,
      showAgents: true,
      showUsage: true,
      panelSize: ISLAND_PANEL_DEFAULT,
      setPosition: (position) => set({ position }),
      setDock: (dock) => set({ dock }),
      setDragging: (dragging) => set({ dragging }),
      setHovered: (hovered) => set({ hovered }),
      setPanelSize: (size) => set({ panelSize: clampIslandPanel(size) }),
      resetPosition: () => set({ position: null, dock: "free" }),
      toggleBranch: () => set((s) => ({ showBranch: !s.showBranch })),
      toggleDirty: () => set((s) => ({ showDirty: !s.showDirty })),
      toggleAgents: () => set((s) => ({ showAgents: !s.showAgents })),
      toggleUsage: () => set((s) => ({ showUsage: !s.showUsage })),
    }),
    {
      name: "l8git-island",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ dragging: _dragging, hovered: _hovered, ...rest }) => rest,
      merge: (persisted, current) => {
        const saved = typeof persisted === "object" && persisted ? (persisted as Partial<IslandState>) : {};
        const dock = DOCKS.includes(saved.dock as IslandDock) ? (saved.dock as IslandDock) : "free";
        return { ...current, ...saved, dock };
      },
    },
  ),
);

type DockState = {
  els: Partial<Record<IslandSlotDock, HTMLElement>>;
  size: { width: number; height: number };
  version: number;
  register: (id: IslandSlotDock, el: HTMLElement | null) => void;
  setSize: (size: { width: number; height: number }) => void;
  bump: () => void;
};

export const useIslandDocks = create<DockState>((set) => ({
  els: {},
  size: { width: ISLAND_WIDTH, height: ISLAND_HEIGHT },
  version: 0,
  register: (id, el) =>
    set((s) => {
      const els = { ...s.els };
      if (el) els[id] = el;
      else delete els[id];
      return { els, version: s.version + 1 };
    }),
  setSize: (size) =>
    set((s) =>
      s.size.width === size.width && s.size.height === size.height
        ? s
        : { size, version: s.version + 1 },
    ),
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

export function dockRectFor(id: IslandSlotDock): DOMRect | null {
  const el = useIslandDocks.getState().els[id];
  return el ? el.getBoundingClientRect() : null;
}

export const MAGNET_MARGIN = 16;
const MAGNET_REACH = 80;

export type MagnetHit = {
  id: IslandSlotDock;
  x: number;
  y: number;
  pull: number;
};

export function islandTarget(dock: IslandDock, position: IslandPosition | null): IslandPosition {
  if (isSlotDock(dock)) {
    const rect = dockRectFor(dock);
    if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return position ?? defaultIslandPosition();
}

let slotRectCache: Partial<Record<IslandSlotDock, DOMRect>> | null = null;

function liveSlotRects(): Partial<Record<IslandSlotDock, DOMRect>> {
  const { els } = useIslandDocks.getState();
  const rects: Partial<Record<IslandSlotDock, DOMRect>> = {};
  for (const id of Object.keys(els) as IslandSlotDock[]) {
    rects[id] = els[id]!.getBoundingClientRect();
  }
  return rects;
}

export function beginMagnetDrag(): void {
  slotRectCache = liveSlotRects();
}

export function endMagnetDrag(): void {
  slotRectCache = null;
}

export function magnetFor(centerX: number, centerY: number): MagnetHit | null {
  const rects = slotRectCache ?? liveSlotRects();
  let best: (MagnetHit & { distance: number }) | null = null;
  for (const id of Object.keys(rects) as IslandSlotDock[]) {
    const r = rects[id]!;
    if (
      centerX < r.left - MAGNET_MARGIN ||
      centerX > r.right + MAGNET_MARGIN ||
      centerY < r.top - MAGNET_MARGIN ||
      centerY > r.bottom + MAGNET_MARGIN
    )
      continue;
    const slotX = r.left + r.width / 2;
    const slotY = r.top + r.height / 2;
    const distance = Math.hypot(slotX - centerX, slotY - centerY);
    if (best && distance >= best.distance) continue;
    best = { id, x: slotX, y: slotY, pull: 1 - Math.min(1, distance / MAGNET_REACH), distance };
  }
  return best;
}

export const EDGE_SNAP_REACH = 40;

export function edgeNear(work: Rect, win: Rect, reach = EDGE_SNAP_REACH): IslandEdge | null {
  const gaps: [IslandEdge, number][] = [
    ["left", win.x - work.x],
    ["right", work.x + work.width - (win.x + win.width)],
    ["top", win.y - work.y],
    ["bottom", work.y + work.height - (win.y + win.height)],
  ];
  let best: [IslandEdge, number] | null = null;
  for (const gap of gaps) {
    if (gap[1] <= reach && (!best || gap[1] < best[1])) best = gap;
  }
  return best?.[0] ?? null;
}

export function edgePosition(edge: IslandEdge | null, work: Rect, win: Rect): IslandPosition {
  const maxX = work.x + Math.max(0, work.width - win.width);
  const maxY = work.y + Math.max(0, work.height - win.height);
  const x = Math.min(Math.max(work.x, win.x), maxX);
  const y = Math.min(Math.max(work.y, win.y), maxY);
  switch (edge) {
    case "left":
      return { x: work.x, y };
    case "right":
      return { x: maxX, y };
    case "top":
      return { x, y: work.y };
    case "bottom":
      return { x, y: maxY };
    default:
      return { x, y };
  }
}
