import { describe, expect, it } from "vitest";

import type { PullRequest } from "@/lib/repo-store";
import {
  branchTitleSuggestion,
  buildPrChain,
  chainBodyMarkdown,
  chainSummary,
  composePrBody,
  findExistingPr,
  markChainFailure,
  stackChain,
  stackChainTopDown,
  stackIsBroken,
  stackLabels,
  stackNeedsRestack,
  stackRestackTargets,
  submittableChainEntries,
  totalStackBranches,
  updateChainEntry,
  type Stack,
  type StackBranch,
  type StackList,
} from "@/lib/stack";

function branch(over: Partial<StackBranch> & { name: string }): StackBranch {
  return {
    parent: "main",
    level: 1,
    exists: true,
    parent_exists: true,
    broken: false,
    is_current: false,
    ahead: 1,
    behind: 0,
    needs_restack: false,
    tip: "1111111111111111111111111111111111111111",
    short_tip: "1111111",
    last_commit_at: "2026-02-01T10:00:00Z",
    upstream: null,
    commit_count: 1,
    commits: [{ hash: "aaa", short_hash: "aaa", subject: "top commit" }],
    ...over,
  };
}

function stack(over: Partial<Stack> & { branches: StackBranch[] }): Stack {
  return {
    root: "main",
    root_exists: true,
    root_tip: "0000000000000000000000000000000000000000",
    broken: false,
    needs_restack: false,
    ...over,
  };
}

function pr(over: Partial<PullRequest> & { source_branch: string }): PullRequest {
  return {
    number: 1,
    title: "Existing",
    state: "open",
    is_draft: false,
    author: "leon",
    author_avatar: null,
    target_branch: "main",
    html_url: "https://example.test/pr/1",
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    labels: [],
    reviewers: [],
    provider: "github",
    ...over,
  };
}

describe("stackChain", () => {
  it("orders a linear stack from the root upwards", () => {
    const s = stack({
      branches: [
        branch({ name: "c", parent: "b", level: 3 }),
        branch({ name: "a", parent: "main", level: 1 }),
        branch({ name: "b", parent: "a", level: 2 }),
      ],
    });
    expect(stackChain(s).map((b) => b.name)).toEqual(["a", "b", "c"]);
  });

  it("walks siblings depth-first and sorts them by level and name", () => {
    const s = stack({
      branches: [
        branch({ name: "zeta", parent: "main", level: 1 }),
        branch({ name: "alpha", parent: "main", level: 1 }),
        branch({ name: "alpha-child", parent: "alpha", level: 2 }),
      ],
    });
    expect(stackChain(s).map((b) => b.name)).toEqual([
      "alpha",
      "alpha-child",
      "zeta",
    ]);
  });

  it("keeps orphaned levels instead of dropping them", () => {
    const s = stack({
      branches: [
        branch({ name: "a", parent: "main", level: 1 }),
        branch({ name: "orphan", parent: "gone", level: 2, parent_exists: false, broken: true }),
      ],
    });
    expect(stackChain(s).map((b) => b.name)).toEqual(["a", "orphan"]);
  });

  it("does not loop on a self-referencing level", () => {
    const s = stack({
      branches: [branch({ name: "loop", parent: "loop", level: 1 })],
    });
    expect(stackChain(s).map((b) => b.name)).toEqual(["loop"]);
  });

  it("renders top down with the newest level first", () => {
    const s = stack({
      branches: [
        branch({ name: "a", parent: "main", level: 1 }),
        branch({ name: "b", parent: "a", level: 2 }),
      ],
    });
    expect(stackChainTopDown(s).map((b) => b.name)).toEqual(["b", "a"]);
  });
});

describe("stackRestackTargets", () => {
  it("returns only the levels sitting directly on the root", () => {
    const s = stack({
      branches: [
        branch({ name: "a", parent: "main", level: 1 }),
        branch({ name: "b", parent: "a", level: 2 }),
        branch({ name: "c", parent: "main", level: 1 }),
      ],
    });
    expect(stackRestackTargets(s)).toEqual(["a", "c"]);
  });
});

describe("stack flags", () => {
  it("reports restack need from the stack or any level", () => {
    expect(
      stackNeedsRestack(stack({ branches: [branch({ name: "a" })] })),
    ).toBe(false);
    expect(
      stackNeedsRestack(
        stack({ branches: [branch({ name: "a", needs_restack: true })] }),
      ),
    ).toBe(true);
  });

  it("reports broken state from a missing root", () => {
    expect(
      stackIsBroken(stack({ root_exists: false, branches: [branch({ name: "a" })] })),
    ).toBe(true);
  });

  it("counts all levels of all stacks", () => {
    const list: StackList = {
      default_branch: "main",
      current_branch: "a",
      stacks: [
        stack({ branches: [branch({ name: "a" }), branch({ name: "b", parent: "a", level: 2 })] }),
        stack({ root: "develop", branches: [branch({ name: "c", parent: "develop" })] }),
      ],
      cycles: [],
      has_cycle: false,
      has_broken: false,
      errors: [],
    };
    expect(totalStackBranches(list)).toBe(3);
  });
});

