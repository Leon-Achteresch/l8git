import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { platformStorage } from "@/lib/platform/kv";

export type FileClass = "lockfile" | "generated" | "snapshot" | "vendor" | "test" | "docs";
export const FILE_CLASSES: FileClass[] = ["lockfile", "generated", "snapshot", "vendor", "test", "docs"];

const RULES: [FileClass, RegExp][] = [
  ["lockfile", /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|composer\.lock|go\.sum|Podfile\.lock|uv\.lock|flake\.lock)$/i],
  ["snapshot", /(__snapshots__\/|\.snap$|\.snapshot$)/i],
  ["vendor", /(^|\/)(vendor|node_modules|third_party|Pods)\//],
  ["generated", /(^|\/)(dist|build|out|gen|generated|\.next|coverage)\/|\.(min\.(js|css)|map|pb\.go|g\.dart|generated\.[a-z]+)$|_pb2\.py$|routeTree\.gen\.ts$/i],
  ["test", /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$/i],
  ["docs", /\.(md|mdx|rst|adoc)$|(^|\/)docs\//i],
];

/** Path-based classes; heuristic by design, the UI shows them as labels and never hides silently. */
export function classifyFile(path: string): FileClass[] {
  return RULES.filter(([, re]) => re.test(path)).map(([c]) => c);
}

export type DiffProfile = { id: string; name: string; hide: FileClass[] };
export const BUILTIN_PROFILES: DiffProfile[] = [
  { id: "all", name: "", hide: [] },
  { id: "noise", name: "", hide: ["lockfile", "generated", "snapshot", "vendor"] },
  { id: "code", name: "", hide: ["lockfile", "generated", "snapshot", "vendor", "docs", "test"] },
];

/** 56: saved filter profiles + the active one, persisted. */
export const useDiffProfiles = create<{
  custom: DiffProfile[];
  active: string;
  setActive: (id: string) => void;
  save: (p: DiffProfile) => void;
  remove: (id: string) => void;
}>()(
  persist(
    (set) => ({
      custom: [],
      active: "all",
      setActive: (active) => set({ active }),
      save: (p) => set((s) => ({ custom: [...s.custom.filter((x) => x.id !== p.id), p], active: p.id })),
      remove: (id) => set((s) => ({ custom: s.custom.filter((x) => x.id !== id), active: s.active === id ? "all" : s.active })),
    }),
    { name: "l8git-diff-profiles-v1", storage: createJSONStorage(() => platformStorage) },
  ),
);

/** Splits files into shown and hidden-by-profile, preserving order. */
export function applyProfile<T extends { path: string }>(files: T[], hide: FileClass[]): { shown: T[]; hidden: T[] } {
  if (!hide.length) return { shown: files, hidden: [] };
  const shown: T[] = [];
  const hidden: T[] = [];
  for (const f of files) (classifyFile(f.path).some((c) => hide.includes(c)) ? hidden : shown).push(f);
  return { shown, hidden };
}
