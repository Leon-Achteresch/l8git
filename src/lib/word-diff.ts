export type WordDiffSegment = {
  text: string;
  changed: boolean;
};

export type WordDiffPair = {
  del: WordDiffSegment[];
  add: WordDiffSegment[];
};

const TOKEN_RE = /[\p{L}\p{N}_]+|\s+|[^\s]/gu;

const MAX_TOKENS = 400;
const MIN_SIMILARITY = 0.25;

export function tokenizeLine(line: string): string[] {
  return line.match(TOKEN_RE) ?? [];
}

function isWhitespace(token: string): boolean {
  return token.trim().length === 0;
}

function weight(tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    if (!isWhitespace(token)) total += token.length;
  }
  return total;
}

function lcsTable(a: readonly string[], b: readonly string[]): Int32Array {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const idx = i * width + j;
      table[idx] =
        a[i] === b[j]
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[idx + 1]);
    }
  }
  return table;
}

type TokenFlag = { token: string; changed: boolean };

function mergeSegments(flags: readonly TokenFlag[]): WordDiffSegment[] {
  const out: WordDiffSegment[] = [];
  for (const flag of flags) {
    const last = out[out.length - 1];
    if (last && last.changed === flag.changed) {
      last.text += flag.token;
    } else {
      out.push({ text: flag.token, changed: flag.changed });
    }
  }
  return out;
}

export function diffWords(oldLine: string, newLine: string): WordDiffPair | null {
  if (oldLine === newLine) return null;

  const a = tokenizeLine(oldLine);
  const b = tokenizeLine(newLine);
  if (a.length === 0 || b.length === 0) return null;
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;

  const table = lcsTable(a, b);
  const width = b.length + 1;

  const delFlags: TokenFlag[] = [];
  const addFlags: TokenFlag[] = [];
  let common = 0;

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      delFlags.push({ token: a[i], changed: false });
      addFlags.push({ token: b[j], changed: false });
      if (!isWhitespace(a[i])) common += a[i].length;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      delFlags.push({ token: a[i], changed: true });
      i++;
    } else {
      addFlags.push({ token: b[j], changed: true });
      j++;
    }
  }
  while (i < a.length) {
    delFlags.push({ token: a[i], changed: true });
    i++;
  }
  while (j < b.length) {
    addFlags.push({ token: b[j], changed: true });
    j++;
  }

  const total = weight(a) + weight(b);
  if (total === 0) return null;
  const similarity = (2 * common) / total;
  if (similarity < MIN_SIMILARITY) return null;

  const del = mergeSegments(delFlags);
  const add = mergeSegments(addFlags);
  if (!del.some((s) => s.changed) && !add.some((s) => s.changed)) return null;

  return { del, add };
}

export function pairChangedLines(kinds: readonly string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let i = 0;

  while (i < kinds.length) {
    if (kinds[i] !== "del") {
      i++;
      continue;
    }
    const delStart = i;
    while (i < kinds.length && kinds[i] === "del") i++;
    const delEnd = i;
    const addStart = i;
    while (i < kinds.length && kinds[i] === "add") i++;
    const addEnd = i;

    const delCount = delEnd - delStart;
    const addCount = addEnd - addStart;
    if (delCount > 0 && delCount === addCount) {
      for (let k = 0; k < delCount; k++) {
        pairs.set(delStart + k, addStart + k);
        pairs.set(addStart + k, delStart + k);
      }
    }
  }

  return pairs;
}
