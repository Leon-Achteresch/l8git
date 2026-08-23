import { beforeEach, describe, expect, it, type Mock } from "vitest";

import { installTestPlatform } from "@/lib/agents/__tests__/platform-harness";

import {
  canRunStep,
  createFinishSteps,
  deleteSessionBranchIfMerged,
  discardReviewFile,
  discardReviewHunk,
  finishFlowStatus,
  hunkCounts,
  hunkDiffText,
  hunkSelectionKeys,
  isAgentSessionBranch,
  nextPendingStep,
  parseReviewDiff,
  retryStep,
  reviewTotals,
  setStepStatus,
  type AgentReviewFile,
} from "@/lib/agents/agent-review";

let invoke: Mock;

beforeEach(() => {
  invoke = installTestPlatform().invoke;
});

const SAMPLE_DIFF = [
  "diff --git a/f.txt b/f.txt",
  "index 71ac1b5..0b9619f 100644",
  "--- a/f.txt",
  "+++ b/f.txt",
  "@@ -1,4 +1,4 @@",
  " a",
  "-b",
  "+B",
  " c",
  "@@ -10,3 +10,4 @@",
  " x",
  "+y",
  " z",
  "",
].join("\n");

function file(overrides: Partial<AgentReviewFile> = {}): AgentReviewFile {
  return {
    path: "f.txt",
    additions: 1,
    deletions: 1,
    binary: false,
    untracked: false,
    ...overrides,
  };
}

describe("isAgentSessionBranch", () => {
  it("recognises worktree session branches", () => {
    expect(isAgentSessionBranch("agents/fix-login")).toBe(true);
    expect(isAgentSessionBranch("feature/agents")).toBe(false);
    expect(isAgentSessionBranch(null)).toBe(false);
  });
});

