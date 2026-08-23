import { parseDiffWithHunks, type ParsedDiff } from '@desktop/lib/unified-diff';

export type DiffFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export type DiffRowKind = 'hunk' | 'add' | 'del' | 'ctx' | 'meta';

export type DiffRow = {
  kind: DiffRowKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export type DiffFile = {
  id: string;
  path: string;
  oldPath: string | null;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  hunkCount: number;
  rows: DiffRow[];
};

const FILE_SPLIT = /^diff --(?:git|cc) /;
const GIT_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const PLUS_HEADER = /^\+\+\+ (?:b\/)?(.*)$/;
const MINUS_HEADER = /^--- (?:a\/)?(.*)$/;
const RENAME_TO = /^rename to (.+)$/;
const RENAME_FROM = /^rename from (.+)$/;
const COPY_FROM = /^copy from (.+)$/;

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function statusFromMeta(meta: readonly string[]): DiffFileStatus {
  for (const line of meta) {
    if (line.startsWith('new file mode')) {
      return 'A';
    }
    if (line.startsWith('deleted file mode')) {
      return 'D';
    }
    if (RENAME_TO.test(line)) {
      return 'R';
    }
    if (COPY_FROM.test(line)) {
      return 'C';
    }
    if (line.startsWith('old mode') || line.startsWith('new mode')) {
      return 'T';
    }
  }
  return 'M';
}

function pathsFromMeta(meta: readonly string[]): { path: string; oldPath: string | null } {
  let path = '';
  let oldPath: string | null = null;

  for (const line of meta) {
    const git = GIT_HEADER.exec(line);
    if (git) {
      oldPath = unquote(git[1]);
      path = unquote(git[2]);
      continue;
    }
    const renameTo = RENAME_TO.exec(line);
    if (renameTo) {
      path = unquote(renameTo[1]);
      continue;
    }
    const renameFrom = RENAME_FROM.exec(line) ?? COPY_FROM.exec(line);
    if (renameFrom) {
      oldPath = unquote(renameFrom[1]);
      continue;
    }
    const plus = PLUS_HEADER.exec(line);
    if (plus && plus[1] !== '/dev/null') {
      path = unquote(plus[1]);
      continue;
    }
    const minus = MINUS_HEADER.exec(line);
    if (minus && minus[1] !== '/dev/null' && !oldPath) {
      oldPath = unquote(minus[1]);
    }
  }

  if (!path && oldPath) {
    path = oldPath;
  }
  return { path, oldPath: oldPath === path ? null : oldPath };
}

function isBinaryMeta(meta: readonly string[]): boolean {
  return meta.some(
    (line) => line.startsWith('Binary files ') || line.startsWith('GIT binary patch')
  );
}

function rowsFromParsed(parsed: ParsedDiff): {
  rows: DiffRow[];
  additions: number;
  deletions: number;
} {
  const rows: DiffRow[] = [];
  let additions = 0;
  let deletions = 0;

  for (const hunk of parsed.hunks) {
    rows.push({ kind: 'hunk', text: hunk.header, oldNo: null, newNo: null });
    let oldNo = hunk.oldStart;
    let newNo = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.raw.startsWith('\\')) {
        rows.push({ kind: 'meta', text: line.text, oldNo: null, newNo: null });
        continue;
      }
      if (line.kind === 'add') {
        rows.push({ kind: 'add', text: line.text, oldNo: null, newNo });
        newNo += 1;
        additions += 1;
      } else if (line.kind === 'del') {
        rows.push({ kind: 'del', text: line.text, oldNo, newNo: null });
        oldNo += 1;
        deletions += 1;
      } else {
        rows.push({ kind: 'ctx', text: line.text, oldNo, newNo });
        oldNo += 1;
        newNo += 1;
      }
    }
  }

  return { rows, additions, deletions };
}

function chunkToFile(chunk: string, index: number): DiffFile {
  const parsed = parseDiffWithHunks(chunk);
  const meta = parsed.metaLines;
  const { path, oldPath } = pathsFromMeta(meta);
  const { rows, additions, deletions } = rowsFromParsed(parsed);
  const binary = isBinaryMeta(meta);

  return {
    id: `${index}:${path || 'diff'}`,
    path: path || 'diff',
    oldPath,
    status: statusFromMeta(meta),
    additions,
    deletions,
    binary,
    hunkCount: parsed.hunks.length,
    rows,
  };
}

export function splitDiffChunks(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (FILE_SPLIT.test(lines[index])) {
      starts.push(index);
    }
  }
  if (starts.length === 0) {
    return text.trim() ? [lines.join('\n')] : [];
  }
  const chunks: string[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index];
    const to = index + 1 < starts.length ? starts[index + 1] : lines.length;
    chunks.push(lines.slice(from, to).join('\n'));
  }
  return chunks;
}

export function parseDiffFiles(text: string | null | undefined): DiffFile[] {
  if (!text || !text.trim()) {
    return [];
  }
  return splitDiffChunks(text).map(chunkToFile);
}

export function untrackedDiffFile(path: string, content: string): DiffFile {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const rows: DiffRow[] = lines.map((text, index) => ({
    kind: 'add' as const,
    text,
    oldNo: null,
    newNo: index + 1,
  }));

  return {
    id: `untracked:${path}`,
    path,
    oldPath: null,
    status: 'A',
    additions: rows.length,
    deletions: 0,
    binary: false,
    hunkCount: rows.length > 0 ? 1 : 0,
    rows: rows.length > 0 ? [{ kind: 'hunk', text: `@@ -0,0 +1,${rows.length} @@`, oldNo: null, newNo: null }, ...rows] : rows,
  };
}

export function diffTotals(files: readonly DiffFile[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { additions, deletions };
}
