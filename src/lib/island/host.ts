import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { useInstalledAgents } from "@/lib/agent-integrations";
import {
  IS_TAURI,
  isIslandWindow,
  onRequest,
  onSnapshotRequest,
  publishSnapshot,
  sendResponse,
} from "@/lib/island/bridge";
import {
  buildIslandSnapshot,
  islandSnapshotInputs,
  sameIslandSnapshotInputs,
  type IslandSnapshotInputs,
} from "@/lib/island/snapshot";
import {
  armIslandUsage,
  collectIslandUsage,
  islandUsageInputs,
  subscribeIslandUsage,
} from "@/lib/island/usage";
import {
  closeIslandWindow,
  detachIslandToEdge,
  openIslandWindow,
  storedIslandWindowPosition,
  syncIslandWindowState,
  useIslandWindow,
} from "@/lib/island/window-store";
import { isEdgeDock, islandTarget, useIslandStore } from "@/lib/island-store";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { useTerminalStore } from "@/lib/terminal-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";

const SNAPSHOT_DEBOUNCE_MS = 120;
const WINDOW_SYNC_DEBOUNCE_MS = 200;

/**
 * Main-window half of the bridge: keeps the detached island fed with state and
 * runs whatever it asks for. Inert in the island window and outside Tauri.
 */
export function useIslandHost(): void {
  const timer = useRef<number | undefined>(undefined);
  const windowTimer = useRef<number | undefined>(undefined);
  const lastInputs = useRef<IslandSnapshotInputs>([]);

  useEffect(() => {
    if (isIslandWindow()) return;
    return armIslandUsage();
  }, []);

  useEffect(() => {
    if (!IS_TAURI || isIslandWindow()) return;

    // Only the detached window consumes snapshots; in-app the island reads the
    // stores directly, so publishing then would be pure event traffic.
    const push = (force = false) => {
      if (
        !force &&
        !useIslandWindow.getState().open &&
        !isEdgeDock(useIslandStore.getState().dock)
      )
        return;
      const inputs = [...islandSnapshotInputs(), ...islandUsageInputs()];
      // An unchanged snapshot is an IPC round trip and a re-render in the
      // detached window for nothing.
      if (!force && sameIslandSnapshotInputs(lastInputs.current, inputs)) return;
      lastInputs.current = inputs;
      void publishSnapshot(buildIslandSnapshot(collectIslandUsage()));
    };
    const schedule = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => push(), SNAPSHOT_DEBOUNCE_MS);
    };

    const unsubscribes = [
      useRepoStore.subscribe(schedule),
      useTerminalStore.subscribe(schedule),
      useTerminalActivity.subscribe(schedule),
      useIslandWindow.subscribe((state, prev) => {
        schedule();
        if (state.mainMinimized && !prev.mainMinimized && !state.open) {
          void openIslandWindow(storedIslandWindowPosition());
        }
      }),
      useUiVisibilityPrefs.subscribe((state, prev) => {
        if (!state.showHeaderIsland && prev.showHeaderIsland) {
          void closeIslandWindow();
        }
      }),
      useInstalledAgents.subscribe(schedule),
      ...subscribeIslandUsage(schedule),
    ];

    const islandOn = useUiVisibilityPrefs.getState().showHeaderIsland;
    if (!islandOn) {
      void closeIslandWindow();
    }
    const { dock, position } = useIslandStore.getState();
    if (islandOn && isEdgeDock(dock) && !useIslandWindow.getState().open) {
      void detachIslandToEdge(dock, position ?? islandTarget(dock, position));
    }

    // Minimizing through the title bar bypasses our commands, so the window
    // state is re-read whenever the main window is resized or (un)focused.
    const win = getCurrentWindow();
    const sync = () => {
      window.clearTimeout(windowTimer.current);
      windowTimer.current = window.setTimeout(
        () => void syncIslandWindowState().catch(() => {}),
        WINDOW_SYNC_DEBOUNCE_MS,
      );
    };

    // allSettled: a rejected window listener must not strand the ones that did
    // register, nor surface as an unhandled rejection.
    const listeners = Promise.allSettled([
      win.onResized(sync),
      win.onFocusChanged(sync),
      onSnapshotRequest(() => push(true)),
      onRequest(async ({ id, request }) => {
        // The executor pulls in the router, the git actions and the registry.
        // Loading it on the first request keeps it out of the startup chunk.
        const { runIslandAction } = await import("@/lib/island/executor");
        const result = await runIslandAction(request);
        await sendResponse({ id, result });
        push(true);
      }),
    ]);

    void syncIslandWindowState().catch(() => {});
    push();

    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(windowTimer.current);
      for (const off of unsubscribes) off();
      void listeners.then((results) => {
        for (const result of results) {
          if (result.status === "fulfilled") result.value();
        }
      });
    };
  }, []);
}
