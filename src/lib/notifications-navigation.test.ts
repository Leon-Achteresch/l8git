import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ navigate: vi.fn(async () => {}), openThread: vi.fn(async () => {}), invoke: vi.fn(async () => ({ number: 901, title: 'Older pull request' })) }));
vi.mock('@/lib/router', () => ({ router: { navigate: mocks.navigate } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/lib/agents/active-chat-store', () => ({ chatStoreFor: () => ({ getState: () => ({ conversations: { second: { path: '/second' }, first: { path: '/first' } }, openThread: mocks.openThread }) }) }));
import { navigateToTarget } from './notifications-wiring';
import { useRepoStore } from './repo-store';
import { useUiStore } from './ui-store';

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
