export type Commit = {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
  parents: string[];
  tags: string[];
  author_avatar?: string | null;
};

export type CommitSearchHit = {
  commit: Commit;
  matched_paths: string[];
};

export type Branch = {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  tip: string;
  behind?: number | null;
};

export type TagKind = 'lightweight' | 'annotated' | 'signed';

export type TagRef = {
  name: string;
  commit: string;
  kind: TagKind;
  message: string | null;
  tagger: string | null;
};

export type RepoInfo = {
  path: string;
  branch: string;
  commits: Commit[];
  branches: Branch[];
  tags: TagRef[];
};

export type BranchActivity = {
  name: string;
  is_remote: boolean;
  last_commit_at: string;
};

export type UpstreamSyncCounts = {
  ahead: number;
  behind: number;
};

export type StashEntry = {
  index: number;
  refname: string;
  branch: string;
  subject: string;
  date: string;
  hash: string;
  message: string;
};

export type ChangedFile = {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

export type InspectPayload = {
  header: string;
  files: ChangedFile[];
};

export type FileDiffPayload = {
  diff: string | null;
  is_binary: boolean;
};

export type MergeStrategy = 'ff' | 'ff-only' | 'no-ff' | 'squash';

export type ResetMode = 'soft' | 'mixed' | 'hard';

export type CommitHeader = {
  hash: string | null;
  refs: string[];
  author: string | null;
  authorEmail: string | null;
  authorDate: string | null;
  committer: string | null;
  commitDate: string | null;
  merge: string[];
  subject: string;
  body: string;
};

const IDENTITY = /^(.*?)\s*<([^>]*)>\s*$/;

function splitIdentity(value: string): { name: string; email: string | null } {
  const match = IDENTITY.exec(value.trim());
  if (!match) {
    return { name: value.trim(), email: null };
  }
  return { name: match[1].trim(), email: match[2].trim() || null };
}

export function parseCommitHeader(header: string | null | undefined): CommitHeader {
  const result: CommitHeader = {
    hash: null,
    refs: [],
    author: null,
    authorEmail: null,
    authorDate: null,
    committer: null,
    commitDate: null,
    merge: [],
    subject: '',
    body: '',
  };
  if (!header) {
    return result;
  }

  const message: string[] = [];
  for (const raw of header.replace(/\r\n/g, '\n').split('\n')) {
    if (raw.startsWith('    ')) {
      message.push(raw.slice(4));
      continue;
    }
    const line = raw.trim();
    if (line.startsWith('commit ')) {
      const rest = line.slice(7).trim();
      const open = rest.indexOf('(');
      if (open >= 0 && rest.endsWith(')')) {
        result.hash = rest.slice(0, open).trim();
        result.refs = rest
          .slice(open + 1, -1)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      } else {
        result.hash = rest;
      }
      continue;
    }
    if (line.startsWith('Merge:')) {
      result.merge = line.slice(6).trim().split(/\s+/).filter(Boolean);
      continue;
    }
    if (line.startsWith('Author:')) {
      const identity = splitIdentity(line.slice(7));
      result.author = identity.name;
      result.authorEmail = identity.email;
      continue;
    }
    if (line.startsWith('AuthorDate:')) {
      result.authorDate = line.slice(11).trim();
      continue;
    }
    if (line.startsWith('Commit:')) {
      result.committer = splitIdentity(line.slice(7)).name;
      continue;
    }
    if (line.startsWith('CommitDate:')) {
      result.commitDate = line.slice(11).trim();
    }
  }

  while (message.length > 0 && message[0].trim() === '') {
    message.shift();
  }
  while (message.length > 0 && message[message.length - 1].trim() === '') {
    message.pop();
  }
  result.subject = message.length > 0 ? message[0] : '';
  result.body = message.slice(1).join('\n').trim();
  return result;
}

const LOCAL_CHANGES_MARKER = '__LOCAL_CHANGES_BLOCK__|';

export function humanizeGitError(message: string): string {
  const marker = message.indexOf(LOCAL_CHANGES_MARKER);
  if (marker >= 0) {
    const files = message
      .slice(marker + LOCAL_CHANGES_MARKER.length)
      .split(',')
      .map((file) => file.trim())
      .filter(Boolean);
    const list = files.length > 0 ? ` Affected: ${files.join(', ')}` : '';
    return `Commit or stash your local changes first, then try again.${list}`;
  }
  if (message.includes('__REMOTE_CANCELED__')) {
    return 'The operation was canceled.';
  }
  return message;
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return humanizeGitError(cause.message);
  }
  if (typeof cause === 'string') {
    return humanizeGitError(cause);
  }
  return String(cause);
}

export function shortRefName(name: string): string {
  const cut = name.indexOf('/');
  return cut < 0 ? name : name.slice(cut + 1);
}

export function remoteOf(name: string): string | null {
  const cut = name.indexOf('/');
  return cut <= 0 ? null : name.slice(0, cut);
}
