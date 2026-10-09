// ──────────────────────────────────────────────────────────────────────────────
// Basic flat diff parser (used by non-interactive views)
// ──────────────────────────────────────────────────────────────────────────────

export type DiffLineKind = 'hunk' | 'add' | 'del' | 'ctx' | 'meta';

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  /** Line number in the old file (undefined for meta/hunk lines or new-only adds) */
  oldLineNo?: number;
  /** Line number in the new file (undefined for meta/hunk lines or old-only dels) */
  newLineNo?: number;
};

export function parseUnifiedDiff(text: string): DiffLine[] {
  const lines = text.split('\n');
  const out: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;
  let numbered = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      numbered = true;
      // Parse hunk header: @@ -oldStart[,oldCount] +newStart[,newCount] @@
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
      }
      out.push({ kind: 'hunk', text: line });
    } else if (
      (!numbered && (line.startsWith('+++ ') || line.startsWith('--- '))) ||
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('similarity ') ||
      line.startsWith('rename ')
    ) {
      if (line.startsWith('diff ')) numbered = false;
      out.push({ kind: 'meta', text: line });
    } else if (line.startsWith('+')) {
      out.push({ kind: 'add', text: line.slice(1), newLineNo: numbered ? newLine : undefined });
      newLine++;
    } else if (line.startsWith('-')) {
      out.push({ kind: 'del', text: line.slice(1), oldLineNo: numbered ? oldLine : undefined });
      oldLine++;
    } else if (line.startsWith('\\')) {
      out.push({ kind: 'meta', text: line });
    } else if (line.startsWith(' ')) {
      out.push({
        kind: 'ctx',
        text: line.slice(1),
        oldLineNo: numbered ? oldLine : undefined,
        newLineNo: numbered ? newLine : undefined,
      });
      oldLine++;
      newLine++;
    } else {
      out.push({ kind: 'ctx', text: line });
    }
  }
  return out;
}

export function linesFromUntracked(content: string): DiffLine[] {
  return content.split('\n').map(text => ({ kind: 'add' as const, text }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Structured diff types (for interactive hunk / line staging)
// ──────────────────────────────────────────────────────────────────────────────

export type ParsedHunkLine = {
  kind: 'add' | 'del' | 'ctx';
  /** Original raw line including the leading +/-/space character. */
  raw: string;
  /** Display text without the leading prefix character. */
  text: string;
};

export type ParsedHunk = {
  /** The raw @@ header line. */
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: ParsedHunkLine[];
};

export type ParsedDiff = {
  /** All lines before the first @@ (diff --git, index, ---, +++ …). */
  metaLines: string[];
  hunks: ParsedHunk[];
};

/**
 * Interactive diff line – a flat representation of ParsedDiff for the
 * virtualizer.  Each entry knows which hunk (and position within it) it
 * belongs to so that the UI can build per-hunk or per-line patches.
 */
export type InteractiveDiffLine =
  | { kind: 'meta'; text: string }
  | { kind: 'hunk'; text: string; hunkIdx: number }
  | {
      kind: 'ctx' | 'add' | 'del';
      text: string;
      hunkIdx: number;
      hunkLineIdx: number;
    };

// ──────────────────────────────────────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────────────────────────────────────

function parseHunkHeader(header: string): {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
} {
  const m = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!m) return { oldStart: 1, oldCount: 0, newStart: 1, newCount: 0 };
  return {
    oldStart: parseInt(m[1], 10),
    oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
    newStart: parseInt(m[3], 10),
    newCount: m[4] !== undefined ? parseInt(m[4], 10) : 1,
  };
}

/**
 * Parse a unified diff string into a structured `ParsedDiff`.
 * Handles single-file diffs as produced by `git diff --no-color -- <file>`.
 */
export function parseDiffWithHunks(text: string): ParsedDiff {
  // Git uses LF for diff framing; a CR before it belongs to the file data.
  const rawLines = text.split('\n');
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();
  const metaLines: string[] = [];
  const hunks: ParsedHunk[] = [];
  let currentHunk: ParsedHunk | null = null;

  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      const { oldStart, oldCount, newStart, newCount } = parseHunkHeader(line);
      currentHunk = { header: line, oldStart, oldCount, newStart, newCount, lines: [] };
    } else if (currentHunk) {
      // Inside a hunk
      if (line.startsWith('+')) {
        currentHunk.lines.push({ kind: 'add', raw: line, text: line.slice(1) });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ kind: 'del', raw: line, text: line.slice(1) });
      } else if (line.startsWith('\\')) {
        // Keep the marker next to its payload line for display and patch building.
        currentHunk.lines.push({ kind: 'ctx', raw: line, text: line });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ kind: 'ctx', raw: line, text: line.slice(1) });
      } else if (line.startsWith('diff ') || line.startsWith('index ')) {
        // Second file in diff – push current hunk and reset
        hunks.push(currentHunk);
        currentHunk = null;
        metaLines.push(line);
      } else {
        // Empty line or other – treat as context
        currentHunk.lines.push({ kind: 'ctx', raw: ' ', text: '' });
      }
    } else {
      // Before the first @@ → meta header
      metaLines.push(line);
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  return { metaLines, hunks };
}

