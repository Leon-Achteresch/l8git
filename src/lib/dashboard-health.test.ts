import { describe, expect, it } from 'vitest';
import { selectRepoHealth, type RepoHealthData } from './dashboard-aggregations';
import { getWorkflowGuides } from './workflow-help';
import type { StatusEntry, RebaseStatus, BisectStatus, WorktreeEntry, StashEntry } from './repo-store';

const entry = (path: string, index_status = ' ', worktree_status = 'M') => ({ path, index_status, worktree_status } as StatusEntry);
const clean: RepoHealthData = {
  status: [], hasUpstream: true, upstreamSync: { ahead: 0, behind: 0 },
  mergeState: { in_progress: false, merge_head: null, conflicted_paths: [] },
  cherryPick: { in_progress: false, head: null, conflicted_paths: [] },
  rebase: { in_progress: false, conflicted_paths: [] } as unknown as RebaseStatus,
  bisect: { active: false } as BisectStatus, stashes: [], worktrees: [],
};
const health = (data: RepoHealthData, key: string) => selectRepoHealth(data).find(item => item.key === key)!;

describe('repository health accuracy', () => {
  it('keeps absent status, upstream counts and operation/list data unknown instead of green or zero', () => {
    expect(selectRepoHealth({}).map(item => [item.severity, item.availability])).toEqual(Array.from({ length: 6 }, () => ['unknown', 'unknown']));
    for (const upstream of [
      { hasUpstream: true }, { upstreamSync: { ahead: 0, behind: 0 } },
      { hasUpstream: true, upstreamSync: { ahead: -1, behind: 0 } },
      { hasUpstream: true, upstreamSync: { ahead: 1, behind: NaN } },
    ]) expect(health(upstream, 'upstream').severity).toBe('unknown');
    expect(selectRepoHealth(clean).every(item => item.availability === 'ready' && item.severity === 'ok')).toBe(true);
  });

  it('distinguishes no upstream, unpublished commits, behind and diverged branches', () => {
    expect(health({ hasUpstream: false }, 'upstream')).toMatchObject({ severity: 'warn', messageKey: 'dashboard.health.upstream.noUpstream', availability: 'ready' });
    expect(health({ hasUpstream: true, upstreamSync: { ahead: 3, behind: 0 } }, 'upstream')).toMatchObject({ severity: 'warn', messageKey: 'dashboard.health.upstream.ahead', values: { count: 3 } });
    expect(health({ hasUpstream: true, upstreamSync: { ahead: 0, behind: 2 } }, 'upstream')).toMatchObject({ severity: 'warn', messageKey: 'dashboard.health.upstream.behind', values: { count: 2 } });
    expect(health({ hasUpstream: true, upstreamSync: { ahead: 3, behind: 2 } }, 'upstream')).toMatchObject({ messageKey: 'dashboard.health.upstream.diverged', values: { ahead: 3, behind: 2 } });
  });

  it('deduplicates exact conflicted paths across index, merge, cherry-pick and rebase', () => {
    const data = { ...clean, status: [entry('shared', 'U', 'U'), entry('added', 'A', 'A'), entry('deleted', 'D', 'D')],
      mergeState: { ...clean.mergeState!, conflicted_paths: ['shared', 'merge'] },
      cherryPick: { ...clean.cherryPick!, conflicted_paths: ['shared', 'added'] },
      rebase: { ...clean.rebase!, conflicted_paths: ['shared', 'rebase', 'rebase '] } };
    expect(health(data, 'conflicts')).toMatchObject({ severity: 'error', values: { count: 6 }, availability: 'ready' });
    expect(health(data, 'workingCopy').severity).toBe('error');
    for (const code of ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']) {
      expect(health({ ...clean, status: [entry(code, code[0], code[1])] }, 'conflicts').values?.count).toBe(1);
    }
    expect(health({ status: [entry('pending', 'U', 'U')] }, 'conflicts')).toMatchObject({ severity: 'error', messageKey: 'dashboard.health.conflicts.partial', values: { count: 1 }, availability: 'unknown' });
  });

  it('counts changed files once, saved stashes and additional worktrees explicitly', () => {
    expect(health({ ...clean, status: [entry('same'), entry('same')] }, 'workingCopy').values?.count).toBe(1);
    expect(health({ ...clean, stashes: [{}, {}] as StashEntry[] }, 'stashes')).toMatchObject({ messageKey: 'dashboard.health.stashes.count', values: { count: 2 } });
    expect(health({ ...clean, worktrees: [{ is_main: true }, { is_main: false }, { is_main: false }] as WorktreeEntry[] }, 'worktrees')).toMatchObject({ messageKey: 'dashboard.health.worktrees.count', values: { count: 2 } });
    expect(health({ ...clean, worktrees: [{ is_main: true }] as WorktreeEntry[] }, 'worktrees').messageKey).toBe('dashboard.health.worktrees.ok');
  });

  it('marks cached and failed checks as last known, preserves proven conflicts, and only links existing guides', () => {
    const cached = selectRepoHealth({ ...clean, sources: { status: { loading: true, checked: false, error: null } } });
    expect(cached.find(item => item.key === 'workingCopy')).toMatchObject({ availability: 'lastKnown', refreshing: true });
    const failed = selectRepoHealth({ ...clean, sources: { status: { loading: false, checked: true, error: 'Read denied' } } });
    expect(failed.find(item => item.key === 'workingCopy')).toMatchObject({ availability: 'lastKnown', error: 'Read denied' });
    const guides = new Set(getWorkflowGuides('en').map(guide => guide.id));
    for (const item of selectRepoHealth(clean)) if (item.guide) expect(guides.has(item.guide)).toBe(true);
    expect(health(clean, 'bisect').view).toBe('history');
  });
});
