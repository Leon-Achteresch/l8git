import type { PullRequest, RebaseStatus } from "@/lib/repo-store";

export type StackCommit = {
  hash: string;
  short_hash: string;
  subject: string;
};

export type StackBranch = {
  name: string;
  parent: string;
  level: number;
  exists: boolean;
  parent_exists: boolean;
  broken: boolean;
  is_current: boolean;
  ahead: number;
  behind: number;
  needs_restack: boolean;
  tip: string;
  short_tip: string;
  last_commit_at: string;
  upstream: string | null;
  commit_count: number;
  commits: StackCommit[];
};

export type Stack = {
  root: string;
  root_exists: boolean;
  root_tip: string;
  broken: boolean;
  needs_restack: boolean;
  branches: StackBranch[];
};

export type StackList = {
  default_branch: string;
  current_branch: string | null;
  stacks: Stack[];
  cycles: string[][];
  has_cycle: boolean;
  has_broken: boolean;
  errors: string[];
};

export type StackRestackStep = {
  branch: string;
  parent: string;
  old_base: string;
};

export type StackRestackPlan = {
  branch: string;
  original_branch: string | null;
  done: string[];
  skipped: string[];
  current: StackRestackStep | null;
  pending: StackRestackStep[];
};

export type StackRestackState = {
  active: boolean;
  rebase_in_progress: boolean;
  plan: StackRestackPlan | null;
};

export type StackRestackStatus = "completed" | "conflict" | "noop";

export type StackRestackResult = {
  status: StackRestackStatus;
  message: string;
  branch: string;
  restacked: string[];
  skipped: string[];
  current: StackRestackStep | null;
  pending: StackRestackStep[];
  state: RebaseStatus;
};

export const EMPTY_STACK_LIST: StackList = {
  default_branch: "",
  current_branch: null,
  stacks: [],
  cycles: [],
  has_cycle: false,
  has_broken: false,
  errors: [],
};

export const EMPTY_RESTACK_STATE: StackRestackState = {
  active: false,
  rebase_in_progress: false,
  plan: null,
};

export function stackChain(stack: Stack): StackBranch[] {
  const byName = new Map(stack.branches.map((b) => [b.name, b]));
  const childrenOf = new Map<string, StackBranch[]>();
  for (const b of stack.branches) {
    const parentKey = byName.has(b.parent) ? b.parent : stack.root;
    const list = childrenOf.get(parentKey);
    if (list) list.push(b);
    else childrenOf.set(parentKey, [b]);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, z) => a.level - z.level || a.name.localeCompare(z.name));
  }

  const ordered: StackBranch[] = [];
  const seen = new Set<string>();
  const walk = (parent: string) => {
    for (const child of childrenOf.get(parent) ?? []) {
      if (seen.has(child.name)) continue;
      seen.add(child.name);
      ordered.push(child);
      walk(child.name);
    }
  };
  walk(stack.root);

  for (const b of stack.branches) {
    if (seen.has(b.name)) continue;
    seen.add(b.name);
    ordered.push(b);
  }
  return ordered;
}

export function stackChainTopDown(stack: Stack): StackBranch[] {
  return stackChain(stack).slice().reverse();
}

export function stackRestackTargets(stack: Stack): string[] {
  const names = new Set(stack.branches.map((b) => b.name));
  const roots = stack.branches
    .filter((b) => !names.has(b.parent))
    .map((b) => b.name);
  return [...new Set(roots)].sort((a, b) => a.localeCompare(b));
}

export function stackNeedsRestack(stack: Stack): boolean {
  return stack.needs_restack || stack.branches.some((b) => b.needs_restack);
}

export function stackIsBroken(stack: Stack): boolean {
  return stack.broken || !stack.root_exists || stack.branches.some((b) => b.broken);
}

export function totalStackBranches(list: StackList): number {
  return list.stacks.reduce((sum, s) => sum + s.branches.length, 0);
}

export type StackLabel = {
  root: string;
  level: number;
  size: number;
  needsRestack: boolean;
};

