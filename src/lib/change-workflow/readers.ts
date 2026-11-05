import { invoke } from "@/lib/platform/ipc";
import type { AgentReviewInvoke, AgentReviewSummary } from "@/lib/agents/agent-review";
import type { StatusEntry } from "@/lib/repo-store";
import { buildChangeMap, evidenceState, type EvidenceSnapshot, type MapDependency } from "./model";

export interface FileOverlay {
  id: string;
  kind: "pullRequest" | "session";
  files: readonly string[];
}

/** A working-copy map, explicitly not a tree pinned to a historical commit. */
export async function loadChangeMap(path: string, overlays: readonly FileOverlay[] = [], dependencies: readonly MapDependency[] = [], transport: AgentReviewInvoke = invoke) {
  const [tracked, status] = await Promise.all([
    transport<string[]>("repo_list_files", { path }),
    transport<StatusEntry[]>("repo_status", { path }),
  ]);
  const paths = new Set([...tracked, ...status.filter(file => file.untracked).map(file => file.path)]);
  const byPath = new Map<string, { pullRequests: string[]; sessions: string[] }>();
  for (const overlay of overlays) {
    for (const file of overlay.files) {
      const entry = byPath.get(file) ?? { pullRequests: [], sessions: [] };
      (overlay.kind === "pullRequest" ? entry.pullRequests : entry.sessions).push(overlay.id);
      byPath.set(file, entry);
      // Deleted files in an active change remain navigable, even if absent from ls-files.
      paths.add(file);
    }
  }
  return buildChangeMap([...paths].map(file => ({ path: file, ...byPath.get(file) })), dependencies);
}

/** Capture both revisions and actual review-content fingerprint, rejecting observed races. */
export async function captureAgentSnapshot(worktreePath: string, basePath: string, transport: AgentReviewInvoke = invoke): Promise<{ snapshot: EvidenceSnapshot; files: string[] }> {
  async function heads() {
    return Promise.all([
      transport<string>("git_resolve_commit", { path: basePath, rev: "HEAD" }),
      transport<string>("git_resolve_commit", { path: worktreePath, rev: "HEAD" }),
    ]);
  }
  const before = await heads();
  const first = await transport<AgentReviewSummary>("agent_review_summary", { worktreePath, basePath, includeFingerprint: true });
  const second = await transport<AgentReviewSummary>("agent_review_summary", { worktreePath, basePath, includeFingerprint: true });
  const after = await heads();
  if (!first.fingerprint || !second.fingerprint || before.some((head, index) => head !== after[index]) || first.fingerprint !== second.fingerprint) {
    throw new Error("Agent content changed while capturing evidence; refresh and try again.");
  }
  return {
    snapshot: { baseSha: after[0], headSha: after[1], worktreeFingerprint: second.fingerprint },
    files: second.files.map(file => file.path),
  };
}

/** External execution remains caller-owned; results are never called current after observed edits. */
export async function runWithEvidence<T>(worktreePath: string, basePath: string, run: () => Promise<T>, transport: AgentReviewInvoke = invoke) {
  const before = await captureAgentSnapshot(worktreePath, basePath, transport);
  const startedAt = new Date().toISOString();
  const result = await run();
  const finishedAt = new Date().toISOString();
  const after = await captureAgentSnapshot(worktreePath, basePath, transport);
  return { result, startedAt, finishedAt, snapshot: before.snapshot, files: before.files, state: evidenceState(before, after.snapshot) };
}
