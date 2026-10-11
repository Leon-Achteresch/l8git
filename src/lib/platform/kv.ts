import type { StateStorage } from "zustand/middleware";

import { hasPlatform, platform } from "@/lib/platform";

const cache = new Map<string, string | null>();
const writeRevisions = new Map<string, number>();
const pendingWrites = new Map<string, Promise<void>>();
const writeFailures = new Map<string, unknown>();
let cacheEpoch = 0;
let nextWriteRevision = 0;

function storage(): StateStorage | null {
  return hasPlatform() ? platform().storage : null;
}

function write(key: string, operation: () => unknown): void {
  const revision = ++nextWriteRevision;
  writeRevisions.set(key, revision);
  const previous = pendingWrites.get(key);
  let result: unknown;
  try {
    // Synchronous desktop storage keeps its immediate write/throw contract.
    result = previous ? previous.catch(() => undefined).then(operation) : operation();
  } catch (error) {
    writeFailures.set(key, error);
    throw error;
  }
  const asynchronous = result !== null && (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function";
  if (!asynchronous) {
    writeFailures.delete(key);
    return;
  }
  const pending = Promise.resolve(result).then(() => {
    if (writeRevisions.get(key) === revision) writeFailures.delete(key);
  }, (error: unknown) => {
    if (writeRevisions.get(key) === revision) writeFailures.set(key, error);
    throw error;
  });
  pendingWrites.set(key, pending);
  const settled = () => {
    if (pendingWrites.get(key) === pending) pendingWrites.delete(key);
  };
  // Keep failure state for an explicit durability check without unhandled rejections.
  void pending.then(settled, settled);
}

/** Await durable KV mutations, including newer writes queued while flushing. */
export async function flushKvWrites(keys?: readonly string[]): Promise<void> {
  while (true) {
    const selected = new Set(keys ?? [...pendingWrites.keys(), ...writeFailures.keys()]);
    const writes = [...selected].flatMap((key) => {
      const pending = pendingWrites.get(key);
      return pending ? [pending] : [];
    });
    await Promise.allSettled(writes);
    if ([...selected].some((key) => pendingWrites.has(key)) || !keys && pendingWrites.size > 0) continue;
    for (const key of selected) {
      if (writeFailures.has(key)) throw writeFailures.get(key);
    }
    return;
  }
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
  const revision = writeRevisions.get(key);
  const epoch = cacheEpoch;
  cache.set(key, null);
  void Promise.resolve(value)
    .then((resolved) => {
      if (cacheEpoch === epoch && writeRevisions.get(key) === revision) cache.set(key, resolved ?? null);
    })
    .catch(() => {
      if (cacheEpoch === epoch && writeRevisions.get(key) === revision) cache.set(key, null);
    });
  return null;
}

export function kvSet(key: string, value: string): void {
  try {
    kvSetOrThrow(key, value);
  } catch {
    cache.set(key, value);
  }
}

export function kvSetOrThrow(key: string, value: string): void {
  const store = storage();
  if (!store) {
    cache.set(key, value);
    return;
  }
  write(key, () => store.setItem(key, value));
  cache.set(key, value);
}

export function kvRemove(key: string): void {
  cache.set(key, null);
  const store = storage();
  if (!store) return;
  try {
    write(key, () => store.removeItem(key));
  } catch {
    return;
  }
}

export async function hydrateKv(keys: readonly string[]): Promise<void> {
  const store = storage();
  if (!store) return;
  await Promise.all(
    keys.map(async (key) => {
      const revision = writeRevisions.get(key);
      const epoch = cacheEpoch;
      try {
        const pending = pendingWrites.get(key);
        if (pending) await pending.catch(() => undefined);
        if (cacheEpoch !== epoch || writeRevisions.get(key) !== revision || writeFailures.has(key)) return;
        const value = (await store.getItem(key)) ?? null;
        if (cacheEpoch === epoch && writeRevisions.get(key) === revision) cache.set(key, value);
      } catch {
        if (cacheEpoch === epoch && writeRevisions.get(key) === revision && !cache.has(key)) cache.set(key, null);
      }
    }),
  );
}

export function resetKvCache(): void {
  cacheEpoch += 1;
  cache.clear();
  writeFailures.clear();
}

export const platformStorage: StateStorage = {
  getItem: (name) => storage()?.getItem(name) ?? null,
  setItem: (name, value) => {
    try {
      return storage()?.setItem(name, value);
    } catch {
      return;
    }
  },
  removeItem: (name) => storage()?.removeItem(name),
};
