import { invoke } from "@/lib/platform/ipc";
import type { AgentReviewInvoke, AgentReviewSummary } from "@/lib/agents/agent-review";
import type { StatusEntry } from "@/lib/repo-store";
import { buildChangeMap, evidenceState, type EvidenceSnapshot, type MapDependency } from "./model";

type StatusPath = Pick<StatusEntry, "path" | "previous_path" | "index_status" | "worktree_status" | "untracked">;

export interface FileOverlay {
  id: string;
  kind: "pullRequest" | "session";
  files: readonly string[];
}

export async function readChangeMapFiles(path: string, transport: AgentReviewInvoke = invoke) {
  const [tracked, status] = await Promise.all([
    transport<string[]>("repo_list_files", { path }),
    transport<StatusPath[]>("repo_status_paths", { path }),
  ]);
  const files = new Set(tracked);
  for (const entry of status) {
    if (entry.untracked && !entry.path.endsWith("/")) files.add(entry.path);
  }
  return { files, statusByPath: new Map(status.map(entry => [entry.path, entry])) };
}

export function applyChangeMapOverlays(
  working: Awaited<ReturnType<typeof readChangeMapFiles>>,
  overlays: readonly FileOverlay[],
  dependencies: readonly MapDependency[] = [],
) {
  const paths = new Set(working.files);
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
  const map = buildChangeMap([...paths].map(file => ({ path: file, ...byPath.get(file) })), dependencies);
  return { ...map, statusByPath: working.statusByPath };
}

/** One-shot working-copy map for callers that do not change overlays interactively. */
export async function loadChangeMap(path: string, overlays: readonly FileOverlay[] = [], dependencies: readonly MapDependency[] = [], transport: AgentReviewInvoke = invoke) {
  return applyChangeMapOverlays(await readChangeMapFiles(path, transport), overlays, dependencies);
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