/**
 * Convert a `ParsedDiff` to a flat array of `InteractiveDiffLine` values
 * suitable for rendering with the virtualizer.
 */
export function flattenParsedDiff(parsed: ParsedDiff): InteractiveDiffLine[] {
  const out: InteractiveDiffLine[] = [];

  for (const meta of parsed.metaLines) {
    if (meta.trim()) out.push({ kind: 'meta', text: meta });
  }

  for (let hunkIdx = 0; hunkIdx < parsed.hunks.length; hunkIdx++) {
    const hunk = parsed.hunks[hunkIdx];
    out.push({ kind: 'hunk', text: hunk.header, hunkIdx });
    for (let lineIdx = 0; lineIdx < hunk.lines.length; lineIdx++) {
      const l = hunk.lines[lineIdx];
      out.push({ kind: l.kind, text: l.text, hunkIdx, hunkLineIdx: lineIdx });
    }
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Patch building
// ──────────────────────────────────────────────────────────────────────────────

type PatchLine = {
  kind: 'add' | 'del' | 'ctx';
  text: string;
  noNewline: boolean;
};

function fileHeaders(
  metaLines: string[],
  direction: 'stage' | 'discard',
  newCount: number,
  reverseOutput: boolean,
): string[] {
  const oldPath = metaLines.find(line => line.startsWith('--- '))?.slice(4);
  const newPath = metaLines.find(line => line.startsWith('+++ '))?.slice(4);
  const created = oldPath === '/dev/null';
  const deleted = newPath === '/dev/null';
  const sidePath = (value: string | undefined, side: 'a' | 'b') =>
    value?.replace(/^("?)[ab]\//, `$1${side}/`);
  const namedOld = created ? sidePath(newPath, 'a') : oldPath;
  const namedNew = deleted ? sidePath(oldPath, 'b') : newPath;
  let source = direction === 'stage' ? namedOld : sidePath(namedNew, 'a');
  let target = direction === 'stage' ? namedNew : sidePath(namedOld, 'b');
  let sourceExists = direction === 'stage' ? !created : !deleted;
  let targetExists = direction === 'stage' ? !deleted || newCount > 0 : !created || newCount > 0;
  if (reverseOutput) {
    [source, target] = [sidePath(target, 'a'), sidePath(source, 'b')];
    [sourceExists, targetExists] = [targetExists, sourceExists];
  }

  const headers = metaLines.filter(line => line.startsWith('diff --git '));
  const modeHeader = metaLines.find(line => /^(new file mode|deleted file mode) /.test(line));
  const mode = modeHeader?.slice(modeHeader.lastIndexOf(' ') + 1);
  if (!sourceExists && targetExists && mode) headers.push(`new file mode ${mode}`);
  if (sourceExists && !targetExists && mode) headers.push(`deleted file mode ${mode}`);
  // A partial patch has different blob hashes. Let Git derive the new object
  // rather than carrying the original whole-file index metadata.
  if (source) headers.push(`--- ${sourceExists ? source : '/dev/null'}`);
  if (target) headers.push(`+++ ${targetExists ? target : '/dev/null'}`);
  return headers;
}

/** Build a patch string for an entire hunk, usable with `--cached` or `--reverse`. */
export function buildHunkPatch(parsed: ParsedDiff, hunkIdx: number): string {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return '';
  return buildPartialHunkPatch(parsed, hunkIdx, new Set(hunk.lines.map((_, index) => index))) ?? '';
}

function buildPartialPatch(
  parsed: ParsedDiff,
  hunkIdx: number,
  selectedLineIndices: ReadonlySet<number>,
  direction: 'stage' | 'discard',
  reverseOutput = false,
): string | null {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return null;
  if (![...selectedLineIndices].some(index => {
    const line = hunk.lines[index];
    return line && (line.kind === 'add' || line.kind === 'del');
  })) return null;

  const body: PatchLine[] = [];
  let previous: PatchLine | undefined;
  for (let index = 0; index < hunk.lines.length; index++) {
    const line = hunk.lines[index];
    if (line.raw.startsWith('\\')) {
      if (previous) previous.noNewline = true;
      continue;
    }
    const selected = selectedLineIndices.has(index);
    let kind: PatchLine['kind'] | undefined;
    if (line.kind === 'ctx') kind = 'ctx';
    else if (direction === 'stage') {
      if (line.kind === 'del') kind = selected ? 'del' : 'ctx';
      else if (selected) kind = 'add';
    } else {
      if (line.kind === 'add') kind = selected ? 'del' : 'ctx';
      else if (selected) kind = 'add';
    }
    previous = kind ? { kind, text: line.text, noNewline: false } : undefined;
    if (previous) body.push(previous);
  }

  // A restored EOF line can precede an unselected line. Terminate the restored
  // line while preserving the unselected final line's missing newline.
  let lastOld = -1;
  let lastNew = -1;
  for (let index = 0; index < body.length; index++) {
    if (body[index].kind !== 'add') lastOld = index;
    if (body[index].kind !== 'del') lastNew = index;
  }
  const normalized: PatchLine[] = [];
  for (let index = 0; index < body.length; index++) {
    const line = body[index];
    const oldNoNewline = line.noNewline && index === lastOld;
    const newNoNewline = line.noNewline && index === lastNew;
    if (line.kind === 'ctx' && oldNoNewline !== newNoNewline) {
      normalized.push({ ...line, kind: 'del', noNewline: oldNoNewline });
      normalized.push({ ...line, kind: 'add', noNewline: newNoNewline });
    } else {
      normalized.push({ ...line, noNewline: line.kind === 'del' ? oldNoNewline : newNoNewline });
    }
  }

  let oldCount = normalized.filter(line => line.kind !== 'add').length;
  let newCount = normalized.filter(line => line.kind !== 'del').length;
  let oldStart = direction === 'stage' ? hunk.oldStart : hunk.newStart;
  let newStart = oldStart + (oldCount === 0 ? 1 : newCount === 0 ? -1 : 0);
  const headers = fileHeaders(parsed.metaLines, direction, newCount, reverseOutput);
  if (reverseOutput) {
    [oldCount, newCount] = [newCount, oldCount];
    [oldStart, newStart] = [newStart, oldStart];
  }
  const lines = normalized.flatMap(line => {
    const kind = reverseOutput && line.kind !== 'ctx' ? line.kind === 'add' ? 'del' : 'add' : line.kind;
    const prefix = kind === 'add' ? '+' : kind === 'del' ? '-' : ' ';
    return line.noNewline ? [prefix + line.text, '\\ No newline at end of file'] : [prefix + line.text];
  });
  return [...headers, `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...lines, ''].join('\n');
}

/**
 * Stage selected lines from an index→worktree diff. For unstaging, pass `reverse`
 * so the selection targets the current index and apply the result with `--reverse`.
 * Returns null when no addition or deletion is selected.
 */
export function buildPartialHunkPatch(
  parsed: ParsedDiff,
  hunkIdx: number,
  selectedLineIndices: ReadonlySet<number>,
  reverse = false,
): string | null {
  return buildPartialPatch(parsed, hunkIdx, selectedLineIndices, reverse ? 'discard' : 'stage', reverse);
}

/**
 * Build patches for all hunks that have at least one selected line.
 * Returns one patch string per hunk (to be applied sequentially).
 *
 * `selectedKeys` format: `"<hunkIdx>:<hunkLineIdx>"`
 */
export function buildPatchesForSelection(
  parsed: ParsedDiff,
  selectedKeys: ReadonlySet<string>,
  reverse = false,
): string[] {
  const byHunk = new Map<number, Set<number>>();
  for (const key of selectedKeys) {
    const [h, l] = key.split(':').map(Number);
    if (!byHunk.has(h)) byHunk.set(h, new Set());
    byHunk.get(h)!.add(l);
  }

  const patches: string[] = [];
  for (const [hunkIdx, lineIndices] of [...byHunk.entries()].sort(([a], [b]) => a - b)) {
    const patch = buildPartialHunkPatch(parsed, hunkIdx, lineIndices, reverse);
    if (patch) patches.push(patch);
  }
  return patches;
}

/**
 * Build a patch for discarding selected lines from the working tree.
 *
 * The input diff is an unstaged diff (index → working tree):
 *   - `del` lines exist in the index but NOT in the working tree
 *   - `add` lines exist in the working tree but NOT in the index
 *
 * The resulting patch targets the working tree directly (no --cached, no --reverse):
 *   - Selected `del` lines → `+line` (restore from index into working tree)
 *   - Unselected `del` lines → skipped (not present in working tree)
 *   - Selected `add` lines → `-line` (remove from working tree)
 *   - Unselected `add` lines → context (stay in working tree)
 *   - `ctx` lines → context
 *
 * The hunk header uses `newStart` (working tree position) as the anchor.
 */
export function buildPatchesForDiscard(
  parsed: ParsedDiff,
  selectedKeys: ReadonlySet<string>,
): string[] {
  const byHunk = new Map<number, Set<number>>();
  for (const key of selectedKeys) {
    const [h, l] = key.split(':').map(Number);
    if (!byHunk.has(h)) byHunk.set(h, new Set());
    byHunk.get(h)!.add(l);
  }

  const patches: string[] = [];
  for (const [hunkIdx, lineIndices] of [...byHunk.entries()].sort(([a], [b]) => a - b)) {
    const patch = buildPartialPatch(parsed, hunkIdx, lineIndices, 'discard');
    if (patch) patches.push(patch);
  }
  return patches;
}
