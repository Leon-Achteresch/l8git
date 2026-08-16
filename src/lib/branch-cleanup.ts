export type BranchCleanupReason = "merged" | "squashMerged" | "stale";

export type BranchCleanupCandidate = {
  name: string;
  tip: string;
  reason: BranchCleanupReason;
  lastCommitAt: string | null;
  isCurrent: boolean;
  remoteRef: string | null;
  remoteMerged: boolean | null;
};

export type BranchCleanupGroups = {
  merged: BranchCleanupCandidate[];
  stale: BranchCleanupCandidate[];
};

export const DEFAULT_STALE_DAYS = 30;
export const MIN_STALE_DAYS = 1;
export const MAX_STALE_DAYS = 365;

const REASON_KEYS: Record<string, BranchCleanupReason> = {
  merged: "merged",
  ismerged: "merged",
  fullymerged: "merged",
  squash: "squashMerged",
  squashed: "squashMerged",
  squashmerged: "squashMerged",
  "squash-merged": "squashMerged",
  squash_merged: "squashMerged",
  stale: "stale",
  inactive: "stale",
  old: "stale",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickBool(row: Record<string, unknown>, keys: readonly string[]): boolean | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "boolean") return v;
  }
  return null;
}

function stripRefPrefix(name: string): string {
  return name.replace(/^refs\/(heads|remotes)\//, "");
}

export function normalizeReason(raw: string | null): BranchCleanupReason | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return REASON_KEYS[key] ?? null;
}

function parseEntry(value: unknown, fallback: BranchCleanupReason | null): BranchCleanupCandidate | null {
  const row = asRecord(value);
  if (!row) return null;
  const rawName = pickString(row, ["name", "branch", "branchName", "branch_name", "ref", "refName", "ref_name"]);
  if (!rawName) return null;
  const name = stripRefPrefix(rawName);
  if (!name) return null;
  const tip =
    pickString(row, ["tip", "hash", "commit", "sha", "oid", "commitHash", "commit_hash", "head"]) ?? "";
  const reason =
    normalizeReason(pickString(row, ["reason", "kind", "detection", "detectionKind", "detection_kind", "type", "state"])) ??
    fallback ??
    "stale";
  const lastCommitAt = pickString(row, [
    "lastCommitAt",
    "last_commit_at",
    "lastCommitDate",
    "last_commit_date",
    "committedAt",
    "committed_at",
    "date",
    "when",
  ]);
  const remoteRef = pickString(row, [
    "remoteRef",
    "remote_ref",
    "upstream",
    "upstreamRef",
    "upstream_ref",
    "remote",
    "remoteBranch",
    "remote_branch",
  ]);
  return {
    name,
    tip,
    reason,
    lastCommitAt,
    isCurrent: pickBool(row, ["isCurrent", "is_current", "current"]) === true,
    remoteRef: remoteRef ? stripRefPrefix(remoteRef) : null,
    remoteMerged: pickBool(row, [
      "remoteMerged",
      "remote_merged",
      "upstreamMerged",
      "upstream_merged",
      "remoteIsMerged",
      "remote_is_merged",
    ]),
  };
}

const GROUP_KEYS: readonly (readonly [string, BranchCleanupReason])[] = [
  ["merged", "merged"],
  ["squashMerged", "squashMerged"],
  ["squash_merged", "squashMerged"],
  ["squashed", "squashMerged"],
  ["stale", "stale"],
  ["inactive", "stale"],
];

export function parseCleanupCandidates(raw: unknown): BranchCleanupCandidate[] {
  const rows: BranchCleanupCandidate[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const parsed = parseEntry(entry, null);
      if (parsed) rows.push(parsed);
    }
  } else {
    const obj = asRecord(raw);
    if (!obj) return [];
    if (Array.isArray(obj.candidates)) return parseCleanupCandidates(obj.candidates);
    const nested = asRecord(obj.candidates) ?? obj;
    for (const [key, reason] of GROUP_KEYS) {
      const list = nested[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const parsed = parseEntry(entry, reason);
        if (parsed) rows.push(parsed);
      }
    }
  }

  const seen = new Set<string>();
  const result: BranchCleanupCandidate[] = [];
  for (const row of rows) {
    if (row.isCurrent) continue;
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    result.push(row);
  }
  return result;
}

function timestampOf(candidate: BranchCleanupCandidate): number {
  if (!candidate.lastCommitAt) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(candidate.lastCommitAt);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function compareCandidates(a: BranchCleanupCandidate, b: BranchCleanupCandidate): number {
  const ta = timestampOf(a);
  const tb = timestampOf(b);
  if (ta !== tb) return ta - tb;
  return a.name.localeCompare(b.name);
}

export function groupCleanupCandidates(
  candidates: readonly BranchCleanupCandidate[],
): BranchCleanupGroups {
  const merged: BranchCleanupCandidate[] = [];
  const stale: BranchCleanupCandidate[] = [];
  for (const c of candidates) {
    if (c.reason === "stale") stale.push(c);
    else merged.push(c);
  }
  merged.sort(compareCandidates);
  stale.sort(compareCandidates);
  return { merged, stale };
}

export function defaultCleanupSelection(
  candidates: readonly BranchCleanupCandidate[],
): string[] {
  return candidates.filter((c) => c.reason !== "stale").map((c) => c.name);
}

export function deletableRemoteRef(candidate: BranchCleanupCandidate): string | null {
  if (!candidate.remoteRef) return null;
  if (candidate.remoteMerged === false) return null;
  if (candidate.remoteMerged === null && candidate.reason === "stale") return null;
  return candidate.remoteRef;
}

export function clampStaleDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STALE_DAYS;
  const rounded = Math.round(value);
  if (rounded < MIN_STALE_DAYS) return MIN_STALE_DAYS;
  if (rounded > MAX_STALE_DAYS) return MAX_STALE_DAYS;
  return rounded;
}
