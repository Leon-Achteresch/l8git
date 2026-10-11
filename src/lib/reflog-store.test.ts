import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReflogEntry, UndoResult } from './reflog-format';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), refresh: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/lib/repo-store', () => ({ useRepoStore: { getState: () => ({ refreshOpenRepo: mocks.refresh }) } }));
import { REFLOG_PAGE_SIZE, useReflogStore } from './reflog-store';

function entry(index: number, hash = `hash${index}`): ReflogEntry {
  return { selector: `HEAD@{${index}}`, hash, short_hash: hash.slice(0, 7), action: 'commit', subject: `commit: ${hash}`, message: hash, date: '2026-10-08T12:00:00Z' };
}
const result: UndoResult = { undone_action: 'commit', from_hash: 'current', to_hash: 'target', head_name: 'main' };

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  useReflogStore.setState({ entries: {}, loading: {}, exhausted: {}, error: {}, refreshWarning: {} });
});

describe('reflog loading', () => {
  it('lets an explicit refresh supersede a slower old request', async () => {
    let resolveOld!: (entries: ReflogEntry[]) => void;
    mocks.invoke.mockReturnValueOnce(new Promise<ReflogEntry[]>((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce([entry(0, 'new')]);
    const oldRequest = useReflogStore.getState().load('/repo');
    await useReflogStore.getState().load('/repo');
    resolveOld([entry(0, 'old')]);
    await oldRequest;
    expect(useReflogStore.getState().entries['/repo'][0].hash).toBe('new');
    expect(useReflogStore.getState().loading['/repo']).toBe(false);
  });

  it('does not replace a fresh result with an older request error', async () => {
    let rejectOld!: (error: Error) => void;
    mocks.invoke.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; })).mockResolvedValueOnce([entry(0, 'new')]);
    const oldRequest = useReflogStore.getState().load('/repo');
    await useReflogStore.getState().load('/repo');
    rejectOld(new Error('old connection failed'));
    await oldRequest;
    expect(useReflogStore.getState().error['/repo']).toBeNull();
  });

  it('restarts instead of appending shifted positional entries when HEAD changes', async () => {
    const current = Array.from({ length: REFLOG_PAGE_SIZE }, (_, index) => entry(index));
    useReflogStore.setState({ entries: { '/repo': current } });
    const refreshed = [entry(0, 'new-head')];
    mocks.invoke.mockResolvedValueOnce([current[current.length - 1], entry(60)])
      .mockResolvedValueOnce(refreshed).mockResolvedValueOnce(refreshed);
    await useReflogStore.getState().loadMore('/repo');
    expect(useReflogStore.getState().entries['/repo']).toEqual(refreshed);
    expect(mocks.invoke).toHaveBeenLastCalledWith('reflog_list', { path: '/repo', limit: REFLOG_PAGE_SIZE, skip: 0 });
  });

  it('appends a stable overlapping page without duplicating its anchor', async () => {
    const current = Array.from({ length: REFLOG_PAGE_SIZE }, (_, index) => entry(index));
    useReflogStore.setState({ entries: { '/repo': current } });
    mocks.invoke.mockResolvedValueOnce([current[current.length - 1], entry(60), entry(61)]).mockResolvedValueOnce([current[0]]);
    await useReflogStore.getState().loadMore('/repo');
    expect(useReflogStore.getState().entries['/repo']).toEqual([...current, entry(60), entry(61)]);
    expect(useReflogStore.getState().exhausted['/repo']).toBe(true);
  });
});

describe('reviewed recovery mutations', () => {
  it('requires an undo preview and forwards its exact snapshot', async () => {
    await expect(useReflogStore.getState().undoLast('/repo', '')).rejects.toThrow('preview');
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.invoke.mockImplementation(async (command) => command === 'undo_last_operation' ? result : []);
    await expect(useReflogStore.getState().undoLast('/repo', 'reviewed-snapshot')).resolves.toEqual(result);
    expect(mocks.invoke).toHaveBeenCalledWith('undo_last_operation', { path: '/repo', expectedSnapshot: 'reviewed-snapshot' });
  });

  it('requires and forwards both immutable reset guards', async () => {
    await expect(useReflogStore.getState().resetToEntry('/repo', 'HEAD@{1}', 'keep', '', 'head')).rejects.toThrow('reviewed');
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.invoke.mockImplementation(async (command) => command === 'reset_to_reflog_entry' ? result : []);
    await useReflogStore.getState().resetToEntry('/repo', 'HEAD@{1}', 'keep', 'target', 'current');
    expect(mocks.invoke).toHaveBeenCalledWith('reset_to_reflog_entry', { path: '/repo', selector: 'HEAD@{1}', mode: 'keep', expectedHash: 'target', expectedHead: 'current' });
  });

  it('keeps a completed mutation successful if repository refresh fails', async () => {
    mocks.invoke.mockImplementation(async (command) => command === 'undo_last_operation' ? result : [entry(0, 'target')]);
    mocks.refresh.mockRejectedValue(new Error('status unavailable'));
    await expect(useReflogStore.getState().undoLast('/repo', 'snapshot')).resolves.toEqual(result);
    expect(useReflogStore.getState().refreshWarning['/repo']).toBe(true);
    expect(useReflogStore.getState().entries['/repo'][0].hash).toBe('target');
  });

  it('reports a refresh warning rather than a false failure if reflog reload fails', async () => {
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'reset_to_reflog_entry') return result;
      throw new Error('reflog unavailable');
    });
    await expect(useReflogStore.getState().resetToEntry('/repo', 'HEAD@{1}', 'hard', 'target', 'current')).resolves.toEqual(result);
    expect(useReflogStore.getState().refreshWarning['/repo']).toBe(true);
    expect(useReflogStore.getState().error['/repo']).toContain('reflog unavailable');
  });

  it('propagates a blocked operation without requesting a status refresh', async () => {
    mocks.invoke.mockRejectedValue('__UNDO_CHANGED__');
    await expect(useReflogStore.getState().undoLast('/repo', 'snapshot')).rejects.toBe('__UNDO_CHANGED__');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('retries only the failed views and clears the warning without repeating a mutation', async () => {
    useReflogStore.setState({ refreshWarning: { '/repo': true }, error: { '/repo': 'reflog unavailable' } });
    mocks.invoke.mockResolvedValue([entry(0, 'fresh')]);
    await useReflogStore.getState().refreshViews('/repo');
    expect(useReflogStore.getState().refreshWarning['/repo']).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith('reflog_list', { path: '/repo', limit: REFLOG_PAGE_SIZE, skip: 0 });
  });
});
