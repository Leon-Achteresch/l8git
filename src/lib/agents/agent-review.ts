import { invoke } from "@/lib/platform/ipc";
import { flushKvWrites, hydrateKv, kvGet, kvSet } from "@/lib/platform/kv";
import { platform } from "@/lib/platform";
import { parseCommitInspectMetadata } from "@/lib/commit-inspect-metadata";
import { splitCommitMessage } from "@/lib/commit-message";
import type { StatusEntry, WorktreeEntry } from "@/lib/repo-store";

import type { AgentTurn, AgentTurnStatus } from "@/lib/agents/types";
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

export type AgentReviewInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface AgentReviewSummary {
  baseBranch: string;
  sessionBranch: string;
  mergeBase: string;
  files: AgentReviewFile[];
  additions: number;
  deletions: number;
  commits: number;
  uncommitted: number;
  fingerprint?: string | null;
}

export interface AgentReviewFileDiff {
  diff: string | null;
  untrackedPlain: string | null;
  isBinary: boolean;
  fingerprint?: string;
}

export function reviewFileSnapshotEqual(first: AgentReviewFileDiff, second: AgentReviewFileDiff): boolean {
  return Boolean(first.fingerprint) && first.fingerprint === second.fingerprint && first.diff === second.diff && first.untrackedPlain === second.untrackedPlain && first.isBinary === second.isBinary;
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
  if (steps.some((step) => step.status === "failed" || step.status === "running")) return null;
  for (const step of steps) {
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
  if (steps.some((step) => step.status === "running") || steps.find((step) => step.id === id)?.status !== "failed") return [...steps];
  return setStepStatus(steps, id, "pending", null);
}

export async function loadAgentReviewSummary(
  worktreePath: string,
  basePath: string,
  includeFingerprint = false,
  transport: AgentReviewInvoke = invoke,
): Promise<AgentReviewSummary> {
  const summary = await transport<AgentReviewSummary>("agent_review_summary", {
    worktreePath, basePath, ...(includeFingerprint ? { includeFingerprint: true } : {}),
  });
  if (includeFingerprint && !hasReviewContentFingerprint(summary)) {
    throw new AgentReviewPreflightError("reviewRequired");
  }
  return summary;
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

export async function isAgentBranchMerged(path: string, branch: string, transport: AgentReviewInvoke = invoke): Promise<boolean> {
  return transport<boolean>("agent_review_branch_merged", { path, branch });
}

export function parseReviewDiff(diff: string | null): ParsedDiff | null {
  if (!diff?.trim()) return null;
  return parseDiffWithHunks(diff);
}

export async function discardReviewHunk(
  worktreePath: string,
  mergeBase: string,
  file: string,
  parsed: ParsedDiff,
  hunkIdx: number,
  expectedFingerprint: string,
): Promise<void> {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return;
  if (!expectedFingerprint) throw new Error(`__FILE_CHANGED__|${file}`);
  const patches = buildPatchesForDiscard(parsed, hunkSelectionKeys(hunk, hunkIdx));
  // Apply the complete selected hunk in one guarded mutation.
  await invoke("agent_review_discard_change", {
    worktreePath, mergeBase, file, expectedFingerprint, patch: patches.join("\n"),
  });
}

export async function discardReviewFile(
  worktreePath: string,
  mergeBase: string,
  file: AgentReviewFile,
  expectedFingerprint: string,
): Promise<void> {
  if (!expectedFingerprint) throw new Error(`__FILE_CHANGED__|${file.path}`);
  await invoke("agent_review_discard_change", {
    worktreePath, mergeBase, file: file.path, expectedFingerprint, patch: null,
  });
}

export async function commitReviewChanges(
  worktreePath: string,
  message: string,
  transport: AgentReviewInvoke = invoke,
): Promise<void> {
  if (!splitCommitMessage(message).subject.trim()) throw new AgentReviewPreflightError("messageRequired");
  await transport("stage_files", { path: worktreePath, files: ["."] });
  await transport("commit_changes", { path: worktreePath, message: message.trim(), sign: null });
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

export function isFinishedTurnStatus(status: AgentTurnStatus): boolean {
  return status === "completed" || status === "failed";
}

export function collectFinishedTurnIds(
  turns: readonly Pick<AgentTurn, "id" | "status">[],
): string[] {
  return turns.filter((turn) => isFinishedTurnStatus(turn.status)).map((turn) => turn.id);
}

export interface AgentReviewRequest {
  threadId: string;
  worktreePath: string;
  diffHash: string;
}

export interface AgentReviewFinding {
  file: string;
  line: number;
  message: string;
  stale?: boolean;
}

export function hashDiffText(diff: string): string {
  let hash = 0;
  for (let index = 0; index < diff.length; index += 1) {
    hash = (hash * 31 + diff.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

export function createReviewRequest(
  threadId: string,
  worktreePath: string,
  diff: string,
): AgentReviewRequest {
  return { threadId, worktreePath, diffHash: hashDiffText(diff) };
}

export function markFindingsStaleOnDiffChange(
  findings: readonly AgentReviewFinding[],
  previousDiffHash: string | null,
  nextDiffHash: string,
): AgentReviewFinding[] {
  if (previousDiffHash === null || previousDiffHash === nextDiffHash) {
    return findings.map((finding) => ({ ...finding, stale: finding.stale ?? false }));
  }
  return findings.map((finding) => ({ ...finding, stale: true }));
}

export async function deleteSessionBranchIfMerged(
  basePath: string,
  sessionBranch: string,
  transport: AgentReviewInvoke = invoke,
  beforeDelete?: () => void,
): Promise<boolean> {
  const merged = await isAgentBranchMerged(basePath, sessionBranch, transport);
  if (!merged) return false;
  beforeDelete?.();
  await transport("delete_branch", { path: basePath, name: sessionBranch, force: false });
  return true;
}

export type AgentReviewMergeStrategy = "ff" | "ff-only" | "no-ff";
export type AgentReviewProblem =
  | "wrongBaseBranch" | "wrongSessionBranch" | "missingWorktree" | "protectedWorktree"
  | "baseDirty" | "sessionDirty" | "conflicts" | "operationInProgress" | "reviewRequired"
  | "reviewChanged" | "messageRequired" | "branchNotIntegrated" | "agentBusy" | "interrupted" | "nothingToCommit";

export class AgentReviewPreflightError extends Error {
  constructor(readonly reason: AgentReviewProblem) {
    super(`agentReviewFinish.errors.${reason}`);
    this.name = "AgentReviewPreflightError";
  }
}

export type AgentReviewFinishContext = {
  worktreePath: string;
  basePath: string;
  sessionBranch: string;
  baseBranch: string;
  /** Stable app-created worktree generation, retained after metadata cleanup. */
  worktreeCreatedAt?: number;
  /** Remote host identity. Host-scoped controllers require an explicit transport. */
  hostId?: string;
};

export type AgentReviewPreflight = {
  worktrees: readonly WorktreeEntry[];
  summary: AgentReviewSummary | null;
  baseStatus: readonly StatusEntry[];
  sessionStatus: readonly StatusEntry[];
  baseOperation: boolean;
  sessionOperation: boolean;
  baseHead: string;
  sessionHead: string;
  worktreeRemoved: boolean;
  worktreeReappeared?: boolean;
};

const CONFLICT_STATUS = new Set(["UU", "AA", "DD", "AU", "UA", "DU", "UD"]);

function hasReviewContentFingerprint(summary: AgentReviewSummary): boolean {
  return typeof summary.fingerprint === "string" && summary.fingerprint.trim().length > 0;
}

export function reviewSnapshotSignature(summary: AgentReviewSummary, sessionHead: string): string {
  return JSON.stringify([
    sessionHead, summary.baseBranch, summary.sessionBranch, summary.mergeBase,
    summary.commits, summary.uncommitted, summary.additions, summary.deletions,
    summary.fingerprint,
    [...summary.files].sort((a, b) => a.path.localeCompare(b.path)),
  ]);
}

export function agentReviewPreflightProblem(
  context: AgentReviewFinishContext,
  step: AgentReviewStepId,
  data: AgentReviewPreflight,
  reviewedSignature: string | null,
): AgentReviewProblem | null {
  const base = data.worktrees.find((entry) => entry.path === context.basePath);
  const session = data.worktrees.find((entry) => entry.path === context.worktreePath);
  if (!base || base.branch !== context.baseBranch || data.summary && data.summary.baseBranch !== context.baseBranch) return "wrongBaseBranch";
  if (context.basePath === context.worktreePath || context.sessionBranch === context.baseBranch) return "protectedWorktree";
  if (!data.worktreeRemoved) {
    if (!session) return "missingWorktree";
    if (session.branch !== context.sessionBranch || data.summary?.sessionBranch !== context.sessionBranch) return "wrongSessionBranch";
    if (session.is_main || session.is_locked || session.is_prunable) return "protectedWorktree";
  }
  if ([...data.baseStatus, ...data.sessionStatus].some((entry) => CONFLICT_STATUS.has(entry.index_status + entry.worktree_status))) return "conflicts";
  if (data.sessionOperation || data.baseOperation) return "operationInProgress";
  if (step !== "commit" && data.baseStatus.length > 0) return "baseDirty";
  if (step !== "commit" && data.sessionStatus.length > 0) return "sessionDirty";
  if (step !== "cleanup") {
    if (!reviewedSignature || !data.summary || !hasReviewContentFingerprint(data.summary)) return "reviewRequired";
    if (reviewSnapshotSignature(data.summary, data.sessionHead) !== reviewedSignature) return "reviewChanged";
  }
  return null;
}

export interface AgentReviewFinishSnapshot {
  steps: AgentReviewStep[];
  summary: AgentReviewSummary | null;
  sessionHead: string;
  reviewedSignature: string | null;
  worktreeRemoved: boolean;
  worktreeMetadataRemoved: boolean;
  branchDeleted: boolean;
  strategy: AgentReviewMergeStrategy;
  checking: boolean;
  validated: boolean;
  checkError: string | null;
  message: string;
}

function finishRegistryKey(context: AgentReviewFinishContext): string {
  const parts = [context.basePath, context.worktreePath, context.baseBranch, context.sessionBranch, context.worktreeCreatedAt ?? null];
  return JSON.stringify(context.hostId === undefined ? parts : ["host", context.hostId, ...parts]);
}

export function agentReviewFinishStorageKey(context: AgentReviewFinishContext): string {
  return `l8git-agent-review-finish.v2.${encodeURIComponent(finishRegistryKey(context))}`;
}

function legacyFinishStorageKey(context: AgentReviewFinishContext): string | null {
  return context.hostId === undefined && context.worktreeCreatedAt === undefined
    ? `l8git-agent-review-finish.${encodeURIComponent(JSON.stringify(context))}` : null;
}

export function agentReviewFinishStorageKeys(context: AgentReviewFinishContext): string[] {
  const legacy = legacyFinishStorageKey(context);
  return [agentReviewFinishStorageKey(context), agentReviewFinishContextIndexKey(context.worktreePath, context.basePath, context.hostId), ...(legacy ? [legacy] : [])];
}

export async function hydrateAgentReviewFinishCheckpoint(context: AgentReviewFinishContext): Promise<void> {
  await hydrateKv(agentReviewFinishStorageKeys(context));
}

export async function hydrateAgentReviewFinishRecovery(worktreePath: string, basePath: string, hostId?: string): Promise<AgentReviewFinishContext | null> {
  await hydrateKv([agentReviewFinishContextIndexKey(worktreePath, basePath, hostId)]);
  const context = readAgentReviewFinishRecoveryContext(worktreePath, basePath, hostId);
  if (context) await hydrateAgentReviewFinishCheckpoint(context);
  return context;
}

function initialFinishSnapshot(hasUncommitted: boolean): AgentReviewFinishSnapshot {
  return {
    steps: createFinishSteps({ hasUncommitted }), summary: null, sessionHead: "",
    reviewedSignature: null, worktreeRemoved: false, worktreeMetadataRemoved: false, branchDeleted: false, strategy: "ff",
    checking: false, validated: false, checkError: null, message: "",
  };
}

export function readAgentReviewFinishCheckpoint(context: AgentReviewFinishContext, hasUncommitted = false): AgentReviewFinishSnapshot | null {
  try {
    const legacy = legacyFinishStorageKey(context);
    const raw = kvGet(agentReviewFinishStorageKey(context)) ?? (legacy ? kvGet(legacy) : null);
    if (raw === null) return null;
    const initial = initialFinishSnapshot(hasUncommitted);
    const restored = restoreAgentReviewCheckpoint(JSON.parse(raw), initial);
    return restored === initial ? null : restored;
  } catch { return null; }
}

function checkpointSummary(value: unknown): AgentReviewSummary | null {
  if (!value || typeof value !== "object") return null;
  const summary = value as AgentReviewSummary;
  if (![summary.baseBranch, summary.sessionBranch, summary.mergeBase].every((item) => typeof item === "string") ||
      summary.fingerprint != null && typeof summary.fingerprint !== "string" ||
      ![summary.additions, summary.deletions, summary.commits, summary.uncommitted].every((item) => Number.isSafeInteger(item) && item >= 0) ||
      !Array.isArray(summary.files) || !summary.files.every((file) => file && typeof file.path === "string" && Number.isSafeInteger(file.additions) && file.additions >= 0 && Number.isSafeInteger(file.deletions) && file.deletions >= 0 && typeof file.binary === "boolean" && typeof file.untracked === "boolean")) return null;
  return summary;
}

export function restoreAgentReviewCheckpoint(value: unknown, initial: AgentReviewFinishSnapshot): AgentReviewFinishSnapshot {
  if (!value || typeof value !== "object") return initial;
  const saved = value as Partial<AgentReviewFinishSnapshot>;
  const savedSteps = saved.steps;
  const statuses: AgentReviewStepStatus[] = ["pending", "running", "done", "skipped", "failed"];
  if (!Array.isArray(savedSteps) || savedSteps.length !== 3 || !AGENT_REVIEW_STEP_ORDER.every((id, index) => savedSteps[index]?.id === id && statuses.includes(savedSteps[index].status))) return initial;
  const removed = saved.worktreeRemoved === true;
  const metadataRemoved = saved.worktreeMetadataRemoved === true;
  const deleted = saved.branchDeleted === true;
  const head = typeof saved.sessionHead === "string" && /^[a-f\d]+$/i.test(saved.sessionHead) ? saved.sessionHead : "";
  if (metadataRemoved && !removed || deleted && !removed || removed && (!head || savedSteps[1].status !== "done") || savedSteps[2].status === "done" && (!removed || !deleted) || savedSteps[1].status === "done" && !["done", "skipped"].includes(savedSteps[0].status)) return initial;
  return {
    ...initial,
    steps: savedSteps.map((step) => step.status === "running"
      ? { id: step.id, status: "failed", error: new AgentReviewPreflightError("interrupted").message }
      : { id: step.id, status: step.status, error: typeof step.error === "string" ? step.error : null }),
    summary: checkpointSummary(saved.summary), sessionHead: head,
    worktreeRemoved: removed, worktreeMetadataRemoved: metadataRemoved, branchDeleted: deleted,
    strategy: saved.strategy && ["ff", "ff-only", "no-ff"].includes(saved.strategy) ? saved.strategy : "ff",
    message: typeof saved.message === "string" ? saved.message : "",
    checking: false, validated: false, reviewedSignature: null, checkError: null,
  };
}

export function reconcileAgentReviewCheckpoint(state: AgentReviewFinishSnapshot, data: AgentReviewPreflight): Partial<AgentReviewFinishSnapshot> {
  const replaced = data.worktreeReappeared || !data.worktreeRemoved && state.steps[1].status === "done" && state.sessionHead !== data.sessionHead;
  let steps = replaced ? createFinishSteps({ hasUncommitted: (data.summary?.uncommitted ?? 0) > 0 }) : state.steps;
  if (data.summary && !data.worktreeRemoved && data.summary.uncommitted > 0 && steps[0].status !== "pending") {
    steps = createFinishSteps({ hasUncommitted: true });
  } else if (data.summary?.uncommitted === 0 && ["pending", "failed"].includes(steps[0].status)) {
    steps = setStepStatus(steps, "commit", "skipped");
  }
  return {
    steps, summary: data.summary, sessionHead: data.sessionHead, reviewedSignature: null,
    ...(!replaced && data.worktreeRemoved ? { worktreeRemoved: true } : {}),
    ...(replaced ? { worktreeRemoved: false, worktreeMetadataRemoved: false, branchDeleted: false } : {}),
  };
}

export type AgentReviewFinishDependencies = {
  /** Captured at construction; configuring dependencies never redirects it. */
  invoke?: AgentReviewInvoke;
  isBusy?: () => boolean;
  isCurrent?: () => boolean;
  flushCheckpoint?: () => Promise<void>;
  onWorktreeRemoved?: (path: string) => Promise<void> | void;
  onChanged?: (path: string) => Promise<void> | void;
};

async function reviewHeadHash(path: string, transport: AgentReviewInvoke): Promise<string> {
  const result = await transport<{ header: string }>("repo_commit_inspect", { path, commit: "HEAD" });
  const hash = parseCommitInspectMetadata(result.header).hash;
  if (!hash) throw new Error("Unable to resolve HEAD");
  return hash;
}

async function reviewOperationActive(path: string, transport: AgentReviewInvoke): Promise<boolean> {
  const states = await Promise.all(["merge_state", "rebase_status", "cherry_pick_state"].map(
    (command) => transport<{ in_progress: boolean }>(command, { path }),
  ));
  return states.some((state) => state.in_progress);
}

/** Owns the in-flight operation and its cleanup checkpoint across modal lifetimes. */
export class AgentReviewFinishController {
  private state: AgentReviewFinishSnapshot;
  private readonly listeners = new Set<() => void>();
  private operationRunning = false;
  private refreshPromise: Promise<void> | null = null;
  private readonly storageKey: string;
  private readonly invoke: AgentReviewInvoke;
  readonly context: AgentReviewFinishContext;

  constructor(context: AgentReviewFinishContext, hasUncommitted: boolean, private dependencies: AgentReviewFinishDependencies = {}) {
    if (context.hostId !== undefined && !dependencies.invoke) throw new Error("Host-scoped review requires an explicit transport");
    this.context = Object.freeze({ ...context });
    this.dependencies = { ...dependencies };
    this.invoke = dependencies.invoke ?? platform().invoke;
    this.storageKey = agentReviewFinishStorageKey(this.context);
    this.state = readAgentReviewFinishCheckpoint(this.context, hasUncommitted) ?? initialFinishSnapshot(hasUncommitted);
  }

  getSnapshot = (): AgentReviewFinishSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(next: Partial<AgentReviewFinishSnapshot>): void {
    this.state = { ...this.state, ...next };
    kvSet(this.storageKey, JSON.stringify({ ...this.state, checking: false, validated: false }));
    const index = readAgentReviewFinishRecoveryContext(this.context.worktreePath, this.context.basePath, this.context.hostId);
    if (!index?.worktreeCreatedAt || this.context.worktreeCreatedAt !== undefined && index.worktreeCreatedAt <= this.context.worktreeCreatedAt) {
      kvSet(agentReviewFinishContextIndexKey(this.context.worktreePath, this.context.basePath, this.context.hostId), JSON.stringify(this.context));
    }
    for (const listener of this.listeners) listener();
  }

  configureDependencies(dependencies: AgentReviewFinishDependencies): void {
    this.dependencies = { ...this.dependencies, ...dependencies };
  }

  canEvict(): boolean { return !this.operationRunning && !this.refreshPromise && this.listeners.size === 0; }

  setMessage(message: string): void { if (!this.operationRunning) this.update({ message }); }
  setStrategy(strategy: AgentReviewMergeStrategy): void {
    if (!this.operationRunning && ["ff", "ff-only", "no-ff"].includes(strategy)) this.update({ strategy });
  }
  markReviewed(reviewed: boolean): void {
    this.update({ reviewedSignature: reviewed && this.state.validated && !this.state.checking && this.state.summary && hasReviewContentFingerprint(this.state.summary)
      ? reviewSnapshotSignature(this.state.summary, this.state.sessionHead) : null });
  }

  private async readPreflight(): Promise<AgentReviewPreflight> {
    const { basePath, worktreePath } = this.context;
    const worktrees = await this.invoke<WorktreeEntry[]>("list_worktrees", { path: basePath });
    const worktreeReappeared = this.state.worktreeRemoved && worktrees.some((entry) => entry.path === worktreePath);
    let removed = this.state.worktreeRemoved && !worktreeReappeared;
    if (!removed && !worktrees.some(entry => entry.path === worktreePath) &&
        this.state.steps[1].status === "done" && this.state.sessionHead) {
      // A remote removal can complete before its response is lost. Infer that
      // milestone only from the durable merged HEAD and the current base repo.
      const repo = await this.invoke<{ branch: string; branches: { name: string; is_remote: boolean }[] }>("open_repo", { path: basePath });
      if (repo.branch !== this.context.baseBranch) throw new AgentReviewPreflightError("wrongBaseBranch");
      if (!await isAgentBranchMerged(basePath, this.state.sessionHead, this.invoke)) throw new AgentReviewPreflightError("branchNotIntegrated");
      if (repo.branches.some(branch => !branch.is_remote && branch.name === this.context.sessionBranch)) {
        const branchHead = await this.invoke<string>("git_resolve_commit", { path: basePath, rev: `refs/heads/${this.context.sessionBranch}` });
        if (branchHead !== this.state.sessionHead) throw new AgentReviewPreflightError("reviewChanged");
      }
      removed = true;
    }
    const [summary, baseStatus, sessionStatus, baseOperation, sessionOperation, baseHead, sessionHead] = await Promise.all([
      removed ? Promise.resolve(this.state.summary) : loadAgentReviewSummary(worktreePath, basePath, true, this.invoke),
      this.invoke<StatusEntry[]>("repo_status", { path: basePath }),
      removed ? Promise.resolve([] as StatusEntry[]) : this.invoke<StatusEntry[]>("repo_status", { path: worktreePath }),
      reviewOperationActive(basePath, this.invoke),
      removed ? Promise.resolve(false) : reviewOperationActive(worktreePath, this.invoke),
      reviewHeadHash(basePath, this.invoke),
      removed ? Promise.resolve(this.state.sessionHead) : reviewHeadHash(worktreePath, this.invoke),
    ]);
    return { worktrees, summary, baseStatus, sessionStatus, baseOperation, sessionOperation, baseHead, sessionHead, worktreeRemoved: removed, worktreeReappeared };
  }

  refresh(): Promise<void> {
    if (this.operationRunning) return Promise.resolve();
    if (this.refreshPromise) return this.refreshPromise;
    this.update({ checking: true, validated: false, checkError: null, reviewedSignature: null });
    this.refreshPromise = (async () => {
      try {
        const data = await this.readPreflight();
        const problem = agentReviewPreflightProblem(this.context, "cleanup", data, null);
        this.update({ ...reconcileAgentReviewCheckpoint(this.state, data), validated: true,
          checkError: problem ? new AgentReviewPreflightError(problem).message : null });
      } catch (error) {
        this.update({ checkError: error instanceof Error ? error.message : String(error) });
      } finally {
        this.refreshPromise = null;
        this.update({ checking: false });
      }
    })();
    return this.refreshPromise;
  }

  async run(id: AgentReviewStepId, retry = false): Promise<boolean> {
    if (this.operationRunning || this.state.checking) return false;
    if (id !== "cleanup" && !this.state.validated) return false;
    if (retry) this.update({ steps: retryStep(this.state.steps, id) });
    if (!canRunStep(this.state.steps, id)) return false;
    const dependencies = { ...this.dependencies };
    const flushCheckpoint = dependencies.flushCheckpoint ?? (() => flushKvWrites(agentReviewFinishStorageKeys(this.context)));
    const assertCurrent = () => {
      if (dependencies.isBusy?.()) throw new AgentReviewPreflightError("agentBusy");
      if (dependencies.isCurrent?.() === false) throw new AgentReviewPreflightError("reviewChanged");
    };
    let committed = false;
    this.operationRunning = true;
    this.update({ steps: setStepStatus(this.state.steps, id, "running"), checking: true, checkError: null });
    try {
      assertCurrent();
      const data = await this.readPreflight();
      if (data.worktreeReappeared || id === "cleanup" && !data.worktreeRemoved && data.sessionHead !== this.state.sessionHead) {
        this.update({ ...reconcileAgentReviewCheckpoint(this.state, data), validated: true,
          checkError: new AgentReviewPreflightError("reviewChanged").message });
        return false;
      }
      const problem = agentReviewPreflightProblem(this.context, id, data, this.state.reviewedSignature);
      if (problem) {
        if (problem === "reviewChanged") this.update({ summary: data.summary, sessionHead: data.sessionHead, reviewedSignature: null });
        throw new AgentReviewPreflightError(problem);
      }
      assertCurrent();
      this.update({ validated: true });
      if (data.worktreeRemoved && !this.state.worktreeRemoved) {
        this.update({ worktreeRemoved: true, worktreeMetadataRemoved: false, sessionHead: data.sessionHead });
      }
      const { basePath, worktreePath, baseBranch, sessionBranch } = this.context;
      if (id === "commit") {
        if (!splitCommitMessage(this.state.message).subject.trim()) throw new AgentReviewPreflightError("messageRequired");
        const committedHead = await this.invoke<string>("agent_review_commit_checked", {
          worktreePath, basePath, message: this.state.message.trim(),
          expectedBaseBranch: baseBranch, expectedSessionBranch: sessionBranch,
          expectedBaseHead: data.baseHead, expectedSessionHead: data.sessionHead,
          expectedFingerprint: data.summary!.fingerprint,
        });
        committed = true;
        // Persist the completed Git action before fetching its next review.
        this.update({ steps: setStepStatus(this.state.steps, "commit", "done"), sessionHead: committedHead,
          summary: null, reviewedSignature: null, validated: false });
        await flushCheckpoint();
        const [summary, sessionHead] = await Promise.all([
          loadAgentReviewSummary(worktreePath, basePath, true, this.invoke), reviewHeadHash(worktreePath, this.invoke),
        ]);
        if (sessionHead !== committedHead) throw new AgentReviewPreflightError("reviewChanged");
        this.update({ summary, sessionHead, reviewedSignature: null, validated: true });
        if (summary.uncommitted > 0) throw new AgentReviewPreflightError("sessionDirty");
      } else if (id === "merge") {
        if (!await isAgentBranchMerged(basePath, sessionBranch, this.invoke)) {
          assertCurrent();
          await this.invoke("git_merge", { path: basePath, branch: sessionBranch, strategy: this.state.strategy, message: null,
            expectedBranch: baseBranch, expectedHead: data.baseHead, expectedSourceHead: data.sessionHead });
        }
        if (!await isAgentBranchMerged(basePath, sessionBranch, this.invoke)) throw new AgentReviewPreflightError("branchNotIntegrated");
      } else {
        if (!this.state.worktreeRemoved) {
          if (!await isAgentBranchMerged(basePath, sessionBranch, this.invoke)) throw new AgentReviewPreflightError("branchNotIntegrated");
          assertCurrent();
          await this.invoke("git_worktree_remove_checked", { path: basePath, worktreePath, expectedBranch: sessionBranch,
            expectedHead: data.sessionHead, mergedInto: baseBranch });
          // Save this checkpoint before branch deletion, which may fail independently.
          this.update({ worktreeRemoved: true, worktreeMetadataRemoved: false, sessionHead: data.sessionHead });
        }
        // Also flush when resuming removal: an earlier persistence failure must
        // be repaired before deleting the surviving branch or app metadata.
        await flushCheckpoint();
        assertCurrent();
        if (!this.state.worktreeMetadataRemoved) {
          await dependencies.onWorktreeRemoved?.(worktreePath);
          this.update({ worktreeMetadataRemoved: true });
          await flushCheckpoint();
          assertCurrent();
        }
        const repo = await this.invoke<{ branch: string; branches: { name: string; is_remote: boolean }[] }>("open_repo", { path: basePath });
        if (repo.branch !== baseBranch) throw new AgentReviewPreflightError("wrongBaseBranch");
        if (repo.branches.some((branch) => !branch.is_remote && branch.name === sessionBranch)) {
          assertCurrent();
          await this.invoke("agent_review_delete_branch_checked", {
            path: basePath, branch: sessionBranch, expectedHead: this.state.sessionHead, expectedBaseBranch: baseBranch,
          });
        }
        this.update({ branchDeleted: true });
      }
      this.update({ steps: setStepStatus(this.state.steps, id, "done") });
      try {
        await dependencies.onChanged?.(this.context.basePath);
      } catch (error) {
        // The Git operation succeeded; a failed UI refresh must not invite a repeat.
        this.update({ checkError: error instanceof Error ? error.message : String(error) });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (committed) {
        this.update({ summary: null, reviewedSignature: null, validated: false, checkError: message });
      } else {
        this.update({ steps: setStepStatus(this.state.steps, id, "failed", message) });
      }
      try { await dependencies.onChanged?.(this.context.basePath); } catch { /* Keep the operation's original error. */ }
      return committed;
    } finally {
      this.operationRunning = false;
      // The next step becomes interactive only after repository refreshes and
      // cleanup checkpoints have finished, including a failed refresh.
      this.update({ checking: false });
    }
  }

  markSplitCommitted(): void {
    if (!this.operationRunning && this.state.summary?.uncommitted === 0) {
      this.update({ steps: setStepStatus(this.state.steps, "commit", "done") });
    }
  }
}

const finishControllers = new Map<string, AgentReviewFinishController>();
const MAX_IDLE_FINISH_CONTROLLERS = 64;
export function agentReviewFinishContextIndexKey(worktreePath: string, basePath: string, hostId?: string): string {
  const scope = hostId === undefined ? `${basePath}\0${worktreePath}` : JSON.stringify(["host", hostId, basePath, worktreePath]);
  return `l8git-agent-review-finish.index.${encodeURIComponent(scope)}`;
}
export function readAgentReviewFinishRecoveryContext(worktreePath: string, basePath: string, hostId?: string): AgentReviewFinishContext | null {
  try {
    const context = JSON.parse(kvGet(agentReviewFinishContextIndexKey(worktreePath, basePath, hostId)) ?? "null") as AgentReviewFinishContext | null;
    return context?.worktreePath === worktreePath && context.basePath === basePath && context.hostId === hostId &&
      typeof context.sessionBranch === "string" && context.sessionBranch.length > 0 && typeof context.baseBranch === "string" && context.baseBranch.length > 0 &&
      (context.worktreeCreatedAt === undefined || Number.isSafeInteger(context.worktreeCreatedAt) && context.worktreeCreatedAt > 0) ? context : null;
  } catch { return null; }
}
function pruneFinishControllers(protectedController?: AgentReviewFinishController): void {
  if (finishControllers.size <= MAX_IDLE_FINISH_CONTROLLERS) return;
  for (const [key, controller] of finishControllers) {
    if (finishControllers.size <= MAX_IDLE_FINISH_CONTROLLERS) break;
    if (controller !== protectedController && controller.canEvict()) finishControllers.delete(key);
  }
}
export function releaseAgentReviewFinishController(controller: AgentReviewFinishController): void {
  if (finishFlowStatus(controller.getSnapshot().steps) === "done" && controller.canEvict()) {
    const key = finishRegistryKey(controller.context);
    if (finishControllers.get(key) === controller) finishControllers.delete(key);
  }
  pruneFinishControllers();
}
export function getAgentReviewFinishController(context: AgentReviewFinishContext, hasUncommitted: boolean, dependencies: AgentReviewFinishDependencies = {}): AgentReviewFinishController {
  const key = finishRegistryKey(context);
  let controller = finishControllers.get(key);
  if (!controller) {
    controller = new AgentReviewFinishController(context, hasUncommitted, dependencies);
    finishControllers.set(key, controller);
  } else {
    finishControllers.delete(key);
    finishControllers.set(key, controller);
  }
  controller.configureDependencies(dependencies);
  pruneFinishControllers(controller);
  return controller;
}

export function existingAgentReviewFinishController(worktreePath: string, basePath: string, worktreeCreatedAt?: number, hostId?: string, dependencies: AgentReviewFinishDependencies = {}): AgentReviewFinishController | null {
  const context = readAgentReviewFinishRecoveryContext(worktreePath, basePath, hostId);
  if (context && (worktreeCreatedAt === undefined || context.worktreeCreatedAt === worktreeCreatedAt)) return getAgentReviewFinishController(context, false, dependencies);
  const existing = [...finishControllers.values()].reverse().find((controller) => controller.context.hostId === hostId && controller.context.worktreePath === worktreePath && controller.context.basePath === basePath && (worktreeCreatedAt === undefined || controller.context.worktreeCreatedAt === worktreeCreatedAt));
  existing?.configureDependencies(dependencies);
  return existing ?? null;
}

/** AI reads all pending edits without changing the staging area. */
export async function pendingReviewDiff(worktreePath: string, signal?: AbortSignal): Promise<string> {
  const entries = await invoke<StatusEntry[]>("repo_status", { path: worktreePath });
  if (entries.length === 0) throw new AgentReviewPreflightError("nothingToCommit");
  const pieces: string[] = [];
  let chars = 0;
  for (let start = 0; start < entries.length && chars < 48_000; start += 4) {
    signal?.throwIfAborted();
    const batch = await Promise.all(entries.slice(start, start + 4).map(async (entry) => {
      const result = await invoke<{ staged: string | null; unstaged: string | null; untracked_plain: string | null; is_binary: boolean }>("repo_file_diff", {
        path: worktreePath, file: entry.path, untracked: entry.untracked,
      });
      return [`--- ${entry.path}${result.is_binary ? " (binary)" : ""}`, result.staged, result.unstaged,
        result.untracked_plain != null ? `New file contents:\n${result.untracked_plain}` : null,
      ].filter((part): part is string => !!part).join("\n");
    }));
    for (const piece of batch) { pieces.push(piece); chars += piece.length; }
  }
  signal?.throwIfAborted();
  return pieces.join("\n\n");
}
