import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { IS_TAURI } from "@/lib/island/bridge";
import {
  isEdgeDock,
  monitorEdgePosition,
  useIslandStore,
  type IslandDock,
  type IslandEdgeDock,
  type IslandPosition,
} from "@/lib/island-store";

/** Mirror of `IslandWindowState` in `src-tauri/src/island.rs`. */
export type IslandWindowState = {
  open: boolean;
  mainMinimized: boolean;
  mainVisible: boolean;
};

const IDLE: IslandWindowState = {
  open: false,
  mainMinimized: false,
  mainVisible: true,
};

type Store = IslandWindowState & {
  apply: (state: IslandWindowState) => void;
};

/**
 * Window level facts the island cares about: is it detached into its own
 * window, and is l8git itself minimized. Lives in the main window; the detached
 * island reads the same values out of the snapshot.
 */
export const useIslandWindow = create<Store>()((set) => ({
  ...IDLE,
  apply: (state) => set(state),
}));

async function call(command: string, args?: Record<string, unknown>) {
  if (!IS_TAURI) return IDLE;
  const state = await invoke<IslandWindowState>(command, args ?? {});
  useIslandWindow.getState().apply(state);
  return state;
}

export const openIslandWindow = (position?: { x: number; y: number }) =>
  call("island_window_open", position ? { x: position.x, y: position.y } : {});

export const closeIslandWindow = () => call("island_window_close");

export const syncIslandWindowState = () => call("island_window_state");

export const minimizeMainWindow = () => call("main_window_minimize");

export const restoreMainWindow = () => call("main_window_restore");

export const toggleMainWindowMinimized = () => call("main_window_toggle_minimize");

/** Resizes the detached window to the natural size of the island content. */
export async function setIslandWindowSize(
  width: number,
  height: number,
  dock?: IslandDock,
): Promise<void> {
  if (!IS_TAURI) return;
  await invoke("island_window_set_size", {
    width,
    height,
    dock: dock && dock !== "free" ? dock : null,
  }).catch(() => {});
}

const POSITION_KEY = "l8git-island-window-position";

export type IslandWindowPosition = { x: number; y: number };

/** Where the user last parked the detached island, in logical pixels. */
export function storedIslandWindowPosition(): IslandWindowPosition | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "") as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as IslandWindowPosition).x === "number" &&
      typeof (parsed as IslandWindowPosition).y === "number"
    ) {
      return parsed as IslandWindowPosition;
    }
  } catch {
    // Missing or malformed — the window just re-centers.
  }
  return undefined;
}

export function rememberIslandWindowPosition(position: IslandWindowPosition): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch {
    // Storage can be unavailable; position memory is a convenience.
  }
}

export type MainWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  minimized: boolean;
};

export async function mainWindowBounds(): Promise<MainWindowBounds | null> {
  if (!IS_TAURI) return null;
  try {
    return (await invoke<MainWindowBounds | null>("main_window_bounds")) ?? null;
  } catch {
    return null;
  }
}

export async function setIslandWindowAlwaysOnTop(value: boolean): Promise<void> {
  if (!IS_TAURI) return;
  await invoke("island_window_set_always_on_top", { value }).catch(() => {});
}

const EDGE_GUESS = { width: 80, height: 120 };

export async function detachIslandToEdge(
  dock: IslandEdgeDock,
  alongClient: IslandPosition,
): Promise<void> {
  useIslandStore.getState().setDock(dock);
  useIslandStore.getState().setPosition(alongClient);
  if (!IS_TAURI) return;
  try {
    const { currentMonitor, getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const scale = await win.scaleFactor();
    const pos = await win.outerPosition();
    const mon = await currentMonitor();
    const along = {
      x: pos.x / scale + alongClient.x,
      y: pos.y / scale + alongClient.y,
    };
    let placed = along;
    if (mon) {
      placed = monitorEdgePosition(
        dock,
        {
          x: mon.workArea.position.x / scale,
          y: mon.workArea.position.y / scale,
          width: mon.workArea.size.width / scale,
          height: mon.workArea.size.height / scale,
        },
        EDGE_GUESS,
        along,
      );
    }
    rememberIslandWindowPosition(placed);
    await openIslandWindow(placed);
  } catch {
    await openIslandWindow();
  }
}

export async function snapCurrentWindowToDock(dock: IslandDock): Promise<void> {
  if (!IS_TAURI || !isEdgeDock(dock)) return;
  try {
    const { currentMonitor, getCurrentWindow, LogicalPosition } = await import(
      "@tauri-apps/api/window"
    );
    const win = getCurrentWindow();
    const scale = await win.scaleFactor();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const mon = await currentMonitor();
    if (!mon) return;
    const placed = monitorEdgePosition(
      dock,
      {
        x: mon.workArea.position.x / scale,
        y: mon.workArea.position.y / scale,
        width: mon.workArea.size.width / scale,
        height: mon.workArea.size.height / scale,
      },
      { width: size.width / scale, height: size.height / scale },
      { x: pos.x / scale, y: pos.y / scale },
    );
    await win.setPosition(new LogicalPosition(placed.x, placed.y));
    rememberIslandWindowPosition(placed);
  } catch {
    return;
  }
}
