import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTestPlatform } from "./platform-harness";
import { resetKvCache } from "@/lib/platform/kv";
import {
  AgentReviewFinishController, agentReviewPreflightProblem, createFinishSteps,
  loadAgentReviewSummary, pendingReviewDiff, retryStep, reviewFileSnapshotEqual, reviewSnapshotSignature,
  existingAgentReviewFinishController, getAgentReviewFinishController,
  agentReviewFinishStorageKey, releaseAgentReviewFinishController, restoreAgentReviewCheckpoint,
  agentReviewFinishContextIndexKey, agentReviewFinishStorageKeys, readAgentReviewFinishCheckpoint,
  hydrateAgentReviewFinishCheckpoint, hydrateAgentReviewFinishRecovery, readAgentReviewFinishRecoveryContext,
  type AgentReviewFinishContext, type AgentReviewPreflight, type AgentReviewSummary,
} from "../agent-review";
import type { StatusEntry, WorktreeEntry } from "@/lib/repo-store";

const context: AgentReviewFinishContext = { basePath: "/repo", worktreePath: "/repo.wt/task", baseBranch: "main", sessionBranch: "agents/task" };
const file = { path: "src/app.ts", additions: 4, deletions: 1, binary: false, untracked: false };
const entry: StatusEntry = { path: file.path, index_status: " ", worktree_status: "M", staged: false, unstaged: true, untracked: false, additions_staged: 0, deletions_staged: 0, additions_unstaged: 4, deletions_unstaged: 1, binary: false, embedded_repo: false };
const baseWorktree: WorktreeEntry = { path: context.basePath, branch: "main", head: "abc1230", is_main: true, is_locked: false, lock_reason: null, is_prunable: false, prunable_reason: null };
const sessionWorktree: WorktreeEntry = { ...baseWorktree, path: context.worktreePath, branch: context.sessionBranch, is_main: false, head: "def4560" };
const summary: AgentReviewSummary = { baseBranch: "main", sessionBranch: "agents/task", mergeBase: "abc1230", files: [file], additions: 4, deletions: 1, commits: 1, uncommitted: 0, fingerprint: "sha256-review-v1:original" };

function preflight(overrides: Partial<AgentReviewPreflight> = {}): AgentReviewPreflight {
  return { worktrees: [baseWorktree, sessionWorktree], summary, baseStatus: [], sessionStatus: [], baseOperation: false, sessionOperation: false, baseHead: "abc1230", sessionHead: "def4560", worktreeRemoved: false, ...overrides };
}

beforeEach(() => { installTestPlatform(); });

describe("agent review preflight", () => {
  it("checks the actual checked-out branches rather than trusting the dialog labels", () => {
    expect(agentReviewPreflightProblem(context, "merge", preflight({ worktrees: [{ ...baseWorktree, branch: "release" }, sessionWorktree] }), "reviewed")).toBe("wrongBaseBranch");
    expect(agentReviewPreflightProblem(context, "merge", preflight({ worktrees: [baseWorktree, { ...sessionWorktree, branch: null }] }), "reviewed")).toBe("wrongSessionBranch");
  });

  it("protects missing, main and locked worktrees", () => {
    expect(agentReviewPreflightProblem(context, "cleanup", preflight({ worktrees: [baseWorktree] }), null)).toBe("missingWorktree");
    expect(agentReviewPreflightProblem(context, "cleanup", preflight({ worktrees: [baseWorktree, { ...sessionWorktree, is_main: true }] }), null)).toBe("protectedWorktree");
    expect(agentReviewPreflightProblem(context, "cleanup", preflight({ worktrees: [baseWorktree, { ...sessionWorktree, is_locked: true }] }), null)).toBe("protectedWorktree");
  });

  it("requires clean repositories for merge and cleanup while allowing the commit step", () => {
    expect(agentReviewPreflightProblem(context, "merge", preflight({ baseStatus: [entry] }), "reviewed")).toBe("baseDirty");
    expect(agentReviewPreflightProblem(context, "cleanup", preflight({ sessionStatus: [entry] }), null)).toBe("sessionDirty");
    expect(agentReviewPreflightProblem(context, "commit", preflight({ sessionStatus: [entry] }), reviewSnapshotSignature(summary, "def4560"))).toBeNull();
  });

  it("stops on conflicts and existing merge/rebase/cherry-pick operations", () => {
    expect(agentReviewPreflightProblem(context, "commit", preflight({ sessionStatus: [{ ...entry, index_status: "U", worktree_status: "U" }] }), "reviewed")).toBe("conflicts");
    expect(agentReviewPreflightProblem(context, "cleanup", preflight({ baseOperation: true }), null)).toBe("operationInProgress");
  });

  it("requires review of the current session HEAD and authoritative statistics", () => {
    expect(agentReviewPreflightProblem(context, "merge", preflight(), null)).toBe("reviewRequired");
    const signature = reviewSnapshotSignature(summary, "def4560");
    expect(agentReviewPreflightProblem(context, "merge", preflight(), signature)).toBeNull();
    expect(agentReviewPreflightProblem(context, "merge", preflight({ sessionHead: "aaa1230" }), signature)).toBe("reviewChanged");
    expect(agentReviewPreflightProblem(context, "merge", preflight({ summary: { ...summary, additions: 5 } }), signature)).toBe("reviewChanged");
  });

  it.each(["commit", "merge"] as const)("invalidates %s confirmation when only the content token changes", (step) => {
    const signature = reviewSnapshotSignature(summary, "def4560");
    expect(agentReviewPreflightProblem(context, step, preflight({ summary: { ...summary, fingerprint: "sha256-review-v1:changed" } }), signature)).toBe("reviewChanged");
  });

  it.each([undefined, null, "", "   "])("rejects a missing content token even when a legacy signature matches (%s)", (fingerprint) => {
    const legacySummary = { ...summary, fingerprint };
    const signature = reviewSnapshotSignature(legacySummary, "def4560");
    expect(agentReviewPreflightProblem(context, "commit", preflight({ summary: legacySummary }), signature)).toBe("reviewRequired");
    expect(agentReviewPreflightProblem(context, "merge", preflight({ summary: legacySummary }), signature)).toBe("reviewRequired");
  });

  it("permits branch-delete recovery after successful removal", () => {
    expect(agentReviewPreflightProblem(context, "cleanup", preflight({ worktreeRemoved: true, worktrees: [baseWorktree] }), null)).toBeNull();
  });

  it("does not allow retry to reopen a completed or skipped mutation", () => {
    const steps = createFinishSteps({ hasUncommitted: false });
    expect(retryStep(steps, "commit")).toEqual(steps);
  });

  it("compares file contents independent of JSON property order", () => {
    const old = { diff: "-old\n+new", untrackedPlain: null, isBinary: false, fingerprint: "review-v1:1" };
    expect(reviewFileSnapshotEqual(old, { isBinary: false, untrackedPlain: null, diff: old.diff, fingerprint: old.fingerprint })).toBe(true);
    expect(reviewFileSnapshotEqual(old, { ...old, diff: "-old\n+changed" })).toBe(false);
  });
});

