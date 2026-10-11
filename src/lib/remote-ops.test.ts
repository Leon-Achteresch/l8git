import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

beforeEach(() => { vi.resetModules(); mocks.invoke.mockReset(); mocks.listen.mockReset().mockResolvedValue(vi.fn()); });

describe('remote operation lifecycle', () => {
  it('restores cancellation when the backend cannot cancel the operation', async () => {
    const { useRemoteOps, cancelRemoteOp } = await import('./remote-ops');
    useRemoteOps.getState().startOp('op', 'fetch', '/repo');
    mocks.invoke.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Transport disconnected'));
    expect(await cancelRemoteOp('op')).toBe(false);
    expect(useRemoteOps.getState().ops[0].canceling).toBe(false);
    expect(await cancelRemoteOp('op')).toBe(false);
    expect(useRemoteOps.getState().ops[0].canceling).toBe(false);
    mocks.invoke.mockResolvedValueOnce(true);
    expect(await cancelRemoteOp('op')).toBe(true);
    expect(useRemoteOps.getState().ops[0].canceling).toBe(true);
  });

  it('resets percentage between phases and ignores late events for finished operations', async () => {
    const { useRemoteOps } = await import('./remote-ops');
    useRemoteOps.getState().startOp('op', 'fetch', '/repo');
    const event = { opId: 'op', repoPath: '/repo', op: 'fetch' as const, phase: 'Receiving', percent: 120, detail: '' };
    useRemoteOps.getState().applyProgress(event);
    expect(useRemoteOps.getState().ops[0].percent).toBe(100);
    useRemoteOps.getState().applyProgress({ ...event, phase: 'Resolving', percent: null });
    expect(useRemoteOps.getState().ops[0].percent).toBe(null);
    useRemoteOps.getState().finishOp('op');
    useRemoteOps.getState().applyProgress(event);
    expect(useRemoteOps.getState().ops).toEqual([]);
  });

  it('waits for shared listener registration before starting simultaneous commands', async () => {
    let attach!: (off: () => void) => void;
    mocks.listen.mockReturnValue(new Promise<() => void>(resolve => { attach = resolve; }));
    const { runRemoteOp, useRemoteOps } = await import('./remote-ops');
    const first = vi.fn().mockResolvedValue('first');
    const second = vi.fn().mockResolvedValue('second');
    const pending = [runRemoteOp('fetch', '/one', first), runRemoteOp('fetch', '/two', second)];
    expect(mocks.listen).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
    attach(vi.fn());
    expect(await Promise.all(pending)).toEqual(['first', 'second']);
    expect(useRemoteOps.getState().ops).toEqual([]);
    expect(useRemoteOps.getState().history).toHaveLength(2);
  });

  it('cleans up partial listener failures and retries registration without blocking commands', async () => {
    const off = vi.fn();
    mocks.listen.mockResolvedValueOnce(off).mockRejectedValueOnce(new Error('Event transport unavailable'));
    const { runRemoteOp } = await import('./remote-ops');
    expect(await runRemoteOp('fetch', '/repo', async () => 'ok')).toBe('ok');
    expect(off).toHaveBeenCalledOnce();
    await runRemoteOp('fetch', '/repo', async () => 'ok');
    expect(mocks.listen).toHaveBeenCalledTimes(4);
  });

  it('records cancellation separately from failure and makes only failed fetches retryable', async () => {
    const { runRemoteOp, useRemoteOps } = await import('./remote-ops');
    await expect(runRemoteOp('push', '/repo', async () => { throw '__REMOTE_CANCELED__'; })).rejects.toBe('__REMOTE_CANCELED__');
    expect(useRemoteOps.getState().history[0]).toMatchObject({ status: 'canceled', retry: undefined });
    await expect(runRemoteOp('fetch', '/repo', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(useRemoteOps.getState().history[0].status).toBe('failed');
    expect(useRemoteOps.getState().history[0].retry).toBeTypeOf('function');
    expect(useRemoteOps.getState().ops).toEqual([]);
  });
});
