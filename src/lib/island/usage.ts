import { useEffect, useState } from "react";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { IslandProviderUsage } from "@/lib/island/types";
import { isEdgeDock, useIslandStore } from "@/lib/island-store";

const PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "opencode", "cursor"];
const INTERVAL_MS = 20_000;

export function collectIslandUsage(): IslandProviderUsage[] {
  return PROVIDERS.map((id) => {
    const { rateLimits } = chatStoreFor(id).getState();
    return {
      id,
      primary: rateLimits?.primary ?? {
        usedPercent: 0,
        windowDurationMins: null,
        resetsAt: null,
      },
      secondary: rateLimits?.secondary ?? null,
    };
  });
}

export function islandUsageInputs(): unknown[] {
  return PROVIDERS.map((id) => chatStoreFor(id).getState().rateLimits);
}

export function subscribeIslandUsage(cb: () => void): Array<() => void> {
  return PROVIDERS.map((id) => chatStoreFor(id).subscribe(cb));
}

export function armIslandUsage(): () => void {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const island = useIslandStore.getState();
    if (!island.showUsage && !isEdgeDock(island.dock)) return;
    for (const id of PROVIDERS) {
      const store = chatStoreFor(id);
      const state = store.getState();
      if (id === "codex") {
        const run =
          state.connectionStatus === "ready"
            ? state.refreshAccount()
            : state.connect().then(() => store.getState().refreshAccount());
        void run.catch(() => {});
        continue;
      }
      if (state.connectionStatus === "idle") {
        void state.connect().catch(() => {});
      }
    }
  };
  tick();
  const interval = window.setInterval(tick, INTERVAL_MS);
  const unsub = useIslandStore.subscribe((state, prev) => {
    if (state.showUsage && !prev.showUsage) tick();
    else if (isEdgeDock(state.dock) && state.dock !== prev.dock) tick();
  });
  return () => {
    stopped = true;
    window.clearInterval(interval);
    unsub();
  };
}

export function useIslandUsage(): IslandProviderUsage[] {
  const [rows, setRows] = useState(collectIslandUsage);
  useEffect(() => {
    const sync = () => setRows(collectIslandUsage());
    const offs = subscribeIslandUsage(sync);
    sync();
    return () => offs.forEach((off) => off());
  }, []);
  return rows;
}
