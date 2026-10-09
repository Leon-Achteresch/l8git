import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  comparisonDiffRefs,
  comparisonEffectiveBase,
  comparisonErrorKey,
  comparisonRefsFromSelection,
  comparisonSnapshotKey,
  filterCompareFiles,
  nextCompareFile,
  readCommitCompareDiff,
  readCommitComparison,
  validateCompareRefs,
  type CommitCompareFile,
  type CommitComparison,
} from './commit-compare';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const files: CommitCompareFile[] = [
  { path: 'src/small.ts', previous_path: null, status: 'M', additions: 2, deletions: 1, binary: false },
  { path: 'src/new.ts', previous_path: 'lib/OLD.ts', status: 'R', additions: 10, deletions: 5, binary: false },
  { path: 'assets/logo.png', previous_path: null, status: 'A', additions: 0, deletions: 0, binary: true },
  { path: 'README.md', previous_path: null, status: 'D', additions: 0, deletions: 3, binary: false },
];
const comparison: CommitComparison = {
  base: 'main', head: 'feature', mode: 'direct', base_hash: 'a'.repeat(40), head_hash: 'b'.repeat(40), merge_base: null,
  ahead: 3, behind: 1, files, additions: 12, deletions: 9, total_files: 4, truncated: false,
};

beforeEach(() => vi.mocked(invoke).mockReset());

describe('commit comparison references', () => {
  it('compares exactly two selected commits from oldest to newest Git history position', () => {
    const selected = [{ hash: 'newest' }, { hash: 'oldest' }];
    expect(comparisonRefsFromSelection(selected)).toEqual({ base: 'oldest', head: 'newest', mode: 'direct' });
    expect(selected).toEqual([{ hash: 'newest' }, { hash: 'oldest' }]);
    expect(comparisonRefsFromSelection([])).toBeNull();
    expect(comparisonRefsFromSelection([{ hash: 'one' }])).toBeNull();
    expect(comparisonRefsFromSelection([{ hash: 'one' }, { hash: 'one' }])).toBeNull();
    expect(comparisonRefsFromSelection([{ hash: 'one' }, { hash: 'two' }, { hash: 'three' }])).toBeNull();
  });

  it('accepts actual revision expressions and rejects empty refs, options and control characters', () => {
    expect(validateCompareRefs({ base: 'HEAD~1', head: 'refs/tags/v1.2^{commit}' })).toBeNull();
    expect(validateCompareRefs({ base: ' feature ', head: 'origin/main' })).toBeNull();
    expect(validateCompareRefs({ base: ' ', head: 'HEAD' })).toBe('requiredRefs');
    expect(validateCompareRefs({ base: 'HEAD', head: ' -all ' })).toBe('invalidRef');
    expect(validateCompareRefs({ base: 'HEAD', head: 'fea\nture' })).toBe('invalidRef');
    expect(validateCompareRefs({ base: 'HEAD\0', head: 'HEAD' })).toBe('invalidRef');
  });

  it('pins file requests to the resolved summary hashes and preserves the mode', () => {
    expect(comparisonDiffRefs(comparison)).toEqual({ base: 'a'.repeat(40), head: 'b'.repeat(40), mode: 'direct' });
    expect(comparisonDiffRefs({ ...comparison, mode: 'merge-base', merge_base: 'c'.repeat(40) })).toEqual({ base: 'a'.repeat(40), head: 'b'.repeat(40), mode: 'merge-base' });
  });

  it('uses the chosen base for direct media comparison even when a common ancestor exists', () => {
    expect(comparisonEffectiveBase({ ...comparison, merge_base: 'c'.repeat(40) })).toBe(comparison.base_hash);
    expect(comparisonEffectiveBase({ ...comparison, mode: 'merge-base', merge_base: 'c'.repeat(40) })).toBe('c'.repeat(40));
  });

  it('provides actionable localized keys for comparison-specific Git errors', () => {
    expect(comparisonErrorKey('Error: __COMPARE_NO_COMMON_ANCESTOR__')).toBe('noCommonAncestor');
    expect(comparisonErrorKey('__COMPARE_FILE_NOT_CHANGED__')).toBe('fileNotChanged');
    expect(comparisonErrorKey('__COMPARE_INVALID_MODE__')).toBe('invalidMode');
    expect(comparisonErrorKey('fatal: unknown revision')).toBeNull();
  });

  it('keys review progress to the full hashes and comparison mode, not moving branch names', () => {
    const renamedBranch = { ...comparison, base: 'renamed-branch' };
    expect(comparisonSnapshotKey(comparison)).toBe(comparisonSnapshotKey(renamedBranch));
    expect(comparisonSnapshotKey(comparison)).not.toBe(comparisonSnapshotKey({ ...comparison, head_hash: 'c'.repeat(40) }));
    expect(comparisonSnapshotKey(comparison)).not.toBe(comparisonSnapshotKey({ ...comparison, mode: 'merge-base' }));
  });
});