function repoHarness(dirty = false) {
  const { invoke, storage, ipc } = installTestPlatform();
  const repo = {
    baseBranch: "main", sessionBranch: "agents/task", baseHead: "abc1230", sessionHead: "def4560",
    sessionStatus: dirty ? [entry] : [] as StatusEntry[], baseStatus: [] as StatusEntry[],
    integrated: false, removed: false, deleted: false, commits: 1, deleteFailure: false, operation: false,
    mergeWait: null as Promise<void> | null,
    fingerprint: summary.fingerprint,
    reviewFiles: summary.files,
    omitFingerprintAfterCommit: false,
    summaryFailureAfterCommit: false,
    preflightWait: null as Promise<void> | null,
    mergeStarted: null as (() => void) | null,
    removeResponseLost: false,
    deleteResponseLost: false,
  };
  invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "agent_review_summary":
        if (repo.removed) throw new Error("Worktree no longer exists");
        if (repo.summaryFailureAfterCommit && repo.commits > 1) throw new Error("Review refresh offline");
        return { ...summary, baseBranch: repo.baseBranch, sessionBranch: repo.sessionBranch, files: repo.reviewFiles, uncommitted: repo.sessionStatus.length, commits: repo.commits, fingerprint: repo.fingerprint };
      case "list_worktrees": if (repo.preflightWait) await repo.preflightWait; return [{ ...baseWorktree, branch: repo.baseBranch }, ...repo.removed ? [] : [{ ...sessionWorktree, branch: repo.sessionBranch }]];
      case "repo_status": return args?.path === context.basePath ? repo.baseStatus : repo.sessionStatus;
      case "merge_state": case "rebase_status": case "cherry_pick_state": return { in_progress: repo.operation };
      case "repo_commit_inspect": return { header: `commit ${args?.path === context.basePath ? repo.baseHead : repo.sessionHead}\nAuthor: Agent <agent@example.com>\n\n    feat: update app\n`, files: [] };
      case "stage_files": return;
      case "commit_changes": repo.sessionStatus = []; repo.sessionHead = "aaa7890"; repo.commits += 1; if (repo.omitFingerprintAfterCommit) repo.fingerprint = undefined; return;
      case "agent_review_commit_checked": repo.sessionStatus = []; repo.sessionHead = "aaa7890"; repo.commits += 1; if (repo.omitFingerprintAfterCommit) repo.fingerprint = undefined; return repo.sessionHead;
      case "agent_review_branch_merged": return repo.integrated;
      case "git_merge": repo.mergeStarted?.(); if (repo.mergeWait) await repo.mergeWait; repo.integrated = true; repo.baseHead = repo.sessionHead; return "merged";
      case "git_worktree_remove_checked": repo.removed = true; if (repo.removeResponseLost) throw new Error("Remote response disconnected"); return;
      case "git_resolve_commit": return args?.rev === `refs/heads/${context.sessionBranch}` ? repo.sessionHead : repo.baseHead;
      case "open_repo": return { branch: repo.baseBranch, branches: repo.deleted ? [{ name: "main", is_remote: false }] : [{ name: "main", is_remote: false }, { name: "agents/task", is_remote: false }] };
      case "delete_branch": if (repo.deleteFailure) throw new Error("Branch is still checked out elsewhere"); repo.deleted = true; return;
      case "agent_review_delete_branch_checked":
        if (repo.baseBranch !== args?.expectedBaseBranch || repo.sessionHead !== args?.expectedHead) throw new Error("agentReviewFinish.errors.reviewChanged");
        if (repo.deleteFailure) throw new Error("Branch is still checked out elsewhere");
        repo.deleted = true;
        if (repo.deleteResponseLost) throw new Error("Delete response disconnected");
        return;
      case "repo_file_diff": return { staged: "staged patch", unstaged: "unstaged patch", untracked_plain: null, is_binary: false };
      default: throw new Error(`Unexpected command: ${command}`);
    }
  });
  return { invoke, storage, ipc, repo };
}

async function readyCleanController(harness: ReturnType<typeof repoHarness>, dependencies = {}) {
  const controller = new AgentReviewFinishController(context, false, dependencies);
  await controller.refresh();
  controller.markReviewed(true);
  expect(await controller.run("merge")).toBe(true);
  expect(harness.repo.integrated).toBe(true);
  return controller;
}

