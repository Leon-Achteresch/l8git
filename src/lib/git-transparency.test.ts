import { describe, expect, it } from 'vitest';

import {
  formatDurationMs,
  formatGitCommand,
  mergeCommandEntries,
  quoteArg,
  type GitCommandEntry,
} from '@/lib/git-command-log';
import {
  isReflogSelector,
  parseLocalChangesBlock,
  parseUndoUnsupported,
  reflogActionTone,
  undoDescriptionKey,
} from '@/lib/reflog-format';

function entry(seq: number, args: string[] = ['status']): GitCommandEntry {
  return {
    seq,
    repoPath: '/repo',
    args,
    exitOk: true,
    durationMs: 12,
    startedAt: '2026-08-15T12:00:00.000Z',
  };
}

describe('formatGitCommand', () => {
  it('prefixes git and joins the masked args', () => {
    expect(formatGitCommand(['status', '--porcelain=v2'])).toBe(
      'git status --porcelain=v2',
    );
  });

  it('quotes args with whitespace and escapes quotes', () => {
    expect(formatGitCommand(['commit', '-m', 'hello world'])).toBe(
      'git commit -m "hello world"',
    );
    expect(quoteArg('say "hi"')).toBe('"say \\"hi\\""');
    expect(quoteArg('')).toBe('""');
  });

  it('falls back to bare git for an empty arg list', () => {
    expect(formatGitCommand([])).toBe('git');
  });
});

describe('formatDurationMs', () => {
  it('renders sub-second values in milliseconds', () => {
    expect(formatDurationMs(0)).toBe('0 ms');
    expect(formatDurationMs(999)).toBe('999 ms');
  });

  it('renders seconds and minutes', () => {
    expect(formatDurationMs(1240)).toBe('1.24 s');
    expect(formatDurationMs(42_000)).toBe('42.0 s');
    expect(formatDurationMs(125_000)).toBe('2:05 min');
  });

  it('guards against invalid input', () => {
    expect(formatDurationMs(Number.NaN)).toBe('—');
    expect(formatDurationMs(-5)).toBe('—');
  });
});

describe('mergeCommandEntries', () => {
  it('keeps the newest entry first and dedupes by seq', () => {
    const merged = mergeCommandEntries([entry(2), entry(1)], [entry(3), entry(2)]);
    expect(merged.map((e) => e.seq)).toEqual([3, 2, 1]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(i + 1));
    expect(mergeCommandEntries([], many, 4).map((e) => e.seq)).toEqual([
      10, 9, 8, 7,
    ]);
  });
});

describe('undo error parsing', () => {
  it('extracts the unsupported action', () => {
    expect(parseUndoUnsupported('__UNDO_UNSUPPORTED__|checkout')).toBe(
      'checkout',
    );
    expect(parseUndoUnsupported('__UNDO_UNSUPPORTED__|commit (initial)')).toBe(
      'commit (initial)',
    );
    expect(parseUndoUnsupported('boom')).toBeNull();
  });

  it('extracts blocking local changes', () => {
    expect(parseLocalChangesBlock('__LOCAL_CHANGES_BLOCK__|a.txt, b/c.txt')).toEqual([
      'a.txt',
      'b/c.txt',
    ]);
    expect(parseLocalChangesBlock('__LOCAL_CHANGES_BLOCK__|')).toEqual([]);
    expect(parseLocalChangesBlock('nope')).toBeNull();
  });
});

describe('reflog helpers', () => {
  it('maps backend description keys and rejects unknown ones', () => {
    expect(undoDescriptionKey('undo.action.merge')).toBe('undo.action.merge');
    expect(undoDescriptionKey('undo.action.nope')).toBe(
      'undo.action.unsupported',
    );
  });

  it('derives a tone per reflog action', () => {
    expect(reflogActionTone('merge')).toBe('merge');
    expect(reflogActionTone('rebase (finish)')).toBe('rebase');
    expect(reflogActionTone('reset')).toBe('reset');
    expect(reflogActionTone('commit (amend)')).toBe('commit');
    expect(reflogActionTone('cherry-pick')).toBe('pick');
    expect(reflogActionTone('checkout')).toBe('checkout');
    expect(reflogActionTone('pull')).toBe('other');
  });

  it('validates reflog selectors', () => {
    expect(isReflogSelector('HEAD@{0}')).toBe(true);
    expect(isReflogSelector('HEAD@{12}')).toBe(true);
    expect(isReflogSelector('HEAD@{x}')).toBe(false);
    expect(isReflogSelector('main@{1}')).toBe(false);
  });
});