describe('changed-file review navigation', () => {
  it('matches the previous name of a renamed file and ignores case', () => {
    expect(filterCompareFiles(files, ' old ', 'all', 'path').map(file => file.path)).toEqual(['src/new.ts']);
    expect(filterCompareFiles(files, 'SRC/', 'M', 'path').map(file => file.path)).toEqual(['src/small.ts']);
  });

  it('combines filename, status and reviewed filters without dropping matching binary files', () => {
    const reviewed = new Set(['src/small.ts']);
    expect(filterCompareFiles(files, '', 'all', 'path', reviewed, true)).toHaveLength(3);
    expect(filterCompareFiles(files, '', 'all', 'path', reviewed, false)).toHaveLength(4);
    expect(filterCompareFiles(files, '.png', 'A', 'path', reviewed, true)).toEqual([files[2]]);
    expect(filterCompareFiles(files, '.png', 'M', 'path')).toEqual([]);
  });

  it('sorts by amount of changes with a deterministic path tie-break, without changing the source list', () => {
    const input = [...files];
    expect(filterCompareFiles(input, '', 'all', 'changes').map(file => file.path)).toEqual(['src/new.ts', 'README.md', 'src/small.ts', 'assets/logo.png']);
    expect(filterCompareFiles(input, '', 'all', 'status').map(file => file.status)).toEqual(['A', 'D', 'M', 'R']);
    expect(input).toEqual(files);
  });

  it('navigates only matching files, clamps at boundaries and handles an empty selection', () => {
    const matching = filterCompareFiles(files, 'src/', 'all', 'path');
    expect(nextCompareFile(matching, matching[0].path, 1)).toBe(matching[1].path);
    expect(nextCompareFile(matching, matching[1].path, 1)).toBe(matching[1].path);
    expect(nextCompareFile(matching, matching[0].path, -1)).toBe(matching[0].path);
    expect(nextCompareFile(matching, null, 1)).toBe(matching[0].path);
    expect(nextCompareFile(matching, 'not-visible', -1)).toBe(matching[1].path);
    expect(nextCompareFile([], null, 1)).toBeNull();
  });
});

describe('comparison Git reads', () => {
  it('requests the summary for the user-selected revisions', async () => {
    vi.mocked(invoke).mockResolvedValue(comparison);
    await expect(readCommitComparison('/repo', { base: 'main', head: 'feature', mode: 'direct' })).resolves.toBe(comparison);
    expect(invoke).toHaveBeenCalledWith('repo_compare_commits', { path: '/repo', base: 'main', head: 'feature', mode: 'direct' });
  });

  it('sends resolved hashes and both filenames when reviewing a renamed file', async () => {
    vi.mocked(invoke).mockResolvedValue({ patch: 'diff', binary: false, truncated: false });
    await readCommitCompareDiff('/repo', comparison, 'src/new.ts');
    expect(invoke).toHaveBeenCalledWith('repo_compare_file_diff', { path: '/repo', base: comparison.base_hash, head: comparison.head_hash, mode: 'direct', file: 'src/new.ts', previousFile: 'lib/OLD.ts' });
  });

  it('sends no old filename for an ordinary file and retains merge-base mode', async () => {
    await readCommitCompareDiff('/repo', { ...comparison, mode: 'merge-base' }, 'src/small.ts');
    expect(invoke).toHaveBeenCalledWith('repo_compare_file_diff', { path: '/repo', base: comparison.base_hash, head: comparison.head_hash, mode: 'merge-base', file: 'src/small.ts', previousFile: null });
  });
});