describe("agent review finish controller", () => {
  it("requests content snapshots for preflight and the fresh post-commit review", async () => {
    const harness = repoHarness(true);
    const controller = new AgentReviewFinishController(context, true);
    await controller.refresh();
    controller.setMessage("feat: finish app");
    controller.markReviewed(true);
    expect(await controller.run("commit")).toBe(true);
    expect(harness.invoke).toHaveBeenCalledWith("agent_review_commit_checked", {
      worktreePath: context.worktreePath, basePath: context.basePath, message: "feat: finish app",
      expectedBaseBranch: "main", expectedSessionBranch: "agents/task",
      expectedBaseHead: "abc1230", expectedSessionHead: "def4560", expectedFingerprint: summary.fingerprint,
    });
    expect(harness.invoke.mock.calls.some(([command]) => command === "stage_files" || command === "commit_changes")).toBe(false);
    const calls = harness.invoke.mock.calls.filter(([command]) => command === "agent_review_summary");
    expect(calls).toHaveLength(3);
    for (const [, args] of calls) expect(args).toEqual({ worktreePath: context.worktreePath, basePath: context.basePath, includeFingerprint: true });
  });

  it("leaves ordinary summary browsing cheap and rejects missing tokens only when requested", async () => {
    const harness = repoHarness();
    harness.repo.fingerprint = null;
    expect((await loadAgentReviewSummary(context.worktreePath, context.basePath)).fingerprint).toBeNull();
    expect(harness.invoke).toHaveBeenCalledWith("agent_review_summary", { worktreePath: context.worktreePath, basePath: context.basePath });
    await expect(loadAgentReviewSummary(context.worktreePath, context.basePath, true)).rejects.toThrow("agentReviewFinish.errors.reviewRequired");
  });

  it.each(["text", "binary"] as const)("blocks commit before staging when %s bytes change with identical statistics", async (kind) => {
    const harness = repoHarness(true);
    harness.repo.reviewFiles = [{ ...file, binary: kind === "binary" }];
    const controller = new AgentReviewFinishController(context, true);
    await controller.refresh(); controller.markReviewed(true); controller.setMessage("feat: finish app");
    harness.repo.fingerprint = "sha256-review-v1:changed-bytes";
    expect(await controller.run("commit")).toBe(false);
    expect(controller.getSnapshot().steps[0].error).toBe("agentReviewFinish.errors.reviewChanged");
    expect(controller.getSnapshot().reviewedSignature).toBeNull();
    expect(harness.invoke.mock.calls.some(([command]) => command === "stage_files" || command === "commit_changes" || command === "agent_review_commit_checked")).toBe(false);
  });

  it.each(["text", "binary"] as const)("blocks merge when %s bytes change without changing counts or HEAD", async (kind) => {
    const harness = repoHarness();
    harness.repo.reviewFiles = [{ ...file, binary: kind === "binary" }];
    const controller = new AgentReviewFinishController(context, false);
    await controller.refresh(); controller.markReviewed(true);
    harness.repo.fingerprint = "sha256-review-v1:changed-bytes";
    expect(await controller.run("merge")).toBe(false);
    expect(controller.getSnapshot().steps[1].error).toBe("agentReviewFinish.errors.reviewChanged");
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
  });

  it("keeps finish confirmation unavailable when the backend returns a legacy summary", async () => {
    const harness = repoHarness();
    harness.repo.fingerprint = undefined;
    const controller = new AgentReviewFinishController(context, false);
    await controller.refresh(); controller.markReviewed(true);
    expect(controller.getSnapshot()).toMatchObject({ validated: false, reviewedSignature: null, checkError: "agentReviewFinish.errors.reviewRequired" });
    expect(await controller.run("merge")).toBe(false);
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
  });

  it("clears the old review if the post-commit summary lacks its required content snapshot", async () => {
    const harness = repoHarness(true);
    harness.repo.omitFingerprintAfterCommit = true;
    const controller = new AgentReviewFinishController(context, true);
    await controller.refresh(); controller.markReviewed(true); controller.setMessage("feat: finish app");
    expect(await controller.run("commit")).toBe(true);
    controller.markReviewed(true);
    expect(controller.getSnapshot().reviewedSignature).toBeNull();
    expect(controller.getSnapshot().steps[0].status).toBe("done");
    expect(controller.getSnapshot()).toMatchObject({ validated: false, summary: null, sessionHead: "aaa7890", checkError: "agentReviewFinish.errors.reviewRequired" });
    expect(await controller.run("merge")).toBe(false);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_commit_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
  });

  it("commits, requires a fresh review, merges with captured hashes and cleans up in order", async () => {
    const harness = repoHarness(true);
    const metadataRemoved = vi.fn();
    const controller = new AgentReviewFinishController(context, true, { onWorktreeRemoved: metadataRemoved });
    await controller.refresh();
    controller.setMessage("feat: complete app");
    controller.markReviewed(true);
    expect(await controller.run("commit")).toBe(true);
    expect(controller.getSnapshot().reviewedSignature).toBeNull();
    controller.markReviewed(true);
    controller.setStrategy("no-ff");
    expect(await controller.run("merge")).toBe(true);
    expect(harness.invoke).toHaveBeenCalledWith("git_merge", { path: context.basePath, branch: context.sessionBranch, strategy: "no-ff", message: null, expectedBranch: "main", expectedHead: "abc1230", expectedSourceHead: "aaa7890" });
    expect(await controller.run("cleanup")).toBe(true);
    expect(harness.invoke).toHaveBeenCalledWith("agent_review_delete_branch_checked", {
      path: context.basePath, branch: context.sessionBranch, expectedHead: "aaa7890", expectedBaseBranch: "main",
    });
    expect(harness.invoke.mock.calls.some(([command]) => command === "delete_branch")).toBe(false);
    expect(harness.invoke).toHaveBeenCalledWith("git_worktree_remove_checked", { path: context.basePath, worktreePath: context.worktreePath, expectedBranch: context.sessionBranch, expectedHead: "aaa7890", mergedInto: "main" });
    expect(metadataRemoved).toHaveBeenCalledExactlyOnceWith(context.worktreePath);
    expect(controller.getSnapshot().steps.map((step) => step.status)).toEqual(["done", "done", "done"]);
  });

  it("deduplicates simultaneous step clicks and refuses out-of-order actions", async () => {
    const harness = repoHarness();
    let release!: () => void;
    harness.repo.mergeWait = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AgentReviewFinishController(context, false);
    await controller.refresh(); controller.markReviewed(true);
    expect(await controller.run("cleanup")).toBe(false);
    const first = controller.run("merge");
    expect(await controller.run("merge")).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_merge")).toHaveLength(1);
  });

  it("keeps the next step locked until a successful operation finishes refreshing repositories", async () => {
    const harness = repoHarness();
    let release!: () => void;
    let refreshStarted!: () => void;
    const heldRefresh = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { refreshStarted = resolve; });
    const controller = new AgentReviewFinishController(context, false, {
      onChanged: () => { refreshStarted(); return heldRefresh; },
    });
    await controller.refresh();
    controller.markReviewed(true);
    const merge = controller.run("merge");
    await started;
    expect(controller.getSnapshot().steps[1].status).toBe("done");
    expect(controller.getSnapshot().checking).toBe(true);
    expect(await controller.run("cleanup")).toBe(false);
    expect(harness.repo.removed).toBe(false);
    release();
    expect(await merge).toBe(true);
    expect(controller.getSnapshot().checking).toBe(false);
    expect(await controller.run("cleanup")).toBe(true);
    expect(harness.repo.removed).toBe(true);
  });

  it("rechecks branch and dirty state at execution time", async () => {
    const harness = repoHarness();
    const controller = new AgentReviewFinishController(context, false);
    await controller.refresh(); controller.markReviewed(true);
    harness.repo.baseBranch = "release";
    expect(await controller.run("merge")).toBe(false);
    expect(controller.getSnapshot().steps[1].error).toBe("agentReviewFinish.errors.wrongBaseBranch");
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
  });

  it("stops before commit staging when the subject is empty", async () => {
    const harness = repoHarness(true);
    const controller = new AgentReviewFinishController(context, true);
    await controller.refresh(); controller.markReviewed(true); controller.setMessage("\n\nBody only");
    expect(await controller.run("commit")).toBe(false);
    expect(harness.invoke.mock.calls.some(([command]) => command === "stage_files" || command === "agent_review_commit_checked")).toBe(false);
  });

  it("locks mutations when an agent starts running after review", async () => {
    const harness = repoHarness();
    let busy = false;
    const controller = new AgentReviewFinishController(context, false, { isBusy: () => busy });
    await controller.refresh(); controller.markReviewed(true); busy = true;
    expect(await controller.run("merge")).toBe(false);
    expect(controller.getSnapshot().steps[1].error).toBe("agentReviewFinish.errors.agentBusy");
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
  });

  it("keeps the worktree when its branch is no longer integrated", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.integrated = false;
    expect(await controller.run("cleanup")).toBe(false);
    expect(harness.repo.removed).toBe(false);
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_worktree_remove_checked")).toBe(false);
  });

  it("retries only branch deletion after removal already succeeded, including after recreation", async () => {
    const harness = repoHarness();
    const metadataRemoved = vi.fn();
    const controller = await readyCleanController(harness, { onWorktreeRemoved: metadataRemoved });
    harness.repo.deleteFailure = true;
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot().worktreeRemoved).toBe(true);
    expect(controller.getSnapshot().branchDeleted).toBe(false);
    const reopened = new AgentReviewFinishController(context, false, { onWorktreeRemoved: metadataRemoved });
    await reopened.refresh(); harness.repo.deleteFailure = false;
    expect(await reopened.run("cleanup", true)).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
    expect(metadataRemoved).toHaveBeenCalledTimes(1);
  });

  it("recognizes a branch that was deleted externally before cleanup retry", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.deleteFailure = true;
    expect(await controller.run("cleanup")).toBe(false);
    harness.repo.deleted = true;
    expect(await controller.run("cleanup", true)).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_delete_branch_checked")).toHaveLength(1);
  });

  it("never marks a completed Git operation failed because the UI refresh failed", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness, { onChanged: async () => { throw new Error("Refresh temporarily unavailable"); } });
    expect(controller.getSnapshot().steps[1].status).toBe("done");
    expect(controller.getSnapshot().checkError).toBe("Refresh temporarily unavailable");
    expect(await controller.run("merge", true)).toBe(false);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_merge")).toHaveLength(1);
  });

  it("recovers interrupted persisted operations as retryable failures, not stuck spinners", async () => {
    const harness = repoHarness();
    const key = `l8git-agent-review-finish.${encodeURIComponent(JSON.stringify(context))}`;
    harness.storage.set(key, JSON.stringify({ steps: [
      { id: "commit", status: "skipped", error: null }, { id: "merge", status: "running", error: null }, { id: "cleanup", status: "pending", error: null },
    ] }));
    const controller = new AgentReviewFinishController(context, false);
    expect(controller.getSnapshot().steps[1]).toEqual({ id: "merge", status: "failed", error: "agentReviewFinish.errors.interrupted" });
    await controller.refresh(); controller.markReviewed(true);
    expect(await controller.run("merge", true)).toBe(true);
  });

  it("skips an obsolete pending commit after an external Git commit makes the session clean", async () => {
    const harness = repoHarness(true);
    const controller = new AgentReviewFinishController(context, true);
    await controller.refresh();
    harness.repo.sessionStatus = [];
    harness.repo.sessionHead = "123abcd";
    await controller.refresh();
    expect(controller.getSnapshot().steps[0].status).toBe("skipped");
    expect(controller.getSnapshot().sessionHead).toBe("123abcd");
    controller.markReviewed(true);
    expect(await controller.run("merge")).toBe(true);
    expect(harness.invoke.mock.calls.some(([command]) => command === "commit_changes" || command === "agent_review_commit_checked")).toBe(false);
  });

  it("discovers persisted cleanup recovery before a removed worktree can load its summary", async () => {
    const harness = repoHarness();
    const recoveryContext = { ...context, worktreePath: "/repo.wt/restarted-cleanup" };
    const previous = new AgentReviewFinishController(recoveryContext, false);
    previous.setMessage("Persisted recovery");
    const key = agentReviewFinishStorageKey(recoveryContext);
    harness.storage.set(key, JSON.stringify({ ...previous.getSnapshot(), worktreeRemoved: true, sessionHead: "def4560", steps: [
      { id: "commit", status: "skipped", error: null }, { id: "merge", status: "done", error: null }, { id: "cleanup", status: "failed", error: "Branch still checked out" },
    ] }));
    resetKvCache();
    const recovered = existingAgentReviewFinishController(recoveryContext.worktreePath, recoveryContext.basePath);
    expect(recovered?.getSnapshot().worktreeRemoved).toBe(true);
    expect(recovered?.getSnapshot().message).toBe("Persisted recovery");
    const busy = vi.fn(() => true);
    expect(getAgentReviewFinishController(recoveryContext, false, { isBusy: busy })).toBe(recovered);
    expect(await recovered?.run("cleanup", true)).toBe(false);
    expect(busy).toHaveBeenCalled();
    expect(harness.invoke.mock.calls.some(([command]) => command === "delete_branch")).toBe(false);
    expect(existingAgentReviewFinishController("/unknown", "/repo")).toBeNull();
  });

  it("creates a fresh finish flow when a completed named worktree is recreated", async () => {
    const harness = repoHarness();
    const firstContext = { ...context, worktreeCreatedAt: 10001 };
    const first = getAgentReviewFinishController(firstContext, false);
    await first.refresh(); first.setMessage("Old session draft"); first.markReviewed(true);
    expect(await first.run("merge")).toBe(true);
    expect(await first.run("cleanup")).toBe(true);
    releaseAgentReviewFinishController(first);
    harness.repo.removed = false; harness.repo.deleted = false; harness.repo.integrated = false;
    harness.repo.sessionHead = "789abcd";
    const secondContext = { ...context, worktreeCreatedAt: 10002 };
    const second = getAgentReviewFinishController(secondContext, false);
    expect(second).not.toBe(first);
    expect(second.getSnapshot()).toMatchObject({ worktreeRemoved: false, branchDeleted: false, message: "", validated: false });
    expect(second.getSnapshot().steps.map((step) => step.status)).toEqual(["skipped", "pending", "pending"]);
    expect(existingAgentReviewFinishController(context.worktreePath, context.basePath, secondContext.worktreeCreatedAt)).toBe(second);
    await second.refresh(); second.markReviewed(true);
    expect(await second.run("merge")).toBe(true);
  });

  it("restores an unfinished identified cleanup after its metadata is removed", async () => {
    const harness = repoHarness();
    const identified = { ...context, worktreeCreatedAt: 11001 };
    const controller = getAgentReviewFinishController(identified, false);
    await controller.refresh(); controller.markReviewed(true);
    expect(await controller.run("merge")).toBe(true);
    harness.repo.deleteFailure = true;
    expect(await controller.run("cleanup")).toBe(false);
    expect(existingAgentReviewFinishController(context.worktreePath, context.basePath)).toBe(controller);
    expect(controller.context.worktreeCreatedAt).toBe(11001);
    harness.repo.deleteFailure = false;
    const reopened = new AgentReviewFinishController(identified, false);
    expect(reopened.getSnapshot().validated).toBe(false);
    await reopened.refresh();
    expect(await reopened.run("cleanup", true)).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
  });

  it("does not trust completed persisted flags before validating an external recreated worktree", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    expect(await controller.run("cleanup")).toBe(true);
    harness.repo.removed = false; harness.repo.deleted = false; harness.repo.integrated = false;
    harness.repo.sessionHead = "abc7890";
    const reopened = new AgentReviewFinishController(context, false);
    expect(reopened.getSnapshot().validated).toBe(false);
    await reopened.refresh();
    expect(reopened.getSnapshot()).toMatchObject({ worktreeRemoved: false, branchDeleted: false, sessionHead: "abc7890", validated: true, reviewedSignature: null });
    expect(reopened.getSnapshot().steps.map((step) => step.status)).toEqual(["skipped", "pending", "pending"]);
    expect(harness.invoke.mock.calls.filter(([command, args]) => command === "agent_review_summary" && args?.worktreePath === context.worktreePath).length).toBeGreaterThan(1);
  });

  it("reopens merge after the clean source advances instead of leaving cleanup permanently blocked", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.sessionHead = "abcdef0"; harness.repo.integrated = false;
    await controller.refresh();
    expect(controller.getSnapshot().steps.map((step) => step.status)).toEqual(["skipped", "pending", "pending"]);
    expect(controller.getSnapshot().reviewedSignature).toBeNull();
    controller.markReviewed(true);
    expect(await controller.run("merge")).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_merge")).toHaveLength(2);
  });

  it("stops cleanup if a worktree reappears between opening the modal and retrying deletion", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.deleteFailure = true;
    expect(await controller.run("cleanup")).toBe(false);
    harness.repo.removed = false; harness.repo.integrated = false; harness.repo.sessionHead = "badcafe";
    expect(await controller.run("cleanup", true)).toBe(false);
    expect(controller.getSnapshot().steps.map((step) => step.status)).toEqual(["skipped", "pending", "pending"]);
    expect(controller.getSnapshot().checkError).toBe("agentReviewFinish.errors.reviewChanged");
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_delete_branch_checked")).toHaveLength(1);
  });

  it("checks a captured app generation immediately before any Git mutation", async () => {
    const harness = repoHarness();
    let current = true;
    const controller = new AgentReviewFinishController(context, false, { isCurrent: () => current });
    await controller.refresh(); controller.markReviewed(true); current = false;
    expect(await controller.run("merge")).toBe(false);
    expect(controller.getSnapshot().steps[1].error).toBe("agentReviewFinish.errors.reviewChanged");
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
  });

  it("ignores malformed and impossible checkpoint shortcuts while sanitizing valid preferences", () => {
    const initial = new AgentReviewFinishController({ ...context, worktreePath: "/new-untouched" }, false).getSnapshot();
    expect(restoreAgentReviewCheckpoint({ steps: [
      { id: "commit", status: "skipped" }, { id: "merge", status: "done" }, { id: "cleanup", status: "done" },
    ], branchDeleted: true, worktreeRemoved: false }, initial)).toBe(initial);
    expect(restoreAgentReviewCheckpoint({ ...initial, steps: initial.steps.map((step) => ({ ...step, status: "unknown" })) }, initial)).toBe(initial);
    expect(restoreAgentReviewCheckpoint({ ...initial, validated: true, checking: true, strategy: "squash", message: 42 }, initial)).toMatchObject({ validated: false, checking: false, strategy: "ff", message: "" });
    expect(restoreAgentReviewCheckpoint({ ...initial, summary: { ...summary, fingerprint: 42 } }, initial).summary).toBeNull();
    expect(restoreAgentReviewCheckpoint({ ...initial, summary: { ...summary, fingerprint: null } }, initial).summary?.fingerprint).toBeNull();
    expect(restoreAgentReviewCheckpoint({ ...initial, summary: { ...summary, fingerprint: "" } }, initial).summary?.fingerprint).toBe("");
  });

  it("bounds idle controller memory while retaining active subscriptions and persisted retry drafts", () => {
    repoHarness();
    const firstContext = { ...context, worktreePath: "/memory-cache/old" };
    const first = getAgentReviewFinishController(firstContext, false); first.setMessage("Recoverable draft");
    const activeContext = { ...context, worktreePath: "/memory-cache/active" };
    const active = getAgentReviewFinishController(activeContext, false);
    const unsubscribe = active.subscribe(() => {});
    for (let i = 0; i < 75; i++) getAgentReviewFinishController({ ...context, worktreePath: `/memory-cache/${i}` }, false);
    expect(getAgentReviewFinishController(activeContext, false)).toBe(active);
    const restored = getAgentReviewFinishController(firstContext, false);
    expect(restored).not.toBe(first);
    expect(restored.getSnapshot().message).toBe("Recoverable draft");
    unsubscribe();
  });
});

