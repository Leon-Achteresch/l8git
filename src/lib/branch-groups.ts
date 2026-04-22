import type { Branch } from "@/lib/repo-store";

const ORDER = [
  "main",
  "development",
  "feature",
  "hotfix",
  "bugfix",
] as const;

export const OTHER_GROUP_ID = "__sonstige__" as const;

export type BranchGroup = {
  id: string;
  label: string;
  branches: Branch[];
};

const ORDER_SET = new Set<string>(ORDER);

function refPathForBranch(b: Branch): string {
  if (b.is_remote) {
    const i = b.name.indexOf("/");
    return i >= 0 ? b.name.slice(i + 1) : b.name;
  }
  return b.name;
}

function groupIdForRefPath(refPath: string): string {
  const seg = refPath.split("/")[0]?.trim() ?? "";
  if (!seg) return OTHER_GROUP_ID;
  if (ORDER_SET.has(seg)) return seg;
  return OTHER_GROUP_ID;
}

function groupLabel(id: string): string {
  if (id === OTHER_GROUP_ID) return "Sonstige";
  return id;
}

function compareBranchesInGroup(a: Branch, b: Branch): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function groupBranchesByKind(branches: Branch[]): BranchGroup[] {
  const byId = new Map<string, Branch[]>();
  for (const b of branches) {
    const refPath = refPathForBranch(b);
    const id = groupIdForRefPath(refPath);
    const list = byId.get(id);
    if (list) list.push(b);
    else byId.set(id, [b]);
  }
  for (const list of byId.values()) {
    list.sort(compareBranchesInGroup);
  }
  const out: BranchGroup[] = [];
  for (const id of ORDER) {
    const list = byId.get(id);
    if (list?.length) out.push({ id, label: groupLabel(id), branches: list });
  }
  const other = byId.get(OTHER_GROUP_ID);
  if (other?.length) {
    out.push({
      id: OTHER_GROUP_ID,
      label: groupLabel(OTHER_GROUP_ID),
      branches: other,
    });
  }
  return out;
}

export function groupSignature(groups: BranchGroup[]): string {
  return groups
    .map((g) => g.id)
    .slice()
    .sort()
    .join("|");
}
