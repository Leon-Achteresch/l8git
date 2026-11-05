export function workflowScope(provider: string, host: string, login: string, repository: string): string {
  return JSON.stringify([provider, host.toLowerCase(), login, repository]);
}

export interface MapFile {
  path: string;
  size?: number;
  pullRequests?: string[];
  sessions?: string[];
}

export interface MapDependency {
  from: string;
  to: string;
  source: "import" | "manifest" | "cochange";
}

export interface ChangeMapNode {
  id: string;
  parent: string | null;
  kind: "directory" | "file";
  size: number | null;
  pullRequests: string[];
  sessions: string[];
}

function safeRepoPath(path: string): boolean {
  return !!path && !path.startsWith("/") && !path.includes("\0") &&
    !path.split("/").some(part => !part || part === "." || part === "..");
}

/** Stable IDs survive filtering; absent dependencies remain absent, never inferred. */
export function buildChangeMap(files: readonly MapFile[], dependencies: readonly MapDependency[] = []) {
  const nodes = new Map<string, ChangeMapNode>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!safeRepoPath(file.path)) throw new Error("Invalid repository-relative map path");
    const parts = file.path.split("/");
    for (let index = 0; index < parts.length; index++) {
      const id = parts.slice(0, index + 1).join("/");
      const kind = index === parts.length - 1 ? "file" : "directory";
      const existing = nodes.get(id);
      if (existing && existing.kind !== kind) throw new Error("Map path is both a file and directory");
      if (existing && kind === "file") throw new Error("Duplicate map file");
      if (!existing) nodes.set(id, {
        id,
        parent: index === 0 ? null : parts.slice(0, index).join("/"),
        kind,
        size: kind === "file" && typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0 ? file.size : null,
        pullRequests: [],
        sessions: [],
      });
      const node = nodes.get(id)!;
      node.pullRequests = [...new Set([...node.pullRequests, ...(file.pullRequests ?? [])])].sort();
      node.sessions = [...new Set([...node.sessions, ...(file.sessions ?? [])])].sort();
    }
  }
  const edges = new Map<string, MapDependency>();
  for (const dependency of dependencies) {
    if (nodes.get(dependency.from)?.kind !== "file" || nodes.get(dependency.to)?.kind !== "file") continue;
    if (dependency.from === dependency.to) continue;
    edges.set(JSON.stringify([dependency.from, dependency.to, dependency.source]), { ...dependency });
  }
  return { nodes: [...nodes.values()], dependencies: [...edges.values()] };
}

export interface ReviewAnchor {
  path: string;
  side: "base" | "head";
  startLine: number;
  endLine: number;
  baseSha: string;
  headSha: string;
  contentFingerprint: string;
}

export interface ReviewChapter {
  id: string;
  title: string;
  explanation: string;
  anchors: ReviewAnchor[];
}

export interface ReviewNarrative {
  id: string;
  scope: string;
  pullNumber: number;
  title: string;
  chapters: ReviewChapter[];
}

export type AnchorObservation = Pick<ReviewAnchor, "path" | "side" | "startLine" | "endLine"> & {
  contentFingerprint: string | null;
};

/** Null means not loaded; [] means a completed lookup found no anchors. */
export function chapterState(chapter: ReviewChapter, current: readonly AnchorObservation[] | null): "current" | "changed" | "missing" | "unknown" {
  if (!current || chapter.anchors.length === 0) return "unknown";
  let unknown = false;
  let missing = false;
  for (const anchor of chapter.anchors) {
    const match = current.find(item => item.path === anchor.path && item.side === anchor.side &&
      item.startLine === anchor.startLine && item.endLine === anchor.endLine);
    if (!match) { missing = true; continue; }
    if (!match.contentFingerprint || !anchor.contentFingerprint) { unknown = true; continue; }
    if (match.contentFingerprint !== anchor.contentFingerprint) return "changed";
  }
  return missing ? "missing" : unknown ? "unknown" : "current";
}

