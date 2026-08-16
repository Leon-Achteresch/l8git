import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { diffStatFromStatus, isDiffStatStale } from "@/lib/agents/worktree-diff";
import type { StatusEntry } from "@/lib/repo-store";

function status(overrides: Partial<StatusEntry> = {}): StatusEntry {
  return {
    path: "src/main.ts",
    index_status: "M",
    worktree_status: " ",
    staged: true,
    unstaged: false,
    untracked: false,
    additions_staged: 0,
    deletions_staged: 0,
    additions_unstaged: 0,
    deletions_unstaged: 0,
    binary: false,
    embedded_repo: false,
    ...overrides,
  };
}

describe("diffStatFromStatus", () => {
  it("sums staged and unstaged line counts across files", () => {
    expect(
      diffStatFromStatus(
        [
          status({ additions_staged: 10, deletions_staged: 2 }),
          status({ path: "b.ts", additions_unstaged: 5, deletions_unstaged: 3 }),
        ],
        1_000,
      ),
    ).toEqual({ files: 2, additions: 15, deletions: 5, loadedAt: 1_000 });
  });

  it("returns zeroes for a clean worktree", () => {
    expect(diffStatFromStatus([], 1)).toEqual({ files: 0, additions: 0, deletions: 0, loadedAt: 1 });
  });
});

describe("isDiffStatStale", () => {
  it("treats missing and expired entries as stale", () => {
    expect(isDiffStatStale(undefined, 1_000, 100)).toBe(true);
    const stat = { files: 1, additions: 1, deletions: 0, loadedAt: 1_000 };
    expect(isDiffStatStale(stat, 1_050, 100)).toBe(false);
    expect(isDiffStatStale(stat, 1_100, 100)).toBe(true);
  });
});