describe("reviewTotals", () => {
  it("sums files and line counts", () => {
    expect(
      reviewTotals([file(), file({ path: "g.txt", additions: 4, deletions: 0 })]),
    ).toEqual({ files: 2, additions: 5, deletions: 1 });
  });

  it("is zero for an empty session", () => {
    expect(reviewTotals([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});

describe("hunk helpers", () => {
  it("selects every changed line of a hunk", () => {
    const parsed = parseReviewDiff(SAMPLE_DIFF)!;
    expect([...hunkSelectionKeys(parsed.hunks[0], 0)]).toEqual(["0:1", "0:2"]);
    expect([...hunkSelectionKeys(parsed.hunks[1], 1)]).toEqual(["1:1"]);
  });

  it("renders a hunk without the file headers", () => {
    const parsed = parseReviewDiff(SAMPLE_DIFF)!;
    expect(hunkDiffText(parsed.hunks[1])).toBe("@@ -10,3 +10,4 @@\n x\n+y\n z");
  });

  it("counts additions and deletions per hunk", () => {
    const parsed = parseReviewDiff(SAMPLE_DIFF)!;
    expect(hunkCounts(parsed.hunks[0])).toEqual({ additions: 1, deletions: 1 });
    expect(hunkCounts(parsed.hunks[1])).toEqual({ additions: 1, deletions: 0 });
  });

  it("returns null for an empty diff", () => {
    expect(parseReviewDiff(null)).toBeNull();
    expect(parseReviewDiff("   ")).toBeNull();
  });
});

describe("finish flow steps", () => {
  it("skips the commit step when the worktree is clean", () => {
    expect(createFinishSteps({ hasUncommitted: false })).toEqual([
      { id: "commit", status: "skipped", error: null },
      { id: "merge", status: "pending", error: null },
      { id: "cleanup", status: "pending", error: null },
    ]);
    expect(nextPendingStep(createFinishSteps({ hasUncommitted: false }))).toBe("merge");
  });

  it("runs the steps in order", () => {
    let steps = createFinishSteps({ hasUncommitted: true });
    expect(nextPendingStep(steps)).toBe("commit");
    expect(canRunStep(steps, "merge")).toBe(false);
    steps = setStepStatus(steps, "commit", "done");
    expect(nextPendingStep(steps)).toBe("merge");
    steps = setStepStatus(steps, "merge", "done");
    steps = setStepStatus(steps, "cleanup", "done");
    expect(finishFlowStatus(steps)).toBe("done");
  });

  it("stops the flow on a failed step and allows a retry", () => {
    let steps = setStepStatus(
      createFinishSteps({ hasUncommitted: true }),
      "commit",
      "failed",
      "boom",
    );
    expect(finishFlowStatus(steps)).toBe("failed");
    expect(nextPendingStep(steps)).toBeNull();
    steps = retryStep(steps, "commit");
    expect(finishFlowStatus(steps)).toBe("idle");
    expect(nextPendingStep(steps)).toBe("commit");
  });

  it("reports a running flow while a step is in flight", () => {
    const steps = setStepStatus(createFinishSteps({ hasUncommitted: true }), "commit", "running");
    expect(finishFlowStatus(steps)).toBe("running");
    expect(nextPendingStep(steps)).toBeNull();
  });
});

describe("discardReviewHunk", () => {
  it("discards the hunk in the worktree via discard_hunk", async () => {
    invoke.mockResolvedValue(undefined);
    const parsed = parseReviewDiff(SAMPLE_DIFF)!;
    await discardReviewHunk("/tmp/app.worktrees/x", parsed, 0);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0] as [string, { path: string; patch: string }];
    expect(command).toBe("discard_hunk");
    expect(args.path).toBe("/tmp/app.worktrees/x");
    expect(args.patch).toContain("--- a/f.txt");
    expect(args.patch).toContain("+b");
    expect(args.patch).toContain("-B");
  });

  it("ignores an unknown hunk index", async () => {
    const parsed = parseReviewDiff(SAMPLE_DIFF)!;
    await discardReviewHunk("/tmp/wt", parsed, 42);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("discardReviewFile", () => {
  it("deletes untracked files", async () => {
    invoke.mockResolvedValue(undefined);
    await discardReviewFile("/tmp/wt", "abc123", file({ path: "new.txt", untracked: true }));
    expect(invoke).toHaveBeenCalledWith("git_discard_files", {
      path: "/tmp/wt",
      files: ["new.txt"],
      untracked: [true],
    });
  });

  it("restores tracked files to the merge base", async () => {
    invoke.mockResolvedValue(undefined);
    await discardReviewFile("/tmp/wt", "abc123", file());
    expect(invoke).toHaveBeenCalledWith("git_restore_files_at_commit", {
      path: "/tmp/wt",
      commit: "abc123",
      files: ["f.txt"],
    });
  });

  it("falls back to deletion for files that did not exist at the merge base", async () => {
    invoke
      .mockRejectedValueOnce(new Error("pathspec 'f.txt' did not match any file"))
      .mockResolvedValueOnce(undefined);
    await discardReviewFile("/tmp/wt", "abc123", file());
    expect(invoke).toHaveBeenNthCalledWith(2, "git_discard_files", {
      path: "/tmp/wt",
      files: ["f.txt"],
      untracked: [true],
    });
  });

  it("rethrows unrelated errors", async () => {
    invoke.mockRejectedValueOnce(new Error("disk on fire"));
    await expect(discardReviewFile("/tmp/wt", "abc123", file())).rejects.toThrow("disk on fire");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("deleteSessionBranchIfMerged", () => {
  it("keeps unmerged branches", async () => {
    invoke.mockResolvedValueOnce(false);
    expect(await deleteSessionBranchIfMerged("/tmp/app", "agents/x")).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("deletes merged branches without force", async () => {
    invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(undefined);
    expect(await deleteSessionBranchIfMerged("/tmp/app", "agents/x")).toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(2, "delete_branch", {
      path: "/tmp/app",
      name: "agents/x",
      force: false,
    });
  });
});
