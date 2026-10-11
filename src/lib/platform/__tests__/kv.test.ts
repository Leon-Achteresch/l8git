import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";

import { platform, setPlatform, type PlatformIpc } from "@/lib/platform";
import { flushKvWrites, hydrateKv, kvGet, kvRemove, kvSet, kvSetOrThrow, platformStorage, resetKvCache } from "@/lib/platform/kv";

const backing = new Map<string, string>();
let quotaExceeded = false;

function installPlatform(): void {
  const platform: PlatformIpc = {
    invoke: async () => {
      throw new Error("invoke is not available in this test");
    },
    channel: () => ({}),
    listen: () => () => undefined,
    storage: {
      getItem: (name) => backing.get(name) ?? null,
      setItem: (name, value) => {
        if (quotaExceeded) {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        }
        backing.set(name, value);
      },
      removeItem: (name) => {
        backing.delete(name);
      },
    },
    secrets: {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    },
  };
  setPlatform(platform);
}

beforeEach(() => {
  backing.clear();
  resetKvCache();
  quotaExceeded = false;
  installPlatform();
});

describe("kvSetOrThrow", () => {
  it("writes through to the platform storage", () => {
    kvSetOrThrow("k", "v");
    expect(backing.get("k")).toBe("v");
    expect(kvGet("k")).toBe("v");
  });

  it("propagates a rejected write so callers can degrade", () => {
    kvSetOrThrow("k", "small");
    quotaExceeded = true;
    expect(() => kvSetOrThrow("k", "huge")).toThrow(/quota/u);
  });

  it("keeps the cache in sync with the store when the write fails", () => {
    kvSetOrThrow("k", "small");
    quotaExceeded = true;
    expect(() => kvSetOrThrow("k", "huge")).toThrow();
    expect(kvGet("k")).toBe("small");
    expect(backing.get("k")).toBe("small");
  });

  it("supports the halving fallback used by the cursor transcripts", () => {
    kvSetOrThrow("transcripts", "one");
    quotaExceeded = true;
    let degraded = false;
    try {
      kvSetOrThrow("transcripts", "one+two+three+four");
    } catch {
      degraded = true;
      quotaExceeded = false;
      kvSet("transcripts", "three+four");
    }
    expect(degraded).toBe(true);
    expect(backing.get("transcripts")).toBe("three+four");
    expect(kvGet("transcripts")).toBe("three+four");
  });
});

describe("kvSet", () => {
  it("never throws when the store rejects the write", () => {
    quotaExceeded = true;
    expect(() => kvSet("k", "v")).not.toThrow();
  });
});

describe("platformStorage", () => {
  it("swallows store failures so persisted zustand stores keep working", () => {
    quotaExceeded = true;
    expect(() => platformStorage.setItem("k", "v")).not.toThrow();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function replaceStorage(overrides: Partial<StateStorage>): void {
  setPlatform({ ...platform(), storage: { ...platform().storage, ...overrides } });
}

describe("asynchronous KV durability", () => {
  it("serializes checkpoints and waits for the newest queued write", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const values: string[] = [];
    replaceStorage({ setItem: (key, value) => {
      values.push(value);
      return (values.length === 1 ? first.promise : second.promise).then(() => { backing.set(key, value); });
    } });
    kvSet("checkpoint", "before-removal");
    kvSet("checkpoint", "removed");
    let flushed = false;
    const flush = flushKvWrites(["checkpoint"]).then(() => { flushed = true; });
    expect(values).toEqual(["before-removal"]);
    first.resolve();
    await vi.waitFor(() => expect(values).toEqual(["before-removal", "removed"]));
    expect(flushed).toBe(false);
    second.resolve();
    await flush;
    expect(backing.get("checkpoint")).toBe("removed");
  });

  it("surfaces a durability failure and accepts a successful retry of the latest state", async () => {
    const failure = deferred<void>();
    replaceStorage({ setItem: () => failure.promise });
    kvSet("checkpoint", "removed");
    failure.reject(new Error("storage unavailable"));
    await expect(flushKvWrites(["checkpoint"])).rejects.toThrow("storage unavailable");
    expect(kvGet("checkpoint")).toBe("removed");
    replaceStorage({ setItem: async (key, value) => { backing.set(key, value); } });
    kvSet("checkpoint", kvGet("checkpoint")!);
    await expect(flushKvWrites(["checkpoint"])).resolves.toBeUndefined();
    expect(backing.get("checkpoint")).toBe("removed");
  });

  it("queues removal after an unfinished write so old state cannot reappear", async () => {
    const first = deferred<void>();
    replaceStorage({ setItem: (key, value) => first.promise.then(() => { backing.set(key, value); }) });
    kvSet("checkpoint", "saved");
    kvRemove("checkpoint");
    expect(kvGet("checkpoint")).toBeNull();
    first.resolve();
    await flushKvWrites(["checkpoint"]);
    expect(backing.has("checkpoint")).toBe(false);
  });

  it("keeps an older async cache read from replacing a newer local checkpoint", async () => {
    const read = deferred<string | null>();
    replaceStorage({ getItem: () => read.promise });
    expect(kvGet("checkpoint")).toBeNull();
    kvSet("checkpoint", "removed");
    read.resolve("before-removal");
    await read.promise;
    await Promise.resolve();
    expect(kvGet("checkpoint")).toBe("removed");
  });

  it("keeps delayed hydration from replacing newer writes", async () => {
    const read = deferred<string | null>();
    replaceStorage({ getItem: () => read.promise });
    const hydration = hydrateKv(["checkpoint"]);
    kvSet("checkpoint", "removed");
    read.resolve("before-removal");
    await hydration;
    expect(kvGet("checkpoint")).toBe("removed");
  });

  it("waits for an in-flight write before reading storage for hydration", async () => {
    const written = deferred<void>();
    const getItem = vi.fn(async (key: string) => backing.get(key) ?? null);
    replaceStorage({ getItem, setItem: (key, value) => written.promise.then(() => { backing.set(key, value); }) });
    kvSet("checkpoint", "removed");
    const hydration = hydrateKv(["checkpoint"]);
    expect(getItem).not.toHaveBeenCalled();
    written.resolve();
    await hydration;
    expect(kvGet("checkpoint")).toBe("removed");
  });
});
