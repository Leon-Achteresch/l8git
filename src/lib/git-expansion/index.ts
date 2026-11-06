import { invoke } from "@/lib/platform/ipc";

export type CommandSpec = { program: string; args: string[]; timeoutSeconds: number };
export type WorktreeProfile = { id: string; name: string; copyFiles: string[]; commands: CommandSpec[] };
export type PlanStep = { kind: "merge" | "cherry_pick" | "revert"; commit: string };
export type LineSelection = { sourceStart: number; sourceEnd: number; targetStart: number; targetEnd: number };
export type GitExpansionRequest =
  | { op: "source_files"; files: string[]; expectedHead: string }
  | { op: "evidence_run"; basePath: string; expectedBaseHead: string; expectedHead: string; expectedFingerprint: string; command: CommandSpec; confirmed: boolean }
  | { op: "pickaxe"; text: string; mode: "literal" | "regex"; revision?: string; page: number }
  | { op: "function_history"; file: string; revision: string; start: number; end: number; page: number }
  | { op: "range_diff"; oldBase: string; oldHead: string; newBase: string; newHead: string }
  | { op: "blame_ignore"; file: string; revision: string }
  | { op: "restore_preview"; file: string; revision?: string; snapshotId?: string; selection?: LineSelection }
  | { op: "restore_apply"; previewId: string; expectedFingerprint: string }
  | { op: "rerere_status" }
  | { op: "rerere_configure"; enabled: boolean; expectedEnabled: boolean | null }
  | { op: "rerere_forget"; file: string; expectedHead: string }
  | { op: "profiles_list" }
  | { op: "profiles_save"; profiles: WorktreeProfile[]; expectedFingerprint: string }
  | { op: "profile_apply"; profileId: string; targetPath: string; expectedProfileFingerprint: string; confirmed: boolean }
  | { op: "housekeeping" }
  | { op: "bisect_test"; command: CommandSpec; expectedHead: string; markResult: boolean; confirmed: boolean }
  | { op: "sparse_status" }
  | { op: "sparse_set"; directories: string[]; expectedHead: string; confirmed: boolean }
  | { op: "sparse_disable"; expectedHead: string; confirmed: boolean }
  | { op: "integration"; base: string; heads: string[]; command?: CommandSpec; confirmed: boolean }
  | { op: "overlap"; base: string; heads: string[]; includeWorktrees?: boolean }
  | { op: "behavior_compare"; base: string; head: string; command: CommandSpec; artifacts: string[]; confirmed: boolean }
  | { op: "snapshots_list" }
  | { op: "snapshot_capture"; label: string; expectedHead: string }
  | { op: "snapshot_restore_index"; snapshotId: string; expectedHead: string; expectedIndexTree: string }
  | { op: "snapshot_rescue_branch"; snapshotId: string; branch: string }
  | { op: "plan_preview"; base: string; steps: PlanStep[] }
  | { op: "plan_export"; planId: string; branch: string; expectedHead: string };

export type HistoryCommit = { hash: string; author: string; date: string; subject: string };
/** History pages are one-based; timestamps elsewhere are Unix milliseconds. */
export type HistoryResult = { revision: string; commits: HistoryCommit[]; page: number; hasMore: boolean; patch?: string };
export type RunResult = { exitCode: number | null; stdout: string; stderr: string; truncated: boolean; timedOut: boolean; durationMs: number };
export type IntegrationResult = { base: string; heads: string[]; resultHead: string; conflicts: string[]; steps: { commit: string; kind: string; success: boolean; output: string }[]; run: RunResult | null };
export type RestorePreview = { id: string; file: string; source: string; current: string; proposed: string; fingerprint: string; head: string; indexTree: string; deleteFile: boolean; binary: boolean };
export type SnapshotSummary = { id: string; label: string; createdAt: number; head: string; indexTree: string; branch: string | null; files: string[] };
export type WorktreeDetails = { path: string; head: string; branch: string | null; isMain: boolean; locked: boolean; prunable: boolean; status: string | null; sizeBytes: number | null; sizeTruncated: boolean; lastModified: number | null; error: string | null };
export type SparseStatus = { enabled: boolean; cone: boolean; directories: string[]; omittedTrackedFiles: number; head: string };
export type ProfilesResult = { profiles: WorktreeProfile[]; fingerprint: string };
export type RerereStatus = { enabled: boolean | null; autoupdate: boolean | null; recorded: string[]; remaining: string[]; diff: string };
export type ArtifactEvidence = { path: string; size: number; sha256: string; text: string | null; base64: string | null };
export type BehaviorSide = { head: string; run: RunResult; artifacts: ArtifactEvidence[]; missingArtifacts: string[] };
export type OverlapResult = { base: string; branches: { revision: string; head: string; files: string[] }[]; overlaps: { file: string; heads: string[] }[]; worktrees: { path: string; head: string; branch: string | null; files: string[]; pendingFiles: string[] }[]; worktreeOverlaps: { file: string; worktreePaths: string[] }[]; worktreeErrors: { path: string; error: string }[] };
export type SourceFilesResult = { head: string; files: { path: string; text: string; fingerprint: string }[]; omitted: { path: string; error: string }[]; truncated: boolean };
export type GitEvidenceSnapshot = { baseSha: string; headSha: string; worktreeFingerprint: string };
export type EvidenceRunResult = { run: RunResult; before: GitEvidenceSnapshot; after: GitEvidenceSnapshot | null; stale: boolean; afterError: string | null; files: string[] };
export type GitExpansionResponseMap = {
  source_files: SourceFilesResult;
  evidence_run: EvidenceRunResult;
  pickaxe: HistoryResult;
  function_history: HistoryResult;
  range_diff: { oldBase: string; oldHead: string; newBase: string; newHead: string; diff: string };
  blame_ignore: { head: string; file: string; ignoredRevisions: string[]; porcelain: string };
  restore_preview: RestorePreview;
  restore_apply: { file: string; restored: boolean };
  rerere_status: RerereStatus;
  rerere_configure: RerereStatus;
  rerere_forget: RerereStatus;
  profiles_list: ProfilesResult;
  profiles_save: ProfilesResult;
  profile_apply: { copied: string[]; runs: RunResult[]; targetPath: string; completed: boolean };
  housekeeping: { worktrees: WorktreeDetails[] };
  bisect_test: { head: string; run: RunResult; verdict: "good" | "bad" | "skip" | null; marked: boolean; log: string };
  sparse_status: SparseStatus;
  sparse_set: SparseStatus;
  sparse_disable: SparseStatus;
  integration: IntegrationResult;
  overlap: OverlapResult;
  behavior_compare: { base: BehaviorSide; head: BehaviorSide; sameOutput: boolean; changedArtifacts: string[] };
  snapshots_list: { snapshots: SnapshotSummary[]; current: { head: string; indexTree: string } | null };
  snapshot_capture: SnapshotSummary;
  snapshot_restore_index: { indexTree: string };
  snapshot_rescue_branch: { branch: string; head: string };
  plan_preview: IntegrationResult & { planId: string };
  plan_export: { branch: string; head: string };
};

/** Calls the same registered command on desktop and the existing remote transport. */
export function gitExpansion<R extends GitExpansionRequest>(path: string, request: R): Promise<GitExpansionResponseMap[R["op"]]> {
  return invoke("git_expansion", { path, request });
}
