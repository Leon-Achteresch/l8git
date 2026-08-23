import { setKnownRepoPathsSource } from '@desktop/lib/agents/known-repo-paths';

import { useConnections } from '~/lib/connections';
import { useRepoRegistry } from '~/lib/repo/registry';

const EMPTY: readonly string[] = [];

export function onlineHostIds(): string[] {
  const { hosts, runtime } = useConnections.getState();
  return hosts
    .filter((host) => runtime[host.hostId]?.status === 'online')
    .map((host) => host.hostId);
}

export function knownRepoPathsForHosts(hostIds: readonly string[]): string[] {
  const { pathsByHost } = useRepoRegistry.getState();
  const paths = new Set<string>();
  for (const hostId of hostIds) {
    for (const path of pathsByHost[hostId] ?? EMPTY) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

function snapshot(): string[] {
  return knownRepoPathsForHosts(onlineHostIds());
}

export function installKnownRepoPathsSource(): () => void {
  let cache = snapshot();
  const listeners = new Set<() => void>();

  const refresh = () => {
    const next = snapshot();
    if (next.length === cache.length && next.every((path, index) => path === cache[index])) {
      return;
    }
    cache = next;
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const offConnections = useConnections.subscribe(refresh);
  const offRegistry = useRepoRegistry.subscribe(refresh);

  setKnownRepoPathsSource({
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => cache,
  });

  void useRepoRegistry.getState().hydrate().then(refresh);

  return () => {
    offConnections();
    offRegistry();
    listeners.clear();
    setKnownRepoPathsSource({ subscribe: () => () => undefined, get: () => EMPTY });
  };
}
