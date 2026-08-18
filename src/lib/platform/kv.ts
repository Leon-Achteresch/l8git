import type { StateStorage } from "zustand/middleware";

import { hasPlatform, platform } from "@/lib/platform";

const cache = new Map<string, string | null>();

function storage(): StateStorage | null {
  return hasPlatform() ? platform().storage : null;
}

export function kvGet(key: string): string | null {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const store = storage();
  if (!store) return null;
  let value: string | null | Promise<string | null>;
  try {
    value = store.getItem(key);
  } catch {
    return null;
  }
  if (typeof value === "string" || value === null) {
    cache.set(key, value);
    return value;
  }
  cache.set(key, null);
  void Promise.resolve(value)
    .then((resolved) => cache.set(key, resolved ?? null))
    .catch(() => cache.set(key, null));
  return null;
}

export function kvSet(key: string, value: string): void {
  cache.set(key, value);
  const store = storage();
  if (!store) return;
  try {
    void Promise.resolve(store.setItem(key, value)).catch(() => undefined);
  } catch {
    return;
  }
}

export function kvRemove(key: string): void {
  cache.set(key, null);
  const store = storage();
  if (!store) return;
  try {
    void Promise.resolve(store.removeItem(key)).catch(() => undefined);
  } catch {
    return;
  }
}

export async function hydrateKv(keys: readonly string[]): Promise<void> {
  const store = storage();
  if (!store) return;
  await Promise.all(
    keys.map(async (key) => {
      try {
        cache.set(key, (await store.getItem(key)) ?? null);
      } catch {
        cache.set(key, null);
      }
    }),
  );
}

export function resetKvCache(): void {
  cache.clear();
}

export const platformStorage: StateStorage = {
  getItem: (name) => storage()?.getItem(name) ?? null,
  setItem: (name, value) => storage()?.setItem(name, value),
  removeItem: (name) => storage()?.removeItem(name),
};
