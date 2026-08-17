import { describe, expect, it } from "vitest";

import {
  clampStaleDays,
  defaultCleanupSelection,
  deletableRemoteRef,
  groupCleanupCandidates,
  normalizeReason,
  parseCleanupCandidates,
  type BranchCleanupCandidate,
} from "@/lib/branch-cleanup";

function candidate(over: Partial<BranchCleanupCandidate>): BranchCleanupCandidate {
  return {
    name: "feature/x",
    tip: "aaaaaaa",
    reason: "merged",
    lastCommitAt: "2026-01-01T00:00:00Z",
    isCurrent: false,
    remoteRef: null,
    remoteMerged: null,
    ...over,
  };
}

describe("normalizeReason", () => {
  it("maps every known backend spelling", () => {
    expect(normalizeReason("merged")).toBe("merged");
    expect(normalizeReason("Squash-Merged")).toBe("squashMerged");
    expect(normalizeReason("squash_merged")).toBe("squashMerged");
    expect(normalizeReason("squashMerged")).toBe("squashMerged");
    expect(normalizeReason("STALE")).toBe("stale");
    expect(normalizeReason("inactive")).toBe("stale");
  });

  it("returns null for unknown or empty input", () => {
    expect(normalizeReason("whatever")).toBeNull();
    expect(normalizeReason(null)).toBeNull();
  });
});

