import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ navigate: vi.fn(async () => {}), openThread: vi.fn(async () => {}), invoke: vi.fn(async () => ({ number: 901, title: 'Older pull request' })) }));
vi.mock('@/lib/router', () => ({ router: { navigate: mocks.navigate } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/lib/agents/active-chat-store', () => ({ chatStoreFor: () => ({ getState: () => ({ conversations: { second: { path: '/second' }, first: { path: '/first' } }, openThread: mocks.openThread }) }) }));
import { armRemoteActivityNotifications, navigateToTarget } from './notifications-wiring';
import { useRemoteOps } from './remote-ops';
import * as notifications from './notifications';
import { useRepoStore } from './repo-store';
import { useUiStore } from './ui-store';

it('notifies once per long remote result, including scoped operations without a native done event', () => {
  const notify = vi.spyOn(notifications, 'notifyRemoteOpDone').mockResolvedValue();
  const off = armRemoteActivityNotifications();
  const store = useRemoteOps.getState();
  const result = { opId: 'scoped', op: 'fetch' as const, repoPath: '/repo', status: 'success' as const, startedAt: 1000, finishedAt: 12000, message: '' };
  try {
    store.recordResult(result);
    store.startOp('other', 'clone', '/other');
    store.recordResult({ ...result, opId: 'short', finishedAt: 1020 });
    store.recordResult({ ...result, opId: 'canceled', status: 'canceled' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ opId: 'scoped', op: 'fetch', repoPath: '/repo', durationMs: 11000, canceled: false, ok: true });
    store.recordResult({ ...result, opId: 'failed', status: 'failed' });
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ opId: 'failed', ok: false }));
    off();
    store.recordResult({ ...result, opId: 'after-unmount' });
    expect(notify).toHaveBeenCalledTimes(2);
  } finally {
    off();
    notify.mockRestore();
    useRemoteOps.setState({ ops: [], history: [] });
  }
});

describe('notification navigation', () => {
  it('opens the named session and its own repository', async () => {
    useRepoStore.setState({ reload: async () => {}, activePath: null, repos: { '/second': { path: '/second', branch: 'main', branches: [], commits: [], tags: [] } }, prs: {} });
    await navigateToTarget({ view: 'agents', provider: 'codex', threadId: 'second' });
    expect(mocks.openThread).toHaveBeenCalledWith('/second', 'second');
    expect(useRepoStore.getState().activePath).toBe('/second');
    expect(mocks.navigate).toHaveBeenLastCalledWith({ to: '/' });
  });
  it('loads and focuses an older PR in the requested repository', async () => {
    useRepoStore.setState({ reload: async () => {}, activePath: '/first', repos: { '/first': { path: '/first', branch: 'main', branches: [], commits: [], tags: [] }, '/second': { path: '/second', branch: 'main', branches: [], commits: [], tags: [] } }, prs: {} });
    await navigateToTarget({ view: 'pr', path: '/second', number: 901 });
    expect(mocks.invoke).toHaveBeenCalledWith('pr_detail', { path: '/second', number: 901 });
    expect(useRepoStore.getState().activePath).toBe('/second');
    expect(useUiStore.getState().prFocusRequest).toMatchObject({ path: '/second', number: 901 });
  });
});
