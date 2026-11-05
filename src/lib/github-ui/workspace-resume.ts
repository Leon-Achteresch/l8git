import type { AgentEvidence } from "@/lib/change-workflow/model";
import type { GithubComment, GithubIssue } from "@/lib/github-expansion/api";
import { branchContextKey, type BranchContext, type ReviewSnapshot, type SubjectState } from "@/lib/github-expansion/store";
import { issueContext } from "@/lib/github-expansion/workspace";

export type LinkedWorkspace = NonNullable<SubjectState["workspace"]>;

/** Base commit for a new issue worktree must be a full SHA (the backend refuses shorthands). */
export const isFullSha = (s: string) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(s.trim());

/** Agent/terminal context the user previews and edits before anything is sent: canonical issue text + the comments they ticked. */
export function draftIssueContext(issue: GithubIssue, comments: GithubComment[], selected: Set<number>): string {
  return issueContext(issue, comments.filter((c) => selected.has(c.id)));
}

export type ResumeState = {
  workspace: LinkedWorkspace;
  branchContext: BranchContext | null;
  evidence: { task: string; recordedAt: string; head: string; passed: number; failed: number; running: number; openIssues: string[]; checks: { command: string; outcome: string }[] } | null;
  review: { head: string; reviewedFiles: number; reviewedAt: number; headMoved: boolean } | null;
  tasksDone: number;
};

/**
 * 31: everything saved for a linked workspace — latest recorded agent evidence for that worktree, the branch's saved
 * panel/file, the PR review snapshot and local review-task marks. Only persisted state; nothing is re-run.
 */
export function resumeState(input: {
  workspace: LinkedWorkspace;
  evidence: Record<string, AgentEvidence>;
  branchContexts: Record<string, BranchContext>;
  review?: ReviewSnapshot;
  reviewTasksDone?: Record<string, number>;
  currentHead?: string | null;
}): ResumeState {
  const ws = input.workspace;
  const latest = Object.values(input.evidence).filter((e) => e.sessionId === ws.worktreePath).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  const count = (o: string) => latest?.checks.filter((c) => c.outcome === o).length ?? 0;
  return {
    workspace: ws,
    branchContext: input.branchContexts[branchContextKey(ws.worktreePath, ws.branch)] ?? input.branchContexts[branchContextKey(ws.repoPath, ws.branch)] ?? null,
    evidence: latest ? {
      task: latest.task, recordedAt: latest.recordedAt, head: latest.snapshot.headSha,
      passed: count("passed"), failed: count("failed"), running: count("running"),
      openIssues: latest.openIssues, checks: latest.checks.map((c) => ({ command: c.command, outcome: c.outcome })),
    } : null,
    review: input.review ? { head: input.review.head, reviewedFiles: Object.keys(input.review.files).length, reviewedAt: input.review.reviewedAt, headMoved: !!input.currentHead && input.currentHead !== input.review.head } : null,
    tasksDone: Object.keys(input.reviewTasksDone ?? {}).length,
  };
}

/** Prompt for resuming an agent: the saved task context plus pending checks/open issues, all marked as data. */
export function resumePrompt(state: ResumeState): string {
  const parts = [state.workspace.context, `\nWorktree: ${state.workspace.worktreePath} (branch ${state.workspace.branch}, created at ${state.workspace.head})`];
  if (state.evidence) {
    parts.push(`\nLast recorded evidence (${state.evidence.recordedAt}, head ${state.evidence.head}): ${state.evidence.passed} passed, ${state.evidence.failed} failed, ${state.evidence.running} unfinished.`);
    for (const c of state.evidence.checks) parts.push(`- ${c.outcome}: ${c.command}`);
    if (state.evidence.openIssues.length) parts.push(`Open issues:\n${state.evidence.openIssues.map((i) => `- ${i}`).join("\n")}`);
  }
  if (state.review) parts.push(`\nReview progress: ${state.review.reviewedFiles} files reviewed at ${state.review.head}${state.review.headMoved ? " (PR head has moved since)" : ""}; ${state.tasksDone} review threads marked done locally.`);
  return parts.join("\n");
}
