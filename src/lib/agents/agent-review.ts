import { invoke } from "@tauri-apps/api/core";

import {
  buildPatchesForDiscard,
  parseDiffWithHunks,
  type ParsedDiff,
  type ParsedHunk,
} from "@/lib/unified-diff";

export interface AgentReviewFile {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
  untracked: boolean;
}

export interface AgentReviewSummary {
  baseBranch: string;
  sessionBranch: string;
  mergeBase: string;
  files: AgentReviewFile[];
  additions: number;
  deletions: number;
  commits: number;
  uncommitted: number;
}

export interface AgentReviewFileDiff {
  diff: string | null;
  untrackedPlain: string | null;
  isBinary: boolean;
}

export const AGENT_BRANCH_PREFIX = "agents/";

export function isAgentSessionBranch(branch: string | null | undefined): boolean {
  return typeof branch === "string" && branch.startsWith(AGENT_BRANCH_PREFIX);
}

export function reviewTotals(files: readonly AgentReviewFile[]): {
  files: number;
  additions: number;
  deletions: number;
} {
  return files.reduce(
    (totals, file) => ({
      files: totals.files + 1,
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

export function hunkSelectionKeys(hunk: ParsedHunk, hunkIdx: number): Set<string> {
  const keys = new Set<string>();
  hunk.lines.forEach((line, lineIdx) => {
    if (line.kind === "add" || line.kind === "del") keys.add(`${hunkIdx}:${lineIdx}`);
  });
  return keys;
}

export function hunkDiffText(hunk: ParsedHunk): string {
  return [hunk.header, ...hunk.lines.map((line) => line.raw)].join("\n");
}

export function hunkCounts(hunk: ParsedHunk): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of hunk.lines) {
    if (line.kind === "add") additions += 1;
    else if (line.kind === "del") deletions += 1;
  }
  return { additions, deletions };
}

export type AgentReviewStepId = "commit" | "merge" | "cleanup";

export type AgentReviewStepStatus =
  | "pending"
  | "running"
  | "done"
  | "skipped"
  | "failed";

export interface AgentReviewStep {
  id: AgentReviewStepId;
  status: AgentReviewStepStatus;
  error: string | null;
}

export const AGENT_REVIEW_STEP_ORDER: AgentReviewStepId[] = ["commit", "merge", "cleanup"];

export function createFinishSteps(options: { hasUncommitted: boolean }): AgentReviewStep[] {
  return AGENT_REVIEW_STEP_ORDER.map((id) => ({
    id,
    status: id === "commit" && !options.hasUncommitted ? "skipped" : "pending",
    error: null,
  }));
}

export function setStepStatus(
  steps: readonly AgentReviewStep[],
  id: AgentReviewStepId,
  status: AgentReviewStepStatus,
  error: string | null = null,
): AgentReviewStep[] {
  return steps.map((step) => (step.id === id ? { ...step, status, error } : step));
}

export function nextPendingStep(steps: readonly AgentReviewStep[]): AgentReviewStepId | null {
  for (const step of steps) {
    if (step.status === "failed" || step.status === "running") return null;
    if (step.status === "pending") return step.id;
  }
  return null;
}

export function finishFlowStatus(
  steps: readonly AgentReviewStep[],
): "idle" | "running" | "failed" | "done" {
  if (steps.some((step) => step.status === "failed")) return "failed";
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.every((step) => step.status === "done" || step.status === "skipped")) return "done";
  return "idle";
}

export function canRunStep(steps: readonly AgentReviewStep[], id: AgentReviewStepId): boolean {
  return nextPendingStep(steps) === id;
}

export function retryStep(
  steps: readonly AgentReviewStep[],
  id: AgentReviewStepId,
): AgentReviewStep[] {
  return setStepStatus(steps, id, "pending", null);
}

export async function loadAgentReviewSummary(
  worktreePath: string,
  basePath: string,
): Promise<AgentReviewSummary> {
  return invoke<AgentReviewSummary>("agent_review_summary", { worktreePath, basePath });
}

export async function loadAgentReviewFileDiff(
  worktreePath: string,
  mergeBase: string,
  file: string,
): Promise<AgentReviewFileDiff> {
  return invoke<AgentReviewFileDiff>("agent_review_file_diff", {
    worktreePath,
    mergeBase,
    file,
  });
}

export async function isAgentBranchMerged(path: string, branch: string): Promise<boolean> {
  return invoke<boolean>("agent_review_branch_merged", { path, branch });
}

export function parseReviewDiff(diff: string | null): ParsedDiff | null {
  if (!diff?.trim()) return null;
  return parseDiffWithHunks(diff);
}

export async function discardReviewHunk(
  worktreePath: string,
  parsed: ParsedDiff,
  hunkIdx: number,
): Promise<void> {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return;
  const patches = buildPatchesForDiscard(parsed, hunkSelectionKeys(hunk, hunkIdx));
  for (const patch of patches) {
    await invoke("discard_hunk", { path: worktreePath, patch });
  }
}

function missingAtMergeBase(message: string): boolean {
  return /did not match any file|pathspec|exists on disk, but not in/i.test(message);
}

export async function discardReviewFile(
  worktreePath: string,
  mergeBase: string,
  file: AgentReviewFile,
): Promise<void> {
  if (file.untracked) {
    await invoke("git_discard_files", {
      path: worktreePath,
      files: [file.path],
      untracked: [true],
    });
    return;
  }
  try {
    await invoke("git_restore_files_at_commit", {
      path: worktreePath,
      commit: mergeBase,
      files: [file.path],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!missingAtMergeBase(message)) throw error;
    await invoke("git_discard_files", {
      path: worktreePath,
      files: [file.path],
      untracked: [true],
    });
  }
}

export async function commitReviewChanges(
  worktreePath: string,
  message: string,
): Promise<void> {
  await invoke("stage_files", { path: worktreePath, files: ["."] });
  await invoke("commit_changes", { path: worktreePath, message, sign: null });
}

export async function stagedReviewDiff(worktreePath: string): Promise<string> {
  return invoke<string>("repo_staged_diff", { path: worktreePath });
}

export async function removeSessionWorktree(
  basePath: string,
  worktreePath: string,
): Promise<void> {
  await invoke("git_worktree_remove", { path: basePath, worktreePath, force: false });
}

export async function deleteSessionBranchIfMerged(
  basePath: string,
  sessionBranch: string,
): Promise<boolean> {
  const merged = await isAgentBranchMerged(basePath, sessionBranch);
  if (!merged) return false;
  await invoke("delete_branch", { path: basePath, name: sessionBranch, force: false });
  return true;
}
