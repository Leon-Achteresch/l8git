import { beforeEach, describe, expect, it } from "vitest";

import { setPlatform, type PlatformIpc } from "@/lib/platform";
import { kvGet, kvSet, kvSetOrThrow, platformStorage, resetKvCache } from "@/lib/platform/kv";

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
