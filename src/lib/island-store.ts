import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type IslandPosition = { x: number; y: number };
export type IslandPanelSize = { width: number; height: number };
export type IslandDockId = "header" | "sidebar";
export type IslandDock = IslandDockId | "free";

type IslandState = {
  position: IslandPosition | null;
  dock: IslandDock;
  dragging: boolean;
  hovered: IslandDockId | null;
  showBranch: boolean;
  showDirty: boolean;
  showAgents: boolean;
  panelSize: IslandPanelSize;
  setPosition: (position: IslandPosition) => void;
  setDock: (dock: IslandDock) => void;
  setDragging: (dragging: boolean) => void;
  setHovered: (hovered: IslandDockId | null) => void;
  setPanelSize: (size: IslandPanelSize) => void;
  resetPosition: () => void;
  toggleBranch: () => void;
  toggleDirty: () => void;
  toggleAgents: () => void;
};

export const ISLAND_WIDTH = 126;
export const ISLAND_HEIGHT = 28;
export const ISLAND_PAD = 12;
export const ISLAND_PANEL_MIN = { width: 280, height: 220 };
export const ISLAND_PANEL_MAX = { width: 720, height: 800 };
export const ISLAND_PANEL_DEFAULT = { width: 340, height: 440 };

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
    }),
    {
      name: "l8git-island",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ dragging: _dragging, hovered: _hovered, ...rest }) => rest,
    },
  ),
);

type DockState = {
  els: Partial<Record<IslandDockId, HTMLElement>>;
  size: { width: number; height: number };
  version: number;
  register: (id: IslandDockId, el: HTMLElement | null) => void;
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

export function dockRectFor(id: IslandDockId): DOMRect | null {
  const el = useIslandDocks.getState().els[id];
  return el ? el.getBoundingClientRect() : null;
}

export const MAGNET_MARGIN = 32;
const MAGNET_REACH = 200;

export type MagnetHit = {
  id: IslandDockId;
  x: number;
  y: number;
  pull: number;
};

export function magnetFor(centerX: number, centerY: number): MagnetHit | null {
  const { els } = useIslandDocks.getState();
  let best: (MagnetHit & { distance: number }) | null = null;

  for (const id of Object.keys(els) as IslandDockId[]) {
    const r = els[id]!.getBoundingClientRect();
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
    best = {
      id,
      x: slotX,
      y: slotY,
      pull: 1 - Math.min(1, distance / MAGNET_REACH),
      distance,
    };
  }

  return best;
}
