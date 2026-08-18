import { describe, expect, it } from 'vitest';

import { buildSections, commitMessageOf, isConflict, type StatusEntry } from '~/lib/repo/types';

function entry(patch: Partial<StatusEntry> & { path: string }): StatusEntry {
  return {
    index_status: ' ',
    worktree_status: ' ',
    staged: false,
    unstaged: false,
    untracked: false,
    additions_staged: 0,
    deletions_staged: 0,
    additions_unstaged: 0,
    deletions_unstaged: 0,
    binary: false,
    embedded_repo: false,
    ...patch,
  };
}

describe('buildSections', () => {
  it('returns empty sections without entries', () => {
    expect(buildSections(undefined).total).toBe(0);
    expect(buildSections([]).total).toBe(0);
  });

  it('splits a partially staged file into both sectors', () => {
    const sections = buildSections([
      entry({
        path: 'src/app.ts',
        index_status: 'M',
        worktree_status: 'M',
        staged: true,
        unstaged: true,
        additions_staged: 3,
        deletions_staged: 1,
        additions_unstaged: 7,
        deletions_unstaged: 2,
      }),
    ]);

    expect(sections.staged).toHaveLength(1);
    expect(sections.unstaged).toHaveLength(1);
    expect(sections.total).toBe(2);
    expect(sections.staged[0]).toMatchObject({ status: 'M', additions: 3, deletions: 1 });
    expect(sections.unstaged[0]).toMatchObject({ status: 'M', additions: 7, deletions: 2 });
    expect(sections.staged[0].key).not.toBe(sections.unstaged[0].key);
  });

  it('routes untracked entries away from the unstaged sector', () => {
    const sections = buildSections([
      entry({ path: 'notes.md', index_status: '?', worktree_status: '?', untracked: true, unstaged: true }),
    ]);

    expect(sections.untracked).toHaveLength(1);
    expect(sections.unstaged).toHaveLength(0);
    expect(sections.untracked[0].status).toBe('?');
  });

  it('detects conflicts and keeps them out of the other sectors', () => {
    const conflicted = entry({
      path: 'merge.txt',
      index_status: 'U',
      worktree_status: 'U',
      staged: true,
      unstaged: true,
    });

    expect(isConflict(conflicted)).toBe(true);

    const sections = buildSections([conflicted]);
    expect(sections.conflicts).toHaveLength(1);
    expect(sections.conflicts[0].status).toBe('U');
    expect(sections.staged).toHaveLength(0);
    expect(sections.unstaged).toHaveLength(0);
    expect(sections.total).toBe(1);
  });
});

describe('commitMessageOf', () => {
  it('joins subject and body with a blank line', () => {
    expect(
      commitMessageOf({ hash: 'a', short_hash: 'a', subject: 'feat: x', body: 'why\n' })
    ).toBe('feat: x\n\nwhy');
  });

  it('falls back to the subject alone', () => {
    expect(commitMessageOf({ hash: 'a', short_hash: 'a', subject: 'feat: x', body: '   ' })).toBe(
      'feat: x'
    );
    expect(commitMessageOf(null)).toBe('');
  });
});
