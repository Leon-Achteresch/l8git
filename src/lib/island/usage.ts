import { useEffect, useState } from "react";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { IslandProviderUsage } from "@/lib/island/types";
import { useIslandStore } from "@/lib/island-store";

const PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "opencode", "cursor"];
const INTERVAL_MS = 20_000;

export function collectIslandUsage(): IslandProviderUsage[] {
  return PROVIDERS.map((id) => {
    const { rateLimits } = chatStoreFor(id).getState();
    return {
      id,
      primary: rateLimits?.primary ?? null,
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
    if (stopped || document.hidden) return;
    if (!useIslandStore.getState().showUsage) return;
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
  });
  const onVisible = () => {
    if (!document.hidden) tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    window.clearInterval(interval);
    unsub();
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function useIslandUsage(): IslandProviderUsage[] {
  const [rows, setRows] = useState(collectIslandUsage);
  useEffect(() => {
    let last: unknown[] = [];
    const sync = () => {
      const inputs = islandUsageInputs();
      if (inputs.length === last.length && inputs.every((v, i) => v === last[i])) {
        return;
      }
      last = inputs;
      setRows(collectIslandUsage());
    };
    const offs = subscribeIslandUsage(sync);
    sync();
    return () => offs.forEach((off) => off());
  }, []);
  return rows;
}