describe("stackLabels", () => {
  it("maps each existing level to its stack root and level", () => {
    const list: StackList = {
      default_branch: "main",
      current_branch: "b",
      stacks: [
        stack({
          branches: [
            branch({ name: "a", parent: "main", level: 1 }),
            branch({ name: "b", parent: "a", level: 2, needs_restack: true }),
            branch({ name: "gone", parent: "b", level: 3, exists: false, broken: true }),
          ],
        }),
      ],
      cycles: [],
      has_cycle: false,
      has_broken: true,
      errors: [],
    };
    const labels = stackLabels(list);
    expect(labels.get("a")).toEqual({
      root: "main",
      level: 1,
      size: 3,
      needsRestack: false,
    });
    expect(labels.get("b")?.needsRestack).toBe(true);
    expect(labels.has("gone")).toBe(false);
  });
});

describe("branchTitleSuggestion", () => {
  it("uses the oldest own commit of the level", () => {
    const b = branch({
      name: "feature",
      commits: [
        { hash: "b", short_hash: "b", subject: "second" },
        { hash: "a", short_hash: "a", subject: "first" },
      ],
    });
    expect(branchTitleSuggestion(b)).toBe("first");
  });

  it("falls back to the branch name without commits", () => {
    expect(branchTitleSuggestion(branch({ name: "feature", commits: [] }))).toBe(
      "feature",
    );
  });
});

describe("findExistingPr", () => {
  it("prefers the PR that also matches the parent branch", () => {
    const found = findExistingPr(
      [
        pr({ number: 7, source_branch: "b", target_branch: "main" }),
        pr({ number: 8, source_branch: "b", target_branch: "a" }),
      ],
      "b",
      "a",
    );
    expect(found?.number).toBe(8);
  });

  it("ignores closed and merged PRs", () => {
    expect(
      findExistingPr([pr({ source_branch: "b", state: "MERGED" })], "b", "a"),
    ).toBeNull();
  });

  it("normalizes refs/heads prefixes", () => {
    expect(
      findExistingPr([pr({ source_branch: "refs/heads/b" })], "b", "main")?.number,
    ).toBe(1);
  });
});

describe("buildPrChain", () => {
  const s = stack({
    branches: [
      branch({ name: "a", parent: "main", level: 1, commits: [{ hash: "1", short_hash: "1", subject: "feat a" }] }),
      branch({ name: "b", parent: "a", level: 2, commits: [{ hash: "2", short_hash: "2", subject: "feat b" }] }),
      branch({ name: "gone", parent: "b", level: 3, exists: false, broken: true }),
    ],
  });

  it("plans one entry per usable level, bottom up", () => {
    const chain = buildPrChain(s, []);
    expect(chain.map((e) => [e.branch, e.parent, e.status])).toEqual([
      ["a", "main", "planned"],
      ["b", "a", "planned"],
    ]);
    expect(chain[0].title).toBe("feat a");
  });

  it("marks levels that already have a PR", () => {
    const chain = buildPrChain(s, [
      pr({ number: 12, title: "Feat A", source_branch: "a", target_branch: "main" }),
    ]);
    expect(chain[0].status).toBe("existing");
    expect(chain[0].prNumber).toBe(12);
    expect(chain[0].title).toBe("Feat A");
    expect(chain[1].status).toBe("planned");
    expect(submittableChainEntries(chain).map((e) => e.branch)).toEqual(["b"]);
  });
});

describe("chain updates", () => {
  const chain = buildPrChain(
    stack({
      branches: [
        branch({ name: "a", parent: "main", level: 1 }),
        branch({ name: "b", parent: "a", level: 2 }),
        branch({ name: "c", parent: "b", level: 3 }),
      ],
    }),
    [],
  );

  it("patches a single entry", () => {
    const next = updateChainEntry(chain, "b", { title: "Neuer Titel" });
    expect(next[1].title).toBe("Neuer Titel");
    expect(next[0]).toBe(chain[0]);
  });

  it("marks the failing level and skips everything above it", () => {
    const created = updateChainEntry(chain, "a", {
      status: "created",
      prNumber: 3,
      prUrl: "https://example.test/pr/3",
    });
    const failed = markChainFailure(created, "b", "boom");
    expect(failed.map((e) => e.status)).toEqual(["created", "failed", "skipped"]);
    expect(failed[1].error).toBe("boom");
    expect(chainSummary(failed)).toEqual({
      created: 1,
      existing: 0,
      failed: 1,
      skipped: 1,
      planned: 0,
    });
  });

  it("keeps already existing PRs untouched when a lower level fails", () => {
    const withExisting = updateChainEntry(chain, "c", {
      status: "existing",
      prNumber: 9,
    });
    const failed = markChainFailure(withExisting, "a", "boom");
    expect(failed.map((e) => e.status)).toEqual(["failed", "skipped", "existing"]);
  });

  it("returns a copy for an unknown branch", () => {
    const next = markChainFailure(chain, "unknown", "boom");
    expect(next).toEqual(chain);
    expect(next).not.toBe(chain);
  });

  it("renders the chain markdown and marks the current level", () => {
    const body = chainBodyMarkdown(chain, "b", {
      heading: "#### PR chain",
      currentMarker: "this PR",
    });
    expect(body).toBe(
      ["#### PR chain", "", "- `a`", "- **`b`** — this PR", "- `c`"].join("\n"),
    );
  });

  it("appends the chain to an intro body", () => {
    expect(composePrBody("  Intro  ", "chain")).toBe("Intro\n\n---\n\nchain\n");
    expect(composePrBody("   ", "chain")).toBe("chain\n");
  });
});