describe("parseCleanupCandidates", () => {
  it("reads a flat camelCase array", () => {
    const rows = parseCleanupCandidates([
      {
        name: "feature/a",
        tip: "1111111",
        reason: "merged",
        lastCommitAt: "2026-02-01T10:00:00Z",
        remoteRef: "origin/feature/a",
        remoteMerged: true,
      },
    ]);
    expect(rows).toEqual([
      {
        name: "feature/a",
        tip: "1111111",
        reason: "merged",
        lastCommitAt: "2026-02-01T10:00:00Z",
        isCurrent: false,
        remoteRef: "origin/feature/a",
        remoteMerged: true,
      },
    ]);
  });

  it("reads snake_case fields and ref prefixes", () => {
    const rows = parseCleanupCandidates([
      {
        branch: "refs/heads/feature/b",
        commit: "2222222",
        kind: "squash",
        last_commit_at: "2026-02-02T10:00:00Z",
        upstream: "refs/remotes/origin/feature/b",
        remote_merged: true,
        is_current: false,
      },
    ]);
    expect(rows[0]).toMatchObject({
      name: "feature/b",
      tip: "2222222",
      reason: "squashMerged",
      remoteRef: "origin/feature/b",
      remoteMerged: true,
    });
  });

  it("reads a grouped object payload and infers the reason from the group key", () => {
    const rows = parseCleanupCandidates({
      merged: [{ name: "a", tip: "1" }],
      squashMerged: [{ name: "b", tip: "2" }],
      stale: [{ name: "c", tip: "3", lastCommitAt: "2025-01-01T00:00:00Z" }],
    });
    expect(rows.map((r) => [r.name, r.reason])).toEqual([
      ["a", "merged"],
      ["b", "squashMerged"],
      ["c", "stale"],
    ]);
  });

  it("unwraps a candidates envelope", () => {
    const rows = parseCleanupCandidates({ candidates: [{ name: "a", tip: "1", reason: "merged" }] });
    expect(rows.map((r) => r.name)).toEqual(["a"]);
  });

  it("drops garbage, the current branch and duplicates", () => {
    const rows = parseCleanupCandidates([
      null,
      42,
      { tip: "1" },
      { name: "   " },
      { name: "main", reason: "merged", is_current: true },
      { name: "dup", reason: "merged", tip: "1" },
      { name: "dup", reason: "stale", tip: "2" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["dup"]);
    expect(rows[0]?.reason).toBe("merged");
  });

  it("falls back to stale for unknown reasons so nothing is preselected by accident", () => {
    const rows = parseCleanupCandidates([{ name: "a", tip: "1", reason: "somethingNew" }]);
    expect(rows[0]?.reason).toBe("stale");
  });

  it("reads the BranchCleanupReport payload of branch_cleanup_candidates", () => {
    const rows = parseCleanupCandidates({
      default_branch: "main",
      stale_days: 30,
      current_branch: "main",
      candidates: [
        {
          name: "feature/done",
          kind: "merged",
          last_commit_at: "2026-05-01T09:00:00+02:00",
          last_commit_age_days: 40,
          ahead_of_upstream: 0,
          has_upstream: true,
          upstream: "origin/feature/done",
          tip: "abcdef1234567",
          short_tip: "abcdef1",
          subject: "Add thing",
        },
        {
          name: "feature/squashed",
          kind: "squashMerged",
          last_commit_at: "2026-05-02T09:00:00+02:00",
          last_commit_age_days: 39,
          ahead_of_upstream: 0,
          has_upstream: false,
          upstream: null,
          tip: "1234567abcdef",
          short_tip: "1234567",
          subject: "Squashed thing",
        },
        {
          name: "feature/old",
          kind: "stale",
          last_commit_at: "2025-11-02T09:00:00+01:00",
          last_commit_age_days: 220,
          ahead_of_upstream: 0,
          has_upstream: true,
          upstream: "origin/feature/old",
          tip: "9999999aaaaaa",
          short_tip: "9999999",
          subject: "Old thing",
        },
      ],
    });

    expect(rows.map((r) => [r.name, r.reason, r.tip])).toEqual([
      ["feature/done", "merged", "abcdef1234567"],
      ["feature/squashed", "squashMerged", "1234567abcdef"],
      ["feature/old", "stale", "9999999aaaaaa"],
    ]);
    expect(defaultCleanupSelection(rows)).toEqual(["feature/done", "feature/squashed"]);
    expect(rows.map(deletableRemoteRef)).toEqual(["origin/feature/done", null, null]);
    expect(groupCleanupCandidates(rows).stale.map((c) => c.lastCommitAt)).toEqual([
      "2025-11-02T09:00:00+01:00",
    ]);
  });

  it("returns an empty list for unusable payloads", () => {
    expect(parseCleanupCandidates(null)).toEqual([]);
    expect(parseCleanupCandidates("boom")).toEqual([]);
    expect(parseCleanupCandidates({})).toEqual([]);
  });
});

describe("groupCleanupCandidates", () => {
  it("splits merged and squash-merged into one group and stale into the other", () => {
    const groups = groupCleanupCandidates([
      candidate({ name: "a", reason: "merged" }),
      candidate({ name: "b", reason: "stale" }),
      candidate({ name: "c", reason: "squashMerged" }),
    ]);
    expect(groups.merged.map((c) => c.name)).toEqual(["a", "c"]);
    expect(groups.stale.map((c) => c.name)).toEqual(["b"]);
  });

  it("sorts oldest commit first and breaks ties by name", () => {
    const groups = groupCleanupCandidates([
      candidate({ name: "new", lastCommitAt: "2026-03-01T00:00:00Z" }),
      candidate({ name: "old", lastCommitAt: "2025-01-01T00:00:00Z" }),
      candidate({ name: "b-same", lastCommitAt: "2026-03-01T00:00:00Z" }),
    ]);
    expect(groups.merged.map((c) => c.name)).toEqual(["old", "b-same", "new"]);
  });

  it("puts candidates without a usable date last", () => {
    const groups = groupCleanupCandidates([
      candidate({ name: "nodate", lastCommitAt: null }),
      candidate({ name: "broken", lastCommitAt: "not-a-date" }),
      candidate({ name: "dated", lastCommitAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(groups.merged.map((c) => c.name)).toEqual(["dated", "broken", "nodate"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      candidate({ name: "b", lastCommitAt: "2026-03-01T00:00:00Z" }),
      candidate({ name: "a", lastCommitAt: "2025-01-01T00:00:00Z" }),
    ];
    groupCleanupCandidates(input);
    expect(input.map((c) => c.name)).toEqual(["b", "a"]);
  });
});

describe("defaultCleanupSelection", () => {
  it("preselects merged and squash-merged but never stale", () => {
    const selection = defaultCleanupSelection([
      candidate({ name: "a", reason: "merged" }),
      candidate({ name: "b", reason: "squashMerged" }),
      candidate({ name: "c", reason: "stale" }),
    ]);
    expect(selection).toEqual(["a", "b"]);
  });
});

describe("deletableRemoteRef", () => {
  it("offers the remote twin only when it is merged too", () => {
    expect(deletableRemoteRef(candidate({ remoteRef: "origin/x", remoteMerged: true }))).toBe("origin/x");
    expect(deletableRemoteRef(candidate({ remoteRef: "origin/x", remoteMerged: false }))).toBeNull();
    expect(deletableRemoteRef(candidate({ remoteRef: null, remoteMerged: true }))).toBeNull();
  });

  it("falls back to the reason when the backend omits the merged flag", () => {
    expect(
      deletableRemoteRef(candidate({ reason: "squashMerged", remoteRef: "origin/x", remoteMerged: null })),
    ).toBe("origin/x");
    expect(
      deletableRemoteRef(candidate({ reason: "stale", remoteRef: "origin/x", remoteMerged: null })),
    ).toBeNull();
  });

  it("lets the backend flag win over the reason in both directions", () => {
    expect(
      deletableRemoteRef(candidate({ reason: "stale", remoteRef: "origin/x", remoteMerged: true })),
    ).toBe("origin/x");
    expect(
      deletableRemoteRef(candidate({ reason: "merged", remoteRef: "origin/x", remoteMerged: false })),
    ).toBeNull();
  });

  it("keeps a false flag from the backend payload distinct from a missing one", () => {
    const [withFlag, withoutFlag] = parseCleanupCandidates([
      {
        name: "feature/a",
        kind: "merged",
        upstream: "origin/feature/a",
        remote_merged: false,
      },
      { name: "feature/b", kind: "merged", upstream: "origin/feature/b" },
    ]);
    expect(withFlag.remoteMerged).toBe(false);
    expect(deletableRemoteRef(withFlag)).toBeNull();
    expect(withoutFlag.remoteMerged).toBeNull();
    expect(deletableRemoteRef(withoutFlag)).toBe("origin/feature/b");
  });
});

describe("clampStaleDays", () => {
  it("clamps to the supported range and rounds", () => {
    expect(clampStaleDays(0)).toBe(1);
    expect(clampStaleDays(30.4)).toBe(30);
    expect(clampStaleDays(9999)).toBe(365);
    expect(clampStaleDays(Number.NaN)).toBe(30);
  });
});