export function moveChapter(narrative: ReviewNarrative, chapterId: string, destination: number): ReviewNarrative {
  const index = narrative.chapters.findIndex(chapter => chapter.id === chapterId);
  if (index < 0 || !Number.isInteger(destination) || destination < 0 || destination >= narrative.chapters.length) {
    throw new Error("Invalid chapter move");
  }
  const chapters = [...narrative.chapters];
  chapters.splice(destination, 0, chapters.splice(index, 1)[0]);
  return { ...narrative, chapters };
}

export interface EvidenceSnapshot {
  baseSha: string;
  headSha: string;
  worktreeFingerprint: string;
}

export interface EvidenceCheck {
  id: string;
  command: string;
  outcome: "passed" | "failed" | "cancelled" | "running";
  startedAt: string;
  finishedAt: string | null;
  outputSummary: string;
  snapshot: EvidenceSnapshot;
}

export interface AgentEvidence {
  id: string;
  scope: string;
  sessionId: string;
  task: string;
  recordedAt: string;
  snapshot: EvidenceSnapshot;
  files: string[];
  checks: EvidenceCheck[];
  openIssues: string[];
}

export function evidenceState(evidence: Pick<AgentEvidence, "snapshot">, current: EvidenceSnapshot | null): "current" | "stale" | "unknown" {
  if (!current) return "unknown";
  const keys = ["baseSha", "headSha", "worktreeFingerprint"] as const;
  if (keys.some(key => !current[key] || !evidence.snapshot[key])) return "unknown";
  return keys.every(key => current[key] === evidence.snapshot[key]) ? "current" : "stale";
}

export type InitiativeStepStatus = "pending" | "running" | "done" | "failed";

export interface InitiativeStep {
  id: string;
  repository: string;
  branch: string;
  headSha: string;
  pullRequestUrl?: string;
  dependsOn: string[];
  status: InitiativeStepStatus;
  error?: string;
}

export interface ChangeInitiative {
  id: string;
  scope: string;
  name: string;
  steps: InitiativeStep[];
}

/** The returned order is a coordination plan, not an atomic Git transaction. */
export function planInitiative(initiative: ChangeInitiative): { order: string[]; ready: string[]; blocked: string[] } {
  const steps = new Map(initiative.steps.map(step => [step.id, step]));
  if (steps.size !== initiative.steps.length || initiative.steps.some(step => !step.id)) throw new Error("Duplicate or empty initiative step ID");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Initiative dependencies contain a cycle");
    if (visited.has(id)) return;
    const step = steps.get(id);
    if (!step) throw new Error("Unknown initiative dependency");
    visiting.add(id);
    for (const dependency of step.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }
  for (const step of initiative.steps) visit(step.id);
  const ready: string[] = [];
  const blocked: string[] = [];
  for (const id of order) {
    const step = steps.get(id)!;
    if (step.status === "done" || step.status === "running") continue;
    (step.dependsOn.every(dependency => steps.get(dependency)!.status === "done") ? ready : blocked).push(id);
  }
  return { order, ready, blocked };
}

export function transitionInitiative(initiative: ChangeInitiative, id: string, status: InitiativeStepStatus, error?: string): ChangeInitiative {
  const plan = planInitiative(initiative);
  const step = initiative.steps.find(item => item.id === id);
  if (!step) throw new Error("Unknown initiative step");
  if (step.status === status) return initiative;
  if (status === "running" && !plan.ready.includes(id)) throw new Error("Step dependencies are not complete");
  if ((status === "done" || status === "failed") && step.status !== "running") throw new Error("Only a running step can finish");
  if (step.status === "done" && initiative.steps.some(item => item.dependsOn.includes(id) && (item.status === "done" || item.status === "running"))) {
    throw new Error("Active or completed steps still depend on this result");
  }
  return { ...initiative, steps: initiative.steps.map(item => item.id === id ? { ...item, status, error: status === "failed" ? error : undefined } : item) };
}
