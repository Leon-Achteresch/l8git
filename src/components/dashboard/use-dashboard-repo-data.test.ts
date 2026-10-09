import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/repo-store', () => ({ useRepoStore: { getState: vi.fn(), setState: vi.fn() } }));
import { DashboardHealthReader, DashboardOperationCache, createDashboardHealthScope } from './use-dashboard-repo-data';
import { selectRepoHealth, type RepoHealthData } from '@/lib/dashboard-aggregations';
import { useRepoStore, type RebaseStatus } from '@/lib/repo-store';

function result(command: string, ahead = 0): unknown {
  if (command === 'repo_full_status') return { entries: [], has_upstream: true, upstream_sync: { ahead, behind: 0 } };
  if (command === 'git_bisect_status') return { active: false };
  if (command === 'list_stashes' || command === 'list_worktrees') return [];
  return { in_progress: false, conflicted_paths: [] };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function readerFor(call: (command: string, args: { path: string }) => Promise<unknown>, publish = vi.fn(), currentPath?: () => string | null) {
  return new DashboardHealthReader(<T>(command: string, args: { path: string }) => call(command, args) as Promise<T>, publish, currentPath);
}

describe('dashboard health refresh ownership', () => {
  it('reports failed initial reads without fabricated clean data and can retry the same source', async () => {
    let fail = true;
    const call = vi.fn(async (command: string) => {
      if (command === 'repo_full_status' && fail) throw Error('Repository unavailable');
      return result(command, 3);
    });
    const reader = readerFor(call);
    reader.setPath('/repo');
    await reader.refresh();
    expect(reader.getSnapshot().data.status).toBeUndefined();
    expect(reader.getSnapshot().sources.status).toMatchObject({ loading: false, checked: false, error: 'Repository unavailable' });
    expect(selectRepoHealth({ ...reader.getSnapshot().data, sources: reader.getSnapshot().sources }).find(item => item.key === 'workingCopy')).toMatchObject({ availability: 'error', severity: 'unknown' });
    fail = false;
    await reader.refresh();
    expect(reader.getSnapshot().sources.status).toEqual({ loading: false, checked: true, error: null });
    expect(reader.getSnapshot().data.upstreamSync?.ahead).toBe(3);
    expect(call.mock.calls.every(([command]) => ['repo_full_status', 'list_stashes', 'list_worktrees', 'git_bisect_status', 'cherry_pick_state', 'merge_state', 'rebase_status'].includes(command))).toBe(true);
  });

  it('keeps the last confirmed conflict when its next read fails instead of clearing operation state', async () => {
    let fail = false;
    const reader = readerFor(async command => {
      if (command === 'merge_state') {
        if (fail) throw Error('Permission denied');
        return { in_progress: true, conflicted_paths: ['conflicted.txt'] };
      }
      return result(command);
    });
    reader.setPath('/repo'); await reader.refresh();
    fail = true; await reader.refresh();
    expect(reader.getSnapshot().data.mergeState?.conflicted_paths).toEqual(['conflicted.txt']);
    expect(selectRepoHealth({ ...reader.getSnapshot().data, sources: reader.getSnapshot().sources }).find(item => item.key === 'conflicts')).toMatchObject({ availability: 'lastKnown', severity: 'error', values: { count: 1 }, error: 'Permission denied' });
  });

  it('does not apply late responses from the old repository to either health or shared-store callbacks', async () => {
    const old = deferred<void>();
    const applied = vi.fn();
    const reader = readerFor(async (command, { path }) => { if (path === '/old') await old.promise; return result(command, path === '/old' ? 99 : 2); }, applied);
    reader.setPath('/old'); const oldRead = reader.refresh();
    reader.setPath('/new'); await reader.refresh();
    old.resolve(); await oldRead;
    expect(reader.getSnapshot().path).toBe('/new');
    expect(reader.getSnapshot().data.upstreamSync?.ahead).toBe(2);
    expect(applied.mock.calls.every(([path]) => path === '/new')).toBe(true);
  });

  it('drops an older same-repository refresh after a newer epoch has completed', async () => {
    const old = deferred<void>();
    let generation = 0;
    const reader = readerFor(async command => { const request = generation; if (request === 0) await old.promise; return result(command, request === 0 ? 99 : 4); });
    reader.setPath('/repo'); const stale = reader.refresh();
    generation = 1; await reader.refresh();
    old.resolve(); await stale;
    expect(reader.getSnapshot().data.upstreamSync?.ahead).toBe(4);
  });

  it('checks render-time path ownership before effects run and discards canceled work', async () => {
    const held = deferred<void>();
    let currentPath = '/repo';
    const applied = vi.fn();
    const reader = readerFor(async command => { await held.promise; return result(command); }, applied, () => currentPath);
    reader.setPath('/repo'); const pending = reader.refresh();
    currentPath = '/new'; held.resolve(); await pending;
    expect(applied).not.toHaveBeenCalled();
    expect(reader.getSnapshot().data.status).toBeUndefined();
    const cached: RepoHealthData = { hasUpstream: false };
    const canceled = deferred<void>();
    const canceledReader = readerFor(async command => { await canceled.promise; return result(command); }, applied);
    canceledReader.setPath('/new', cached);
    const canceledRead = canceledReader.refresh();
    canceledReader.cancel(); canceled.resolve(); await canceledRead;
    expect(canceledReader.getSnapshot().data).toEqual(cached);
    expect(applied).not.toHaveBeenCalled();
  });

  it('never publishes malformed or missing upstream counts as successful zero counts', async () => {
    for (const upstream_sync of [undefined, null, { ahead: 2 }, { ahead: -1, behind: 0 }, { ahead: 0, behind: '2' }, { ahead: NaN, behind: 0 }]) {
      const applied = vi.fn();
      const reader = readerFor(async command => command === 'repo_full_status'
        ? { entries: [], has_upstream: true, upstream_sync } : result(command), applied);
      reader.setPath('/repo'); await reader.refresh();
      expect(reader.getSnapshot().data.upstreamSync).toBeUndefined();
      expect(reader.getSnapshot().sources.status).toMatchObject({ checked: false, loading: false, error: 'Repository status response is incomplete.' });
      expect(applied.mock.calls.some(([, data]) => 'status' in data || 'upstreamSync' in data)).toBe(false);
    }
  });
});

function seedLegacyFallbacks(path: string) {
  vi.mocked(useRepoStore.getState).mockReturnValue({
    status: { [path]: [] }, upstreamSync: { [path]: { ahead: 0, behind: 0 } }, hasUpstream: { [path]: true },
    stashes: { [path]: [] }, worktrees: { [path]: [] }, bisect: { [path]: { active: false } },
    cherryPickState: { [path]: { in_progress: false, head: null, conflicted_paths: [] } },
    mergeState: { [path]: { in_progress: false, merge_head: null, conflicted_paths: [] } },
    rebaseState: { [path]: { in_progress: false, kind: 'none', step: 0, total: 0, head_name: null, onto: null,
      onto_short: null, current_action: null, stopped: null, conflicted_paths: [], todo: [] } },
  } as unknown as ReturnType<typeof useRepoStore.getState>);
}
function scopedReader(call: (command: string, args: { path: string }) => Promise<unknown>, cache: DashboardOperationCache) {
  return createDashboardHealthScope(<T>(command: string, args: { path: string }) => call(command, args) as Promise<T>, undefined, cache);
}

describe('production dashboard cache provenance', () => {
  it('never seeds inactive legacy fallback objects as last-known absence of conflicts', async () => {
    const path = '/unverified'; seedLegacyFallbacks(path);
    const scope = scopedReader(async command => {
      if (['merge_state', 'cherry_pick_state', 'rebase_status'].includes(command)) throw Error('Operation read failed');
      return result(command);
    }, new DashboardOperationCache());
    const cached = scope.cached(path);
    expect(cached.status).toEqual([]);
    expect([cached.cherryPick, cached.mergeState, cached.rebase]).toEqual([undefined, undefined, undefined]);
    scope.reader.setPath(path, cached); await scope.reader.refresh();
    const conflicts = selectRepoHealth({ ...scope.reader.getSnapshot().data, sources: scope.reader.getSnapshot().sources }).find(item => item.key === 'conflicts');
    expect(conflicts).toMatchObject({ availability: 'error', severity: 'unknown' });
    expect(scope.reader.getSnapshot().data.mergeState).toBeUndefined();
  });

  it('preserves verified conflicts across remounts even after legacy failure overwrites the shared store', async () => {
    const path = '/verified'; seedLegacyFallbacks(path);
    const cache = new DashboardOperationCache();
    const first = scopedReader(async command => command === 'merge_state'
      ? { in_progress: true, merge_head: 'head', conflicted_paths: ['real-conflict.txt'] } : result(command), cache);
    first.reader.setPath(path, first.cached(path)); await first.reader.refresh();
    // The same shared-store inactive values now represent later legacy failure fallbacks.
    seedLegacyFallbacks(path);
    const remounted = scopedReader(async command => {
      if (['merge_state', 'cherry_pick_state', 'rebase_status'].includes(command)) throw Error('Later read failed');
      return result(command);
    }, cache);
    const cached = remounted.cached(path);
    expect(cached.mergeState?.conflicted_paths).toEqual(['real-conflict.txt']);
    cached.mergeState!.conflicted_paths.length = 0;
    expect(remounted.cached(path).mergeState?.conflicted_paths).toEqual(['real-conflict.txt']);
    remounted.reader.setPath(path, remounted.cached(path)); await remounted.reader.refresh();
    const conflicts = selectRepoHealth({ ...remounted.reader.getSnapshot().data, sources: remounted.reader.getSnapshot().sources }).find(item => item.key === 'conflicts');
    expect(conflicts).toMatchObject({ availability: 'lastKnown', severity: 'error', values: { count: 1 }, error: 'Later read failed' });
    expect(remounted.cached('/verified ').mergeState).toBeUndefined();
  });

  it('never adds a late old-repository response to the verified cache', async () => {
    const cache = new DashboardOperationCache(); const held = deferred<void>();
    const scope = scopedReader(async (command, { path }) => {
      if (path === '/old') await held.promise;
      return command === 'merge_state' ? { in_progress: true, merge_head: 'head', conflicted_paths: [path] } : result(command);
    }, cache);
    seedLegacyFallbacks('/old'); scope.reader.setPath('/old', scope.cached('/old')); const oldRead = scope.reader.refresh();
    seedLegacyFallbacks('/new'); scope.reader.setPath('/new', scope.cached('/new')); await scope.reader.refresh();
    held.resolve(); await oldRead;
    expect(scope.cached('/old').mergeState).toBeUndefined();
    expect(scope.cached('/new').mergeState?.conflicted_paths).toEqual(['/new']);
  });

  it('isolates conflict paths, todo entries and stopped commits when remembering and reading a verified rebase', () => {
    const cache = new DashboardOperationCache();
    const rebase: RebaseStatus = { in_progress: true, kind: 'interactive', step: 1, total: 2, head_name: 'topic',
      onto: 'base', onto_short: 'base', current_action: 'pick', conflicted_paths: ['conflict.txt'],
      todo: [{ action: 'pick', hash: 'next', short_hash: 'next', subject: 'Next commit' }],
      stopped: { hash: 'stopped', short_hash: 'stop', subject: 'Stopped commit' } };
    cache.remember('/rebase', { rebase });
    const original = structuredClone(rebase);
    rebase.conflicted_paths.length = 0;
    rebase.todo[0].subject = 'Changed source';
    rebase.todo.push({ action: 'drop', hash: 'extra', short_hash: 'extra', subject: 'Extra commit' });
    rebase.stopped!.subject = 'Changed source';
    const read = cache.read('/rebase').rebase!;
    expect(read).toEqual(original);
    read.conflicted_paths.push('new.txt');
    read.todo[0].subject = 'Changed reader';
    read.todo.pop();
    read.stopped!.subject = 'Changed reader';
    expect(cache.read('/rebase').rebase).toEqual(original);
  });

  it('bounds verified operation entries to 64 repositories and keeps recently used exact paths', () => {
    const cache = new DashboardOperationCache();
    for (let index = 0; index < 64; index++) cache.remember(`/repo/${index}`, { mergeState: { in_progress: false, merge_head: null, conflicted_paths: [] } });
    cache.read('/repo/0');
    cache.remember('/repo/new', { mergeState: { in_progress: false, merge_head: null, conflicted_paths: [] } });
    expect(cache.read('/repo/1').mergeState).toBeUndefined();
    expect(cache.read('/repo/0').mergeState?.in_progress).toBe(false);
    expect(cache.read('/repo/new').mergeState?.in_progress).toBe(false);
  });
});
