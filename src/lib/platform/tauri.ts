import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { StateStorage } from "zustand/middleware";

import { setPlatform, type PlatformIpc, type PlatformSecrets } from "@/lib/platform";
import { notifyAppSuspend } from "@/lib/platform/lifecycle";

const storage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      return;
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      return;
    }
  },
};

const secrets: PlatformSecrets = {
  get: (key) => invoke<string | null>("secret_get", { key }),
  set: async (key, value) => {
    await invoke("secret_set", { key, value });
  },
  delete: async (key) => {
    await invoke("secret_delete", { key });
  },
};

export const tauriPlatform: PlatformIpc = {
  invoke: <T,>(cmd: string, args?: Record<string, unknown>) => invoke<T>(cmd, args),
  channel: <T,>(onMessage: (message: T) => void) => {
    const channel = new Channel<T>();
    channel.onmessage = onMessage;
    return channel;
  },
  listen: (event, callback) => {
    let disposed = false;
    let off: (() => void) | null = null;
    void listen(event, (received) => callback(received.payload))
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        off = unlisten;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      off?.();
      off = null;
    };
  },
  storage,
  secrets,
};

export function registerTauriPlatform(): PlatformIpc {
  setPlatform(tauriPlatform);
  return tauriPlatform;
}

registerTauriPlatform();

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", notifyAppSuspend);
  window.addEventListener("beforeunload", notifyAppSuspend);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") notifyAppSuspend();
    });
  }
}
