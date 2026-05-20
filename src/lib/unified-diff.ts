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
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart[,oldCount] +newStart[,newCount] @@
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
      }
      out.push({ kind: 'hunk', text: line });
    } else if (
      line.startsWith('+++ ') ||
      line.startsWith('--- ') ||
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('similarity ') ||
      line.startsWith('rename ')
    ) {
      out.push({ kind: 'meta', text: line });
    } else if (line.startsWith('+')) {
      out.push({ kind: 'add', text: line.slice(1), newLineNo: newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      out.push({ kind: 'del', text: line.slice(1), oldLineNo: oldLine });
      oldLine++;
    } else if (line.startsWith('\\')) {
      out.push({ kind: 'meta', text: line });
    } else if (line.startsWith(' ')) {
      out.push({ kind: 'ctx', text: line.slice(1), oldLineNo: oldLine, newLineNo: newLine });
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
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
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
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.lines.push({ kind: 'add', raw: line, text: line.slice(1) });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.lines.push({ kind: 'del', raw: line, text: line.slice(1) });
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" – treat as meta, don't include in patch
        // body but keep for display by appending to the hunk's lines as ctx
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

/** Extract the minimal file-header lines needed for `git apply --cached`. */
function extractFileHeaders(metaLines: string[]): string[] {
  return metaLines.filter(
    l =>
      l.startsWith('diff ') ||
      l.startsWith('index ') ||
      l.startsWith('--- ') ||
      l.startsWith('+++ '),
  );
}

/**
 * Build a patch string for an entire hunk.
 * The result can be piped to `git apply --cached` (or `--reverse`).
 */
export function buildHunkPatch(parsed: ParsedDiff, hunkIdx: number): string {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return '';

  const parts = [
    ...extractFileHeaders(parsed.metaLines),
    hunk.header,
    ...hunk.lines.map(l => l.raw),
    '', // trailing newline
  ];
  return parts.join('\n');
}

/**
 * Build a partial patch for a subset of lines within a single hunk.
 *
 * Rules (for staging from an unstaged diff, i.e. index→worktree):
 *  - Selected `+` lines → kept as additions in the patch
 *  - Unselected `+` lines → omitted entirely (stay only in working tree)
 *  - Selected `-` lines → kept as deletions in the patch
 *  - Unselected `-` lines → converted to context (not staged for deletion)
 *  - `ctx` lines → always kept as context
 *
 * The same patch, applied with `--reverse`, correctly unstages selected lines
 * from a staged diff (HEAD→index).
 *
 * Returns `null` when no actionable lines are selected.
 */
export function buildPartialHunkPatch(
  parsed: ParsedDiff,
  hunkIdx: number,
  selectedLineIndices: ReadonlySet<number>,
): string | null {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return null;

  // Verify at least one +/- line is selected
  const hasChange = [...selectedLineIndices].some(i => {
    const l = hunk.lines[i];
    return l && (l.kind === 'add' || l.kind === 'del');
  });
  if (!hasChange) return null;

  const bodyLines: string[] = [];
  let oldCount = 0;
  let newCount = 0;

  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i];
    const selected = selectedLineIndices.has(i);

    if (line.kind === 'ctx') {
      bodyLines.push(line.raw);
      oldCount++;
      newCount++;
    } else if (line.kind === 'del') {
      if (selected) {
        // Stage this deletion
        bodyLines.push(line.raw);
        oldCount++;
      } else {
        // Convert to context: keep this line in the index as-is
        bodyLines.push(' ' + line.text);
        oldCount++;
        newCount++;
      }
    } else if (line.kind === 'add') {
      if (selected) {
        // Stage this addition
        bodyLines.push(line.raw);
        newCount++;
      }
      // Unselected additions are simply skipped (don't appear in patch)
    }
  }

  const newHeader = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`;

  return [
    ...extractFileHeaders(parsed.metaLines),
    newHeader,
    ...bodyLines,
    '', // trailing newline
  ].join('\n');
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
): string[] {
  const byHunk = new Map<number, Set<number>>();
  for (const key of selectedKeys) {
    const [h, l] = key.split(':').map(Number);
    if (!byHunk.has(h)) byHunk.set(h, new Set());
    byHunk.get(h)!.add(l);
  }

  const patches: string[] = [];
  for (const [hunkIdx, lineIndices] of [...byHunk.entries()].sort(([a], [b]) => a - b)) {
    const patch = buildPartialHunkPatch(parsed, hunkIdx, lineIndices);
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
function buildPartialHunkPatchForDiscard(
  parsed: ParsedDiff,
  hunkIdx: number,
  selectedLineIndices: ReadonlySet<number>,
): string | null {
  const hunk = parsed.hunks[hunkIdx];
  if (!hunk) return null;

  const hasChange = [...selectedLineIndices].some(i => {
    const l = hunk.lines[i];
    return l && (l.kind === 'add' || l.kind === 'del');
  });
  if (!hasChange) return null;

  const bodyLines: string[] = [];
  let oldCount = 0;
  let newCount = 0;

  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i];
    const selected = selectedLineIndices.has(i);

    if (line.kind === 'ctx') {
      bodyLines.push(line.raw);
      oldCount++;
      newCount++;
    } else if (line.kind === 'del') {
      if (selected) {
        bodyLines.push('+' + line.text);
        newCount++;
      }
      // Unselected del lines don't exist in working tree — skip entirely
    } else if (line.kind === 'add') {
      if (selected) {
        bodyLines.push('-' + line.text);
        oldCount++;
      } else {
        bodyLines.push(' ' + line.text);
        oldCount++;
        newCount++;
      }
    }
  }

  const newHeader = `@@ -${hunk.newStart},${oldCount} +${hunk.newStart},${newCount} @@`;

  return [
    ...extractFileHeaders(parsed.metaLines),
    newHeader,
    ...bodyLines,
    '',
  ].join('\n');
}

/**
 * Build discard patches for all hunks that have at least one selected line.
 * The patches target the working tree (apply without --cached or --reverse).
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
    const patch = buildPartialHunkPatchForDiscard(parsed, hunkIdx, lineIndices);
    if (patch) patches.push(patch);
  }
  return patches;
}
