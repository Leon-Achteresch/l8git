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
  it("passes the displayed file and snapshot with a complete reverse hunk", async () => {
    invoke.mockResolvedValue(undefined);
    const parsed = parseReviewDiff(SAMPLE_DIFF)!;
    await discardReviewHunk("/tmp/wt", "base", "f.txt", parsed, 0, "review-v1:1");
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe("agent_review_discard_change");
    expect(args).toMatchObject({ worktreePath: "/tmp/wt", mergeBase: "base", file: "f.txt", expectedFingerprint: "review-v1:1" });
    expect(args.patch).toContain("+b");
    expect(args.patch).toContain("-B");
  });

  it("ignores an unknown hunk index", async () => {
    await discardReviewHunk("/tmp/wt", "base", "f.txt", parseReviewDiff(SAMPLE_DIFF)!, 42, "review-v1:1");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("discardReviewFile", () => {
  it.each([true, false])("uses the guarded backend for untracked=%s", async (untracked) => {
    invoke.mockResolvedValue(undefined);
    await discardReviewFile("/tmp/wt", "base", file({ untracked }), "review-v1:1");
    expect(invoke).toHaveBeenCalledWith("agent_review_discard_change", {
      worktreePath: "/tmp/wt", mergeBase: "base", file: "f.txt", expectedFingerprint: "review-v1:1", patch: null,
    });
  });

  it("refuses deletion without the displayed snapshot", async () => {
    await expect(discardReviewFile("/tmp/wt", "base", file(), "")).rejects.toThrow("__FILE_CHANGED__");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not retry a failed restore as deletion", async () => {
    invoke.mockRejectedValueOnce(new Error("pathspec did not match any file"));
    await expect(discardReviewFile("/tmp/wt", "base", file(), "review-v1:1")).rejects.toThrow("pathspec");
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
