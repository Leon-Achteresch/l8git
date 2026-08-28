import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { IslandRequest, IslandResult, IslandSnapshot } from "@/lib/island/types";

export const ISLAND_WINDOW_LABEL = "island";
export const MAIN_WINDOW_LABEL = "main";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * The island renders in two places: as an overlay inside the main window and as
 * its own borderless window. Both load the same bundle, so the window label is
 * what decides which half of the bridge a module plays.
 */
export function currentWindowLabel(): string {
  if (!IS_TAURI) return MAIN_WINDOW_LABEL;
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
    }
  ).__TAURI_INTERNALS__;
  return internals?.metadata?.currentWindow?.label ?? MAIN_WINDOW_LABEL;
}

export function isIslandWindow(): boolean {
  return currentWindowLabel() === ISLAND_WINDOW_LABEL;
}

export const ISLAND_EVENT = {
  /** Host → island: full state snapshot. */
  snapshot: "island://snapshot",
  /** Island → host: asks the host to publish a snapshot right away. */
  hello: "island://hello",
  /** Island → host: run an action. */
  request: "island://request",
  /** Host → island: result of a request. */
  response: "island://response",
} as const;

export type IslandEnvelope = {
  id: string;
  request: IslandRequest;
};

export type IslandResponseEnvelope = {
  id: string;
  result: IslandResult;
};

let counter = 0;
export function nextRequestId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** No-op outside Tauri so the bridge stays inert in a plain browser. */
async function safeEmit(event: string, payload?: unknown): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await emit(event, payload);
  } catch {
    // The other window may be gone — nothing to recover from here.
  }
}

async function safeListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!IS_TAURI) return () => {};
  try {
    return await listen<T>(event, (e) => handler(e.payload));
  } catch {
    return () => {};
  }
}

export const publishSnapshot = (snapshot: IslandSnapshot) =>
  safeEmit(ISLAND_EVENT.snapshot, snapshot);

export const onSnapshot = (handler: (snapshot: IslandSnapshot) => void) =>
  safeListen<IslandSnapshot>(ISLAND_EVENT.snapshot, handler);

export const requestSnapshot = () => safeEmit(ISLAND_EVENT.hello);

export const onSnapshotRequest = (handler: () => void) =>
  safeListen<unknown>(ISLAND_EVENT.hello, () => handler());

export const sendRequest = (envelope: IslandEnvelope) =>
  safeEmit(ISLAND_EVENT.request, envelope);

export const onRequest = (handler: (envelope: IslandEnvelope) => void) =>
  safeListen<IslandEnvelope>(ISLAND_EVENT.request, handler);

export const sendResponse = (envelope: IslandResponseEnvelope) =>
  safeEmit(ISLAND_EVENT.response, envelope);

export const onResponse = (handler: (envelope: IslandResponseEnvelope) => void) =>
  safeListen<IslandResponseEnvelope>(ISLAND_EVENT.response, handler);