export function stackLabels(list: StackList): Map<string, StackLabel> {
  const labels = new Map<string, StackLabel>();
  for (const stack of list.stacks) {
    const chain = stackChain(stack);
    for (const branch of chain) {
      if (!branch.exists) continue;
      labels.set(branch.name, {
        root: stack.root,
        level: branch.level,
        size: chain.length,
        needsRestack: branch.needs_restack,
      });
    }
  }
  return labels;
}

export function branchTitleSuggestion(branch: StackBranch): string {
  const first = branch.commits[branch.commits.length - 1];
  const subject = first?.subject?.trim();
  if (subject) return subject;
  const top = branch.commits[0]?.subject?.trim();
  if (top) return top;
  return branch.name;
}

export type PrChainStatus =
  | "planned"
  | "existing"
  | "created"
  | "failed"
  | "skipped";

export type PrChainEntry = {
  branch: string;
  parent: string;
  level: number;
  title: string;
  status: PrChainStatus;
  ahead: number;
  prNumber: number | null;
  prUrl: string | null;
  error: string | null;
};

function normalizeBranchName(name: string): string {
  return name.replace(/^refs\/heads\//, "").trim();
}

export function findExistingPr(
  prs: readonly PullRequest[],
  branch: string,
  parent: string,
): PullRequest | null {
  const head = normalizeBranchName(branch);
  const base = normalizeBranchName(parent);
  const open = prs.filter((pr) => {
    const state = pr.state.trim().toLowerCase();
    if (state === "closed" || state === "merged" || state === "declined") return false;
    return normalizeBranchName(pr.source_branch) === head;
  });
  if (open.length === 0) return null;
  return (
    open.find((pr) => normalizeBranchName(pr.target_branch) === base) ?? open[0]
  );
}

export function buildPrChain(
  stack: Stack,
  prs: readonly PullRequest[],
): PrChainEntry[] {
  return stackChain(stack)
    .filter((branch) => branch.exists && branch.parent_exists)
    .map((branch) => {
      const existing = findExistingPr(prs, branch.name, branch.parent);
      return {
        branch: branch.name,
        parent: branch.parent,
        level: branch.level,
        title: existing ? existing.title : branchTitleSuggestion(branch),
        status: existing ? ("existing" as const) : ("planned" as const),
        ahead: branch.ahead,
        prNumber: existing ? existing.number : null,
        prUrl: existing ? existing.html_url : null,
        error: null,
      };
    });
}

export function submittableChainEntries(entries: readonly PrChainEntry[]): PrChainEntry[] {
  return entries.filter((e) => e.status === "planned" || e.status === "failed");
}

export function updateChainEntry(
  entries: readonly PrChainEntry[],
  branch: string,
  patch: Partial<PrChainEntry>,
): PrChainEntry[] {
  return entries.map((e) => (e.branch === branch ? { ...e, ...patch } : e));
}

export function markChainFailure(
  entries: readonly PrChainEntry[],
  branch: string,
  error: string,
): PrChainEntry[] {
  const idx = entries.findIndex((e) => e.branch === branch);
  if (idx < 0) return entries.slice();
  return entries.map((entry, i) => {
    if (i === idx) return { ...entry, status: "failed", error };
    if (i < idx) return entry;
    if (entry.status === "existing" || entry.status === "created") return entry;
    return { ...entry, status: "skipped", error: null };
  });
}

export function chainSummary(entries: readonly PrChainEntry[]): {
  created: number;
  existing: number;
  failed: number;
  skipped: number;
  planned: number;
} {
  let created = 0;
  let existing = 0;
  let failed = 0;
  let skipped = 0;
  let planned = 0;
  for (const e of entries) {
    if (e.status === "created") created += 1;
    else if (e.status === "existing") existing += 1;
    else if (e.status === "failed") failed += 1;
    else if (e.status === "skipped") skipped += 1;
    else planned += 1;
  }
  return { created, existing, failed, skipped, planned };
}
