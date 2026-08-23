import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => undefined }),
  },
}));

vi.mock('expo-router', () => ({
  router: { push: () => undefined, replace: () => undefined },
}));

vi.mock('expo-haptics', () => ({
  impactAsync: async () => undefined,
  notificationAsync: async () => undefined,
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import { useAgentBinding } from './binding';
import { recordBoundSnapshot, recordHostSnapshot, useAgentSnapshots } from './snapshots';

const options = (hostId: string) => ({
  hostId,
  hostName: hostId,
  online: true,
  knownPaths: [`/repos/${hostId}`],
});

beforeEach(() => {
  useAgentSnapshots.setState({ byHost: {} });
  useAgentBinding.setState({ hostId: null, epoch: 0 });
});

describe('recordBoundSnapshot', () => {
  it('records the snapshot of the host the chat stores are bound to', () => {
    useAgentBinding.setState({ hostId: 'host-b' });
    recordBoundSnapshot(options('host-b'));
    expect(useAgentSnapshots.getState().byHost['host-b']).toBeDefined();
  });

  it('never files the bound host state under a different host', () => {
    useAgentBinding.setState({ hostId: 'host-b' });
    recordBoundSnapshot(options('host-a'));
    expect(useAgentSnapshots.getState().byHost['host-a']).toBeUndefined();
  });

  it('drops the snapshot while nothing is bound', () => {
    recordBoundSnapshot(options('host-a'));
    expect(useAgentSnapshots.getState().byHost).toEqual({});
  });

  it('leaves an earlier snapshot of that host untouched', () => {
    useAgentBinding.setState({ hostId: 'host-a' });
    recordHostSnapshot(options('host-a'));
    const before = useAgentSnapshots.getState().byHost['host-a'];

    useAgentBinding.setState({ hostId: 'host-b' });
    recordBoundSnapshot(options('host-a'));

    expect(useAgentSnapshots.getState().byHost['host-a']).toBe(before);
  });
});
