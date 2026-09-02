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
  islandWindowMemory,
  openIslandWindow,
  syncIslandWindowState,
  useIslandWindow,
} from "@/lib/island/window-store";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { useTerminalStore } from "@/lib/terminal-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";

const SNAPSHOT_DEBOUNCE_MS = 120;
const WINDOW_SYNC_DEBOUNCE_MS = 200;

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

    const push = (force = false) => {
      if (!force && !useIslandWindow.getState().open) return;
      const inputs = [...islandSnapshotInputs(), ...islandUsageInputs()];
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
          useIslandWindow.getState().setAutoDetached(true);
          void openIslandWindow();
        } else if (!state.mainMinimized && prev.mainMinimized && state.autoDetached) {
          void closeIslandWindow();
        }
      }),
      useUiVisibilityPrefs.subscribe((state, prev) => {
        if (!state.showHeaderIsland && prev.showHeaderIsland) void closeIslandWindow();
      }),
      useInstalledAgents.subscribe(schedule),
      ...subscribeIslandUsage(schedule),
    ];

    const islandOn = useUiVisibilityPrefs.getState().showHeaderIsland;
    if (!islandOn) void closeIslandWindow();
    else if (islandWindowMemory().open) void openIslandWindow();

    const win = getCurrentWindow();
    const sync = () => {
      window.clearTimeout(windowTimer.current);
      windowTimer.current = window.setTimeout(
        () => void syncIslandWindowState().catch(() => {}),
        WINDOW_SYNC_DEBOUNCE_MS,
      );
    };

    const listeners = Promise.allSettled([
      win.onResized(sync),
      win.onFocusChanged(sync),
      onSnapshotRequest(() => push(true)),
      onRequest(async ({ id, request }) => {
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
