import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { IS_TAURI } from "@/lib/island/bridge";
import type { IslandEdge } from "@/lib/island-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";

export type IslandWindowState = {
  open: boolean;
  mainMinimized: boolean;
  mainVisible: boolean;
};

const IDLE: IslandWindowState = { open: false, mainMinimized: false, mainVisible: true };

type Store = IslandWindowState & {
  autoDetached: boolean;
  apply: (state: IslandWindowState) => void;
  setAutoDetached: (value: boolean) => void;
};

export const useIslandWindow = create<Store>()((set) => ({
  ...IDLE,
  autoDetached: false,
  apply: (state) => set(state),
  setAutoDetached: (autoDetached) => set({ autoDetached }),
}));

async function call(command: string, args?: Record<string, unknown>) {
  if (!IS_TAURI) return IDLE;
  const state = await invoke<IslandWindowState>(command, args ?? {});
  useIslandWindow.getState().apply(state);
  return state;
}

export const openIslandWindow = () => {
  if (!useUiVisibilityPrefs.getState().showHeaderIsland) return closeIslandWindow();
  const { x, y } = islandWindowMemory();
  return call("island_window_open", x !== undefined && y !== undefined ? { x, y } : {});
};

export const closeIslandWindow = () => {
  useIslandWindow.getState().setAutoDetached(false);
  return call("island_window_close");
};

export const detachIslandWindow = () => {
  rememberIslandWindow({ open: true });
  useIslandWindow.getState().setAutoDetached(false);
  return openIslandWindow();
};

export const attachIslandWindow = () => {
  rememberIslandWindow({ open: false });
  return closeIslandWindow();
};

export const syncIslandWindowState = () => call("island_window_state");
export const minimizeMainWindow = () => call("main_window_minimize");
export const restoreMainWindow = () => call("main_window_restore");
export const toggleMainWindowMinimized = () => call("main_window_toggle_minimize");

export async function setIslandWindowSize(
  width: number,
  height: number,
  edge: IslandEdge | null,
): Promise<void> {
  if (!IS_TAURI) return;
  await invoke("island_window_set_size", { width, height, dock: edge }).catch(() => {});
}

const MEMORY_KEY = "l8git-island-window";

export type IslandWindowMemory = {
  x?: number;
  y?: number;
  edge?: IslandEdge | null;
  open?: boolean;
};

export function islandWindowMemory(): IslandWindowMemory {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const m = parsed as IslandWindowMemory;
    return {
      x: typeof m.x === "number" ? m.x : undefined,
      y: typeof m.y === "number" ? m.y : undefined,
      edge: m.edge ?? null,
      open: m.open === true,
    };
  } catch {
    return {};
  }
}

export function rememberIslandWindow(patch: IslandWindowMemory): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...islandWindowMemory(), ...patch }));
  } catch {
    return;
  }
}
