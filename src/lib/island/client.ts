import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import {
  IS_TAURI,
  isIslandWindow,
  nextRequestId,
  onResponse,
  onSnapshot,
  requestSnapshot,
  sendRequest,
} from "@/lib/island/bridge";
import {
  buildIslandSnapshot,
  islandSnapshotInputs,
  sameIslandSnapshotInputs,
  type IslandSnapshotInputs,
} from "@/lib/island/snapshot";
import {
  acceptsIslandSnapshot,
  EMPTY_ISLAND_SNAPSHOT,
  sameIslandSnapshot,
  type IslandRequest,
  type IslandResult,
  type IslandSnapshot,
} from "@/lib/island/types";
import { useInstalledAgents } from "@/lib/agent-integrations";
import { useIslandWindow } from "@/lib/island/window-store";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { useTerminalStore } from "@/lib/terminal-store";

const HELLO_RETRY_MS = 750;
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * The island's view of the app. Inside the main window it reads the stores
 * directly; in the detached window it lives off snapshots the host publishes.
 */
export function useIslandSnapshot(): IslandSnapshot {
  const detachedWindow = isIslandWindow();
  const [remote, setRemote] = useState<IslandSnapshot>(EMPTY_ISLAND_SNAPSHOT);
  const [local, setLocal] = useState<IslandSnapshot>(() =>
    detachedWindow ? EMPTY_ISLAND_SNAPSHOT : buildIslandSnapshot(),
  );

  const lastInputs = useRef<IslandSnapshotInputs>([]);
  useEffect(() => {
    if (detachedWindow) return;
    // Store subscriptions fire on unrelated changes (commit pages, PR lists,
    // terminal output). Two gates keep that cheap: reference equality on the
    // slices decides whether to rebuild at all, structural equality on the
    // result decides whether to re-render.
    const refresh = () => {
      const inputs = islandSnapshotInputs();
      if (sameIslandSnapshotInputs(lastInputs.current, inputs)) return;
      lastInputs.current = inputs;
      const next = buildIslandSnapshot();
      setLocal((prev) => (sameIslandSnapshot(prev, next) ? prev : next));
    };
    const unsubscribes = [
      useRepoStore.subscribe(refresh),
      useTerminalStore.subscribe(refresh),
      useTerminalActivity.subscribe(refresh),
      useIslandWindow.subscribe(refresh),
      useInstalledAgents.subscribe(refresh),
    ];
    refresh();
    return () => unsubscribes.forEach((off) => off());
  }, [detachedWindow]);

  const seen = useRef(false);
  useEffect(() => {
    if (!detachedWindow) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    void onSnapshot((snapshot) => {
      seen.current = true;
      // Snapshots can overtake each other, and a restarted host begins counting
      // again — both are handled by the accept rule.
      setRemote((prev) => (acceptsIslandSnapshot(prev, snapshot) ? snapshot : prev));
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    void requestSnapshot();
    // The host may still be booting when the island window opens.
    const retry = window.setInterval(() => {
      if (seen.current) window.clearInterval(retry);
      else void requestSnapshot();
    }, HELLO_RETRY_MS);

    return () => {
      disposed = true;
      window.clearInterval(retry);
      unlisten?.();
    };
  }, [detachedWindow]);

  return detachedWindow ? remote : local;
}

/**
 * Runs an island action. In the main window this calls the executor directly;
 * from the detached window it round-trips through the host so repository state
 * stays owned by one place.
 */
export async function dispatchIslandAction(
  request: IslandRequest,
): Promise<IslandResult> {
  if (!isIslandWindow()) {
    const { runIslandAction } = await import("@/lib/island/executor");
    return runIslandAction(request);
  }
  if (!IS_TAURI) {
    return { ok: false, message: "Island bridge unavailable" };
  }

  const id = nextRequestId();
  return new Promise<IslandResult>((resolve) => {
    let unlisten: UnlistenFn | undefined;
    let settled = false;

    const finish = (result: IslandResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unlisten?.();
      resolve(result);
    };

    const timeout = window.setTimeout(
      () => finish({ ok: false, message: "Timeout" }),
      REQUEST_TIMEOUT_MS,
    );

    void onResponse((envelope) => {
      if (envelope.id === id) finish(envelope.result);
    })
      .then((fn) => {
        if (settled) fn();
        else unlisten = fn;
        return sendRequest({ id, request });
      })
      .then((sent) => {
        // Nothing will answer a request that never left, so do not sit out the
        // timeout waiting for it.
        if (!sent) finish({ ok: false, message: "Island bridge unavailable" });
      })
      .catch(() => finish({ ok: false, message: "Island bridge unavailable" }));
  });
}
