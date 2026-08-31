import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type IslandPosition = { x: number; y: number };
export type IslandPanelSize = { width: number; height: number };
export type IslandSlotDock = "header" | "sidebar";
export type IslandEdgeDock = "top" | "right" | "bottom" | "left";
export type IslandDockId = IslandSlotDock | IslandEdgeDock;
export type IslandDock = IslandDockId | "free";

type IslandState = {
  position: IslandPosition | null;
  dock: IslandDock;
  dragging: boolean;
  hovered: IslandDockId | null;
  usagePopover: boolean;
  showBranch: boolean;
  showDirty: boolean;
  showAgents: boolean;
  showUsage: boolean;
  panelSize: IslandPanelSize;
  setPosition: (position: IslandPosition) => void;
  setDock: (dock: IslandDock) => void;
  setDragging: (dragging: boolean) => void;
  setHovered: (hovered: IslandDockId | null) => void;
  setUsagePopover: (open: boolean) => void;
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
export const EDGE_SINK = 8;
const EDGE_REACH = 140;

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

export function isEdgeDock(dock: IslandDock): dock is IslandEdgeDock {
  return dock === "top" || dock === "right" || dock === "bottom" || dock === "left";
}

export function isVerticalDock(dock: IslandDock): boolean {
  return dock === "left" || dock === "right" || dock === "sidebar";
}

export function isSlotDock(dock: IslandDock): dock is IslandSlotDock {
  return dock === "header" || dock === "sidebar";
}

export function islandPopoverSide(
  dock: IslandDock,
): "top" | "right" | "bottom" | "left" {
  if (dock === "right") return "left";
  if (dock === "left" || dock === "sidebar") return "right";
  if (dock === "bottom") return "top";
  return "bottom";
}

export function islandOverlayClass(dock: IslandDock): string {
  switch (dock) {
    case "left":
      return "[translate:-8px_-50%]";
    case "right":
      return "[translate:calc(-100%+8px)_-50%]";
    case "top":
      return "[translate:-50%_-8px]";
    case "bottom":
      return "[translate:-50%_calc(-100%+8px)]";
    case "header":
    case "sidebar":
    case "free":
      return "[translate:-50%_-18.5px]";
    default: {
      const _exhaustive: never = dock;
      return _exhaustive;
    }
  }
}

export const useIslandStore = create<IslandState>()(
  persist(
    (set) => ({
      position: null,
      dock: "free",
      dragging: false,
      hovered: null,
      usagePopover: false,
      showBranch: true,
      showDirty: true,
      showAgents: true,
      showUsage: true,
      panelSize: ISLAND_PANEL_DEFAULT,
      setPosition: (position) => set({ position }),
      setDock: (dock) => set({ dock }),
      setDragging: (dragging) => set({ dragging }),
      setHovered: (hovered) => set({ hovered }),
      setUsagePopover: (usagePopover) => set({ usagePopover }),
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
      partialize: ({
        dragging: _dragging,
        hovered: _hovered,
        usagePopover: _usagePopover,
        ...rest
      }) => rest,
      merge: (persisted, current) => ({
        ...current,
        ...(typeof persisted === "object" && persisted ? persisted : {}),
      }),
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

export const MAGNET_MARGIN = 32;
const MAGNET_REACH = 200;

export type MagnetHit = {
  id: IslandDockId;
  x: number;
  y: number;
  pull: number;
};

export function islandTarget(
  dock: IslandDock,
  position: IslandPosition | null,
): IslandPosition {
  if (isEdgeDock(dock)) return edgeTarget(dock, position);
  if (isSlotDock(dock)) {
    const rect = dockRectFor(dock);
    if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return position ?? defaultIslandPosition();
}

function edgeTarget(dock: IslandEdgeDock, position: IslandPosition | null): IslandPosition {
  const width = typeof window === "undefined" ? 1200 : window.innerWidth;
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  const alongX = position?.x ?? width / 2;
  const alongY = position?.y ?? height / 2;
  switch (dock) {
    case "left":
      return { x: 0, y: clampAlong(alongY, height) };
    case "right":
      return { x: width, y: clampAlong(alongY, height) };
    case "top":
      return { x: clampAlong(alongX, width), y: 0 };
    case "bottom":
      return { x: clampAlong(alongX, width), y: height };
    default: {
      const _exhaustive: never = dock;
      return _exhaustive;
    }
  }
}

function clampAlong(value: number, span: number): number {
  return Math.min(Math.max(48, value), Math.max(48, span - 48));
}

export function monitorEdgePosition(
  dock: IslandEdgeDock,
  work: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  along: IslandPosition,
): IslandPosition {
  const maxX = work.x + Math.max(0, work.width - size.width);
  const maxY = work.y + Math.max(0, work.height - size.height);
  const x = Math.min(Math.max(work.x, along.x), maxX);
  const y = Math.min(Math.max(work.y, along.y), maxY);
  switch (dock) {
    case "left":
      return { x: work.x, y };
    case "right":
      return { x: maxX, y };
    case "top":
      return { x, y: work.y };
    case "bottom":
      return { x, y: maxY };
    default: {
      const _exhaustive: never = dock;
      return _exhaustive;
    }
  }
}

export function magnetFor(centerX: number, centerY: number): MagnetHit | null {
  const edge = edgeMagnet(centerX, centerY);
  if (edge && edge.pull >= 0.4) return edge;
  const slot = slotMagnet(centerX, centerY);
  if (slot) return slot;
  return edge;
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

function slotMagnet(centerX: number, centerY: number): MagnetHit | null {
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

function edgeMagnet(centerX: number, centerY: number): MagnetHit | null {
  if (typeof window === "undefined") return null;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const candidates: MagnetHit[] = [
    { id: "left", x: 0, y: centerY, pull: pullFor(centerX) },
    { id: "right", x: width, y: centerY, pull: pullFor(width - centerX) },
    { id: "top", x: centerX, y: 0, pull: pullFor(centerY) },
    { id: "bottom", x: centerX, y: height, pull: pullFor(height - centerY) },
  ];
  let best: MagnetHit | null = null;
  for (const hit of candidates) {
    if (hit.pull <= 0) continue;
    if (!best || hit.pull > best.pull) best = hit;
  }
  return best;
}

function pullFor(distance: number): number {
  if (distance > EDGE_REACH) return 0;
  return 1 - distance / EDGE_REACH;
}
