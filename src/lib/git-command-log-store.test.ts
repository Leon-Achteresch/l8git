import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { subscribeGitCommandLog, useGitCommandLog } from './git-command-log-store';
import type { GitCommandEntry } from './git-command-log';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
const state = useGitCommandLog.getState;
const row = (seq: number): GitCommandEntry => ({
  seq, repoPath: '/repo', args: ['status'], exitOk: true, durationMs: 2, startedAt: '',
});
function holdSnapshot() {
  let resolve!: (rows: GitCommandEntry[]) => void;
  vi.mocked(invoke).mockReturnValueOnce(new Promise<GitCommandEntry[]>(done => { resolve = done; }));
  return resolve;
}
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  useGitCommandLog.setState({ entries: [], loading: false, paused: false });
});

describe('live Git command log', () => {
  it('freezes in-flight reloads while paused and catches up on resume', async () => {
    state().push(row(1));
    const resolve = holdSnapshot();
    const load = state().load();
    await state().setPaused(true);
    state().push(row(2));
    resolve([row(2)]);
    await load;
    expect(state().entries).toEqual([row(1)]);
    const catchUp = holdSnapshot();
    const resume = state().setPaused(false);
    state().push(row(4));
    catchUp([row(3), row(2), row(1)]);
    await resume;
    expect(state().entries.map(entry => entry.seq)).toEqual([4, 3, 2, 1]);
  });

  it('removes a late listener after close without changing a new subscription', async () => {
    let connected!: (stop: () => void) => void;
    vi.mocked(listen).mockReturnValueOnce(new Promise(resolve => { connected = resolve; }));
    const onError = vi.fn();
    subscribeGitCommandLog(onError)();
    const activeStop = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(activeStop);
    vi.mocked(invoke).mockResolvedValueOnce(undefined).mockResolvedValueOnce([row(3)]).mockResolvedValue(undefined);
    const close = subscribeGitCommandLog(onError);
    await vi.waitFor(() => expect(state().entries).toEqual([row(3)]));
    const staleStop = vi.fn();
    connected(staleStop);
    await vi.waitFor(() => expect(staleStop).toHaveBeenCalledOnce());
    expect(vi.mocked(invoke).mock.calls.map(([cmd]) => cmd)).toEqual(['git_command_log_live', 'git_command_log']);
    close();
    expect(activeStop).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenLastCalledWith('git_command_log_live', { active: false });
    expect(onError).not.toHaveBeenCalled();
  });

  it('still loads recorded commands if live subscription fails', async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error('unavailable'));
    vi.mocked(invoke).mockResolvedValueOnce([row(7)]);
    const onError = vi.fn();
    const close = subscribeGitCommandLog(onError);
    await vi.waitFor(() => expect(state().entries).toEqual([row(7)]));
    expect(onError).toHaveBeenCalledOnce();
    close();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps live arrivals while replacing older history with the requested snapshot', async () => {
    state().push(row(1));
    const resolve = holdSnapshot();
    const load = state().load(2);
    state().push(row(4));
    resolve([row(3), row(2)]);
    await load;
    expect(state().entries.map(entry => entry.seq)).toEqual([4, 3]);
  });

  it('ignores a late snapshot after clearing the log', async () => {
    const resolve = holdSnapshot();
    const load = state().load();
    await state().clear();
    state().push(row(3));
    resolve([row(2), row(1)]);
    await load;
    expect(state().entries).toEqual([row(3)]);
    expect(state().loading).toBe(false);
  });

  it('keeps the newest reload authoritative even if the first resolves last', async () => {
    const resolve = holdSnapshot();
    const older = state().load();
    vi.mocked(invoke).mockResolvedValueOnce([row(2)]);
    await state().load();
    resolve([row(1)]);
    await older;
    expect(state().entries).toEqual([row(2)]);
  });
});