describe("host-scoped finish transport and recovery", () => {
  it("requires an explicit transport for a remote host", () => {
    expect(() => new AgentReviewFinishController({ ...context, hostId: "remote" }, false)).toThrow("explicit transport");
  });

  it("keeps the default desktop transport when the registered platform changes", async () => {
    const original = repoHarness();
    const controller = new AgentReviewFinishController(context, false);
    const replacement = repoHarness();
    await controller.refresh(); controller.markReviewed(true);
    expect(await controller.run("merge")).toBe(true);
    expect(original.repo.integrated).toBe(true);
    expect(replacement.invoke).not.toHaveBeenCalled();
  });

  it("keeps identical worktree paths isolated by host in registry, storage and recovery", () => {
    const harness = repoHarness();
    const aContext = { ...context, hostId: "key-host-a", worktreeCreatedAt: 13001 };
    const bContext = { ...aContext, hostId: "key-host-b" };
    const a = getAgentReviewFinishController(aContext, false, { invoke: harness.ipc.invoke });
    const b = getAgentReviewFinishController(bContext, false, { invoke: harness.ipc.invoke });
    expect(a).not.toBe(b);
    a.setMessage("Host A draft"); b.setMessage("Host B draft");
    expect(agentReviewFinishStorageKey(aContext)).not.toBe(agentReviewFinishStorageKey(bContext));
    expect(agentReviewFinishContextIndexKey(context.worktreePath, context.basePath, aContext.hostId)).not.toBe(agentReviewFinishContextIndexKey(context.worktreePath, context.basePath, bContext.hostId));
    expect(existingAgentReviewFinishController(context.worktreePath, context.basePath, 13001, aContext.hostId, { invoke: harness.ipc.invoke })).toBe(a);
    expect(existingAgentReviewFinishController(context.worktreePath, context.basePath, 13001, bContext.hostId, { invoke: harness.ipc.invoke })).toBe(b);
    expect(readAgentReviewFinishCheckpoint(aContext)?.message).toBe("Host A draft");
    expect(readAgentReviewFinishCheckpoint(bContext)?.message).toBe("Host B draft");
    expect(readAgentReviewFinishRecoveryContext(context.worktreePath, context.basePath)).toBeNull();
  });

  it("cannot redirect an in-flight operation or its callbacks when dependencies change", async () => {
    const a = repoHarness();
    const oldChanged = vi.fn();
    const hostContext = { ...context, hostId: "fixed-transport-host" };
    const controller = new AgentReviewFinishController(hostContext, false, { invoke: a.ipc.invoke, onChanged: oldChanged });
    await controller.refresh(); controller.markReviewed(true);
    let release!: () => void;
    let started!: () => void;
    a.repo.mergeWait = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { started = resolve; });
    a.repo.mergeStarted = started;
    const operation = controller.run("merge");
    await waiting;
    const b = repoHarness();
    const newChanged = vi.fn();
    controller.configureDependencies({ invoke: b.ipc.invoke, onChanged: newChanged });
    expect(await controller.run("merge")).toBe(false);
    release();
    expect(await operation).toBe(true);
    expect(a.repo.integrated).toBe(true);
    expect(b.invoke).not.toHaveBeenCalled();
    expect(oldChanged).toHaveBeenCalledExactlyOnceWith(context.basePath);
    expect(newChanged).not.toHaveBeenCalled();
    // A later operation still uses the instance's original host transport.
    expect(await controller.run("cleanup")).toBe(true);
    expect(a.repo.removed).toBe(true);
    expect(a.repo.deleted).toBe(true);
    expect(b.invoke).not.toHaveBeenCalled();
  });

  it("copies the context so caller mutations cannot change the target", async () => {
    const harness = repoHarness();
    const mutable = { ...context, hostId: "immutable-context-host" };
    const controller = new AgentReviewFinishController(mutable, false, { invoke: harness.ipc.invoke });
    mutable.basePath = "/other"; mutable.worktreePath = "/other.wt"; mutable.hostId = "other-host";
    await controller.refresh(); controller.markReviewed(true);
    expect(Object.isFrozen(controller.context)).toBe(true);
    expect(await controller.run("merge")).toBe(true);
    expect(harness.invoke).toHaveBeenCalledWith("git_merge", expect.objectContaining({ path: context.basePath, branch: context.sessionBranch }));
    expect(controller.context.hostId).toBe("immutable-context-host");
  });

  it("preserves desktop key strings and excludes desktop legacy keys from host scope", () => {
    const key = `l8git-agent-review-finish.v2.${encodeURIComponent(JSON.stringify([context.basePath, context.worktreePath, context.baseBranch, context.sessionBranch, null]))}`;
    expect(agentReviewFinishStorageKey(context)).toBe(key);
    expect(agentReviewFinishContextIndexKey(context.worktreePath, context.basePath)).toBe(`l8git-agent-review-finish.index.${encodeURIComponent(`${context.basePath}\0${context.worktreePath}`)}`);
    expect(agentReviewFinishStorageKeys(context)).toHaveLength(3);
    expect(agentReviewFinishStorageKeys({ ...context, hostId: "remote" })).toHaveLength(2);
  });

  it("hydrates dynamic recovery and checkpoint keys before synchronous restoration", async () => {
    const harness = repoHarness();
    const hostContext = { ...context, hostId: "hydrated-host", worktreeCreatedAt: 14001 };
    const previous = new AgentReviewFinishController(hostContext, false, { invoke: harness.ipc.invoke });
    previous.setMessage("Durable remote draft");
    const stored = new Map(harness.storage);
    harness.ipc.storage.getItem = async key => stored.get(key) ?? null;
    resetKvCache();
    expect(await hydrateAgentReviewFinishRecovery(context.worktreePath, context.basePath, hostContext.hostId)).toEqual(hostContext);
    await hydrateAgentReviewFinishCheckpoint(hostContext);
    expect(readAgentReviewFinishCheckpoint(hostContext)?.message).toBe("Durable remote draft");
    const resumed = new AgentReviewFinishController(hostContext, false, { invoke: harness.ipc.invoke });
    expect(resumed.getSnapshot().message).toBe("Durable remote draft");
    expect(resumed.getSnapshot().validated).toBe(false);
    expect(await hydrateAgentReviewFinishRecovery(context.worktreePath, context.basePath, "different-host")).toBeNull();
  });

  it("rejects a stored recovery context that names another host", () => {
    const harness = repoHarness();
    harness.storage.set(agentReviewFinishContextIndexKey(context.worktreePath, context.basePath, "expected-host"), JSON.stringify({ ...context, hostId: "wrong-host" }));
    resetKvCache();
    expect(readAgentReviewFinishRecoveryContext(context.worktreePath, context.basePath, "expected-host")).toBeNull();
  });

  it("rechecks route scope when preflight finishes and leaves the captured host untouched", async () => {
    const harness = repoHarness();
    let current = true;
    const controller = new AgentReviewFinishController({ ...context, hostId: "scope-host" }, false, { invoke: harness.ipc.invoke, isCurrent: () => current });
    await controller.refresh(); controller.markReviewed(true);
    let release!: () => void;
    harness.repo.preflightWait = new Promise<void>(resolve => { release = resolve; });
    const operation = controller.run("merge");
    current = false;
    release();
    expect(await operation).toBe(false);
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_merge")).toBe(false);
    expect(controller.getSnapshot().steps[1].error).toBe("agentReviewFinish.errors.reviewChanged");
  });
});

