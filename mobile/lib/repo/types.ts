export type StatusEntry = {
  path: string;
  index_status: string;
  worktree_status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  additions_staged: number;
  deletions_staged: number;
  additions_unstaged: number;
  deletions_unstaged: number;
  binary: boolean;
  embedded_repo: boolean;
};

export type UpstreamSyncCounts = {
  ahead: number;
  behind: number;
};

export type RepoFullStatus = {
  entries: StatusEntry[];
  upstream_sync: UpstreamSyncCounts;
  has_upstream: boolean;
};

export type RepoOverview = {
  path: string;
  name: string;
  branch: string;
  ahead: number;
  behind: number;
  dirty_count: number;
  last_commit_at: number | null;
  commits_last_30d: number[];
  error: string | null;
};

export type FileDiffResponse = {
  staged: string | null;
  unstaged: string | null;
  untracked_plain: string | null;
  is_binary: boolean;
};

export type GitRemoteRow = {
  name: string;
  url: string;
};

export type HeadCommit = {
  hash: string;
  short_hash: string;
  subject: string;
  body: string;
};

export function commitMessageOf(commit: HeadCommit | null | undefined): string {
  if (!commit) {
    return '';
  }
  const body = commit.body.trim();
  return body ? `${commit.subject}\n\n${body}` : commit.subject;
}

export type ChangeSector = 'conflict' | 'staged' | 'unstaged' | 'untracked';

export type ChangeItem = {
  key: string;
  path: string;
  sector: ChangeSector;
  status: string;
  additions: number;
  deletions: number;
  entry: StatusEntry;
};

export type ChangeSections = {
  conflicts: ChangeItem[];
  staged: ChangeItem[];
  unstaged: ChangeItem[];
  untracked: ChangeItem[];
  total: number;
};

export const EMPTY_SECTIONS: ChangeSections = {
  conflicts: [],
  staged: [],
  unstaged: [],
  untracked: [],
  total: 0,
};

const CONFLICT_PAIRS = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

export function isConflict(entry: StatusEntry): boolean {
  return CONFLICT_PAIRS.has(`${entry.index_status}${entry.worktree_status}`);
}

function code(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function itemFor(entry: StatusEntry, sector: ChangeSector): ChangeItem {
  const staged = sector === 'staged';
  return {
    key: `${sector}:${entry.path}`,
    path: entry.path,
    sector,
    status:
      sector === 'conflict'
        ? 'U'
        : sector === 'untracked'
          ? '?'
          : staged
            ? code(entry.index_status, 'M')
            : code(entry.worktree_status, 'M'),
    additions: staged ? entry.additions_staged : entry.additions_unstaged,
    deletions: staged ? entry.deletions_staged : entry.deletions_unstaged,
    entry,
  };
}

export function buildSections(entries: readonly StatusEntry[] | undefined): ChangeSections {
  if (!entries || entries.length === 0) {
    return EMPTY_SECTIONS;
  }
  const conflicts: ChangeItem[] = [];
  const staged: ChangeItem[] = [];
  const unstaged: ChangeItem[] = [];
  const untracked: ChangeItem[] = [];

  for (const entry of entries) {
    if (isConflict(entry)) {
      conflicts.push(itemFor(entry, 'conflict'));
      continue;
    }
    if (entry.staged) {
      staged.push(itemFor(entry, 'staged'));
    }
    if (entry.untracked) {
      untracked.push(itemFor(entry, 'untracked'));
    } else if (entry.unstaged) {
      unstaged.push(itemFor(entry, 'unstaged'));
    }
  }

  return {
    conflicts,
    staged,
    unstaged,
    untracked,
    total: conflicts.length + staged.length + unstaged.length + untracked.length,
  };
}

export function dirtyCount(entries: readonly StatusEntry[] | undefined): number {
  return entries?.length ?? 0;
}
