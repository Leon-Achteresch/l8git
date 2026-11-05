import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { platformStorage } from "@/lib/platform/kv";

export const DEFAULT_CONTEXT = 3;

/** Shared across read-only diff viewers so a toggle means the same thing everywhere. */
export const useDiffViewOptions = create<{
  ignoreWhitespace: boolean;
  colorMoved: boolean;
  set: (patch: Partial<{ ignoreWhitespace: boolean; colorMoved: boolean }>) => void;
}>()(
  persist(
    (set) => ({ ignoreWhitespace: false, colorMoved: false, set: (patch) => set(patch) }),
    { name: "l8git-diff-view-options", storage: createJSONStorage(() => platformStorage) },
  ),
);

/** Next context size when expanding: 3 → 10 → 25 → 100 → 500 (backend maximum). */
export function nextContext(current: number): number {
  return [10, 25, 100, 500].find((n) => n > current) ?? 500;
}

export const isTransformed = (o: { ignoreWhitespace: boolean; colorMoved: boolean }, context: number) =>
  o.ignoreWhitespace || o.colorMoved || context !== DEFAULT_CONTEXT;