describe("durable finish milestones", () => {
  it("keeps a recreated merged branch after an acknowledged removal when its HEAD differs", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.deleteFailure = true;
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot().worktreeRemoved).toBe(true);
    harness.repo.deleteFailure = false;
    harness.repo.sessionHead = "badcafe";
    harness.repo.baseHead = "badcafe";
    harness.repo.integrated = true;
    const resumed = new AgentReviewFinishController(context, false);
    await resumed.refresh();
    expect(await resumed.run("cleanup", true)).toBe(false);
    expect(harness.repo.deleted).toBe(false);
    expect(resumed.getSnapshot().steps[2].error).toBe("agentReviewFinish.errors.reviewChanged");
    expect(harness.invoke).toHaveBeenLastCalledWith("agent_review_delete_branch_checked", {
      path: context.basePath, branch: context.sessionBranch, expectedHead: "def4560", expectedBaseBranch: "main",
    });
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.some(([command]) => command === "delete_branch")).toBe(false);
  });

  it("guards a branch that changes during asynchronous cleanup persistence", async () => {
    const harness = repoHarness();
    const flush = vi.fn(async () => { harness.repo.sessionHead = "badcafe"; harness.repo.baseHead = "badcafe"; });
    const controller = await readyCleanController(harness, { flushCheckpoint: flush });
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot().worktreeRemoved).toBe(true);
    expect(harness.repo.deleted).toBe(false);
    expect(controller.getSnapshot().steps[2].error).toBe("agentReviewFinish.errors.reviewChanged");
  });

  it("recovers a completed deletion after its remote response was lost", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.deleteResponseLost = true;
    expect(await controller.run("cleanup")).toBe(false);
    expect(harness.repo.deleted).toBe(true);
    const resumed = new AgentReviewFinishController(context, false);
    await resumed.refresh();
    expect(await resumed.run("cleanup", true)).toBe(true);
    expect(resumed.getSnapshot().branchDeleted).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_delete_branch_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
  });

  it("recovers a removal whose response was lost without removing the worktree again", async () => {
    const harness = repoHarness();
    const metadata = vi.fn();
    const controller = await readyCleanController(harness, { onWorktreeRemoved: metadata });
    harness.repo.removeResponseLost = true;
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot().worktreeRemoved).toBe(false);
    expect(harness.repo.removed).toBe(true);
    expect(harness.repo.deleted).toBe(false);
    resetKvCache();
    await hydrateAgentReviewFinishCheckpoint(context);
    const resumed = new AgentReviewFinishController(context, false, { onWorktreeRemoved: metadata });
    await resumed.refresh();
    expect(resumed.getSnapshot().worktreeRemoved).toBe(true);
    expect(harness.invoke).toHaveBeenCalledWith("agent_review_branch_merged", { path: context.basePath, branch: "def4560" });
    expect(harness.invoke).toHaveBeenCalledWith("git_resolve_commit", { path: context.basePath, rev: "refs/heads/agents/task" });
    expect(await resumed.run("cleanup", true)).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_delete_branch_checked")).toHaveLength(1);
    expect(metadata).toHaveBeenCalledTimes(1);
  });

  it("preserves a changed branch when recovering an unacknowledged removal", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.removeResponseLost = true;
    expect(await controller.run("cleanup")).toBe(false);
    harness.repo.sessionHead = "badcafe";
    const resumed = new AgentReviewFinishController(context, false);
    await resumed.refresh();
    expect(resumed.getSnapshot().checkError).toBe("agentReviewFinish.errors.reviewChanged");
    expect(await resumed.run("cleanup", true)).toBe(false);
    expect(harness.repo.deleted).toBe(false);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
  });

  it("can finish lost-response recovery when the branch is already absent but its saved HEAD remains integrated", async () => {
    const harness = repoHarness();
    const controller = await readyCleanController(harness);
    harness.repo.removeResponseLost = true;
    expect(await controller.run("cleanup")).toBe(false);
    harness.repo.deleted = true;
    const resumed = new AgentReviewFinishController(context, false);
    await resumed.refresh();
    expect(await resumed.run("cleanup", true)).toBe(true);
    expect(resumed.getSnapshot().branchDeleted).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.some(([command]) => command === "delete_branch")).toBe(false);
  });

  it("does not infer removal when merge has no durable successful milestone", async () => {
    const harness = repoHarness();
    const controller = new AgentReviewFinishController(context, false);
    await controller.refresh();
    harness.repo.removed = true; harness.repo.integrated = true;
    await controller.refresh();
    expect(controller.getSnapshot().worktreeRemoved).toBe(false);
    expect(controller.getSnapshot().validated).toBe(false);
    expect(await controller.run("cleanup")).toBe(false);
    expect(harness.invoke.mock.calls.some(([command]) => command === "git_resolve_commit" || command === "agent_review_delete_branch_checked")).toBe(false);
  });

  it("awaits the removal checkpoint and asynchronous metadata cleanup before branch deletion", async () => {
    const harness = repoHarness();
    let release!: () => void;
    let saved!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { saved = resolve; });
    const flush = vi.fn(async () => { if (flush.mock.calls.length === 1) { saved(); await held; } });
    const metadata = vi.fn(async () => { expect(harness.repo.deleted).toBe(false); });
    const controller = await readyCleanController(harness, { flushCheckpoint: flush, onWorktreeRemoved: metadata });
    const operation = controller.run("cleanup");
    await reached;
    expect(controller.getSnapshot().worktreeRemoved).toBe(true);
    expect(controller.getSnapshot().worktreeMetadataRemoved).toBe(false);
    expect(harness.repo.deleted).toBe(false);
    expect(metadata).not.toHaveBeenCalled();
    expect(await controller.run("cleanup")).toBe(false);
    release();
    expect(await operation).toBe(true);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(metadata).toHaveBeenCalledExactlyOnceWith(context.worktreePath);
    expect(controller.getSnapshot().worktreeMetadataRemoved).toBe(true);
  });

  it("preserves the surviving branch after checkpoint failure and retries without removing twice", async () => {
    const harness = repoHarness();
    const flush = vi.fn().mockRejectedValueOnce(new Error("Checkpoint storage unavailable")).mockResolvedValue(undefined);
    const metadata = vi.fn();
    const controller = await readyCleanController(harness, { flushCheckpoint: flush, onWorktreeRemoved: metadata });
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot().worktreeRemoved).toBe(true);
    expect(harness.repo.deleted).toBe(false);
    expect(metadata).not.toHaveBeenCalled();
    expect(await controller.run("cleanup", true)).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_delete_branch_checked")).toHaveLength(1);
    expect(metadata).toHaveBeenCalledTimes(1);
  });

  it("recovers failed asynchronous metadata cleanup from a hydrated removal checkpoint", async () => {
    const harness = repoHarness();
    const metadata = vi.fn().mockRejectedValueOnce(new Error("Metadata write failed")).mockResolvedValue(undefined);
    const controller = await readyCleanController(harness, { onWorktreeRemoved: metadata });
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ worktreeRemoved: true, worktreeMetadataRemoved: false });
    expect(harness.repo.deleted).toBe(false);
    const resumed = new AgentReviewFinishController(context, false, { onWorktreeRemoved: metadata });
    await resumed.refresh();
    expect(await resumed.run("cleanup", true)).toBe(true);
    expect(metadata).toHaveBeenCalledTimes(2);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "git_worktree_remove_checked")).toHaveLength(1);
  });

  it("stops further cleanup mutations when route scope changes during checkpoint persistence", async () => {
    const harness = repoHarness();
    let current = true;
    const flush = vi.fn(async () => { current = false; });
    const metadata = vi.fn();
    const controller = await readyCleanController(harness, { isCurrent: () => current, flushCheckpoint: flush, onWorktreeRemoved: metadata });
    expect(await controller.run("cleanup")).toBe(false);
    expect(controller.getSnapshot().worktreeRemoved).toBe(true);
    expect(metadata).not.toHaveBeenCalled();
    expect(harness.repo.deleted).toBe(false);
  });

  it("persists a completed commit and blocks merge until a failed review refresh recovers", async () => {
    const harness = repoHarness(true);
    harness.repo.summaryFailureAfterCommit = true;
    const flush = vi.fn(async () => { expect(readAgentReviewFinishCheckpoint(context)?.steps[0].status).toBe("done"); });
    const controller = new AgentReviewFinishController(context, true, { flushCheckpoint: flush });
    await controller.refresh(); controller.markReviewed(true); controller.setMessage("feat: finish app");
    expect(await controller.run("commit")).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ sessionHead: "aaa7890", summary: null, reviewedSignature: null, validated: false, checkError: "Review refresh offline" });
    expect(controller.getSnapshot().steps[0].status).toBe("done");
    expect(await controller.run("commit", true)).toBe(false);
    expect(await controller.run("merge")).toBe(false);
    const resumed = new AgentReviewFinishController(context, true);
    expect(resumed.getSnapshot().steps[0].status).toBe("done");
    harness.repo.summaryFailureAfterCommit = false;
    await resumed.refresh(); resumed.markReviewed(true);
    expect(await resumed.run("merge")).toBe(true);
    expect(harness.invoke.mock.calls.filter(([command]) => command === "agent_review_commit_checked")).toHaveLength(1);
  });
});

describe("AI pending review input", () => {
  it("reads staged and unstaged content without modifying the index", async () => {
    const harness = repoHarness(true);
    const diff = await pendingReviewDiff(context.worktreePath);
    expect(diff).toContain("staged patch"); expect(diff).toContain("unstaged patch");
    expect(harness.invoke.mock.calls.some(([command]) => command === "stage_files")).toBe(false);
  });

  it("stops collecting before a canceled generation can make further reads", async () => {
    const harness = repoHarness(true);
    const abort = new AbortController(); abort.abort();
    await expect(pendingReviewDiff(context.worktreePath, abort.signal)).rejects.toThrow();
    expect(harness.invoke.mock.calls.some(([command]) => command === "repo_file_diff")).toBe(false);
  });
});
