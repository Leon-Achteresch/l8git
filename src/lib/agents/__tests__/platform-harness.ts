import { vi, type Mock } from "vitest";

import { setPlatform, type PlatformIpc } from "@/lib/platform";
import { resetKvCache } from "@/lib/platform/kv";

export interface TestPlatform {
  ipc: PlatformIpc;
  invoke: Mock;
  storage: Map<string, string>;
  secrets: Map<string, string>;
  channels: Array<(message: unknown) => void>;
  emit: (event: string, payload: unknown) => void;
  listenerCount: (event: string) => number;
}

export function installTestPlatform(): TestPlatform {
  const storage = new Map<string, string>();
  const secrets = new Map<string, string>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const channels: Array<(message: unknown) => void> = [];
  const invoke = vi.fn();

  const ipc: PlatformIpc = {
    invoke: <T,>(cmd: string, args?: Record<string, unknown>) =>
      invoke(cmd, args) as Promise<T>,
    channel: <T,>(onMessage: (message: T) => void) => {
      channels.push(onMessage as (message: unknown) => void);
      return { onmessage: onMessage };
    },
    listen: (event, callback) => {
      const registered = listeners.get(event) ?? new Set<(payload: unknown) => void>();
      registered.add(callback);
      listeners.set(event, registered);
      return () => {
        registered.delete(callback);
      };
    },
    storage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => void storage.set(name, value),
      removeItem: (name) => void storage.delete(name),
    },
    secrets: {
      get: async (key) => secrets.get(key) ?? null,
      set: async (key, value) => void secrets.set(key, value),
      delete: async (key) => void secrets.delete(key),
    },
  };

  setPlatform(ipc);
  resetKvCache();

  return {
    ipc,
    invoke,
    storage,
    secrets,
    channels,
    emit: (event, payload) => {
      for (const callback of [...(listeners.get(event) ?? [])]) callback(payload);
    },
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
  };
}
