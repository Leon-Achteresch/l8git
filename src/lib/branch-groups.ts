import type { Branch } from "@/lib/repo-store";

// Top-level branches (no "/" in ref path) are shown as flat rows above any
// accordion groups. Well-known names are ordered first; everything else
// falls through to alphabetical.
const FLAT_ORDER = [
  "main",
  "master",
  "trunk",
  "dev",
  "develop",
  "development",
  "staging",
  "production",
  "release",
] as const;

const FLAT_ORDER_INDEX = new Map<string, number>(
  FLAT_ORDER.map((name, i) => [name, i]),
);

// Prefixed branches ("<prefix>/<rest>") are grouped by their first segment.
// Known prefixes are ordered first; unknown prefixes come after, alphabetical.
const PREFIX_ORDER = [
  "feature",
  "feat",
  "fix",
  "bugfix",
  "hotfix",
  "refactor",
  "chore",
  "perf",
  "docs",
  "test",
  "style",
  "release",
  "experiment",
] as const;

const PREFIX_ORDER_INDEX = new Map<string, number>(
  PREFIX_ORDER.map((p, i) => [p, i]),
);

export type BranchGroup = {
  id: string;
  label: string;
  branches: Branch[];
};

export type BranchGrouping = {
  flat: Branch[];
  groups: BranchGroup[];
};

function refPathForBranch(b: Branch): string {
  if (b.is_remote) {
    const i = b.name.indexOf("/");
    return i >= 0 ? b.name.slice(i + 1) : b.name;
  }
  return b.name;
}

function compareBranchesInGroup(a: Branch, b: Branch): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function compareFlatBranches(a: Branch, b: Branch): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  const aRef = refPathForBranch(a).toLowerCase();
  const bRef = refPathForBranch(b).toLowerCase();
  const ai = FLAT_ORDER_INDEX.get(aRef) ?? Number.POSITIVE_INFINITY;
  const bi = FLAT_ORDER_INDEX.get(bRef) ?? Number.POSITIVE_INFINITY;
  if (ai !== bi) return ai - bi;
  return aRef.localeCompare(bRef, undefined, { sensitivity: "base" });
}

function comparePrefixIds(a: string, b: string): number {
  const ai = PREFIX_ORDER_INDEX.get(a) ?? Number.POSITIVE_INFINITY;
  const bi = PREFIX_ORDER_INDEX.get(b) ?? Number.POSITIVE_INFINITY;
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function groupBranchesByKind(branches: Branch[]): BranchGrouping {
  const flat: Branch[] = [];
  const byPrefix = new Map<string, Branch[]>();

  for (const b of branches) {
    const refPath = refPathForBranch(b);
    const slash = refPath.indexOf("/");
    if (slash < 0) {
      flat.push(b);
      continue;
    }
    const prefix = refPath.slice(0, slash).trim().toLowerCase();
    if (!prefix) {
      flat.push(b);
      continue;
    }
    const list = byPrefix.get(prefix);
    if (list) list.push(b);
    else byPrefix.set(prefix, [b]);
  }

  flat.sort(compareFlatBranches);

  const prefixIds = Array.from(byPrefix.keys()).sort(comparePrefixIds);
  const groups: BranchGroup[] = prefixIds.map((id) => {
    const list = byPrefix.get(id)!;
    list.sort(compareBranchesInGroup);
    return { id, label: id, branches: list };
  });

  return { flat, groups };
}

export function groupSignature(grouping: BranchGrouping): string {
  return grouping.groups
    .map((g) => g.id)
    .slice()
    .sort()
    .join("|");
}
