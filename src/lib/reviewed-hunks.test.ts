import { describe, expect, it, vi } from 'vitest';
import type { ChangeRow, FileDiffResponse } from '@/components/repo/commit/commit-panel-types';
import { applyReviewedHunks, captureReviewedHunks } from './reviewed-hunks';

const file = 'path with space\\literal%20\n.txt';
const row: ChangeRow = { id: 'selected', path: file, sector: 'unstaged', entry: {
  path: file, index_status: 'M', worktree_status: 'M', staged: true, unstaged: true, untracked: false,
  binary: false, embedded_repo: false, additions_staged: 1, deletions_staged: 1, additions_unstaged: 2, deletions_unstaged: 2,
} };
const diff: FileDiffResponse = { staged: 'original staged diff', unstaged: 'original unstaged diff',
  untracked_plain: null, is_binary: false, fingerprint: 'opaque-displayed-snapshot' };

describe('reviewed hunk snapshots', () => {
  it('captures exact repository/file identity, ordered patches, and displayed token independently of later edits', () => {
    const selected = { ...row, entry: { ...row.entry } };
    const displayed = { ...diff };
    const patches = ['first patch\n', 'second patch\n'];
    const plan = captureReviewedHunks('/repo ', selected, displayed, 'discard', patches)!;
    patches.reverse(); displayed.fingerprint = 'new token'; displayed.unstaged = 'new diff';
    selected.path = 'other'; selected.entry.path = 'other';
    expect(plan).toEqual({ path: '/repo ', file, action: 'discard', patches: ['first patch\n', 'second patch\n'],
      expectedDiff: 'original unstaged diff', expectedFingerprint: 'opaque-displayed-snapshot' });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.patches)).toBe(true);
  });

  it('requires the intended staged/unstaged sector instead of silently broadening a partial-file selection', () => {
    for (const action of ['stage', 'discard'] as const) {
      expect(captureReviewedHunks('/repo', row, diff, action, ['patch'])?.expectedDiff).toBe(diff.unstaged);
      expect(captureReviewedHunks('/repo', { ...row, sector: 'staged' }, diff, action, ['patch'])).toBeNull();
    }
    expect(captureReviewedHunks('/repo', row, diff, 'unstage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', { ...row, sector: 'staged' }, diff, 'unstage', ['patch'])?.expectedDiff).toBe(diff.staged);
  });

  it('fails closed for missing snapshots, nontext previews, conflicts, embedded repositories, or empty batches', () => {
    for (const fingerprint of [undefined, null, '', ' ']) expect(captureReviewedHunks('/repo', row, { ...diff, fingerprint }, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', row, { ...diff, is_binary: true }, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', { ...row, entry: { ...row.entry, binary: true } }, diff, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', row, { ...diff, unstaged: null, untracked_plain: 'new file' }, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', { ...row, sector: 'conflict' }, diff, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', { ...row, entry: { ...row.entry, embedded_repo: true } }, diff, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', { ...row, path: 'wrong file' }, diff, 'stage', ['patch'])).toBeNull();
    expect(captureReviewedHunks('/repo', row, diff, 'stage', [])).toBeNull();
    expect(captureReviewedHunks('/repo', row, diff, 'stage', ['patch', ' '])).toBeNull();
  });

  it.each(['stage', 'unstage', 'discard'] as const)('sends a %s selection as one checked native batch using the displayed token', async action => {
    const plan = captureReviewedHunks('/repo', { ...row, sector: action === 'unstage' ? 'staged' : 'unstaged' }, diff, action, ['one', 'two'])!;
    const invoke = vi.fn(async () => undefined);
    expect(await applyReviewedHunks(plan, invoke, () => '/repo')).toBe(true);
    expect(invoke.mock.calls).toEqual([['git_apply_reviewed_hunks', { path: '/repo', file, action,
      patches: ['one', 'two'], expectedFingerprint: 'opaque-displayed-snapshot' }]]);
  });

  it('does not invoke after switching repositories and propagates stale rejection without retrying or recapturing a token', async () => {
    const plan = captureReviewedHunks('/repo', row, diff, 'discard', ['one', 'two'])!;
    const rejected = vi.fn(async (_command: string, _args: Record<string, unknown>) => { throw Error(`__FILE_CHANGED__|${file}`); });
    expect(await applyReviewedHunks(plan, rejected, () => '/repo ')).toBe(false);
    expect(rejected).not.toHaveBeenCalled();
    await expect(applyReviewedHunks(plan, rejected, () => '/repo')).rejects.toThrow('__FILE_CHANGED__');
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0][1].expectedFingerprint).toBe(diff.fingerprint);
  });
});
