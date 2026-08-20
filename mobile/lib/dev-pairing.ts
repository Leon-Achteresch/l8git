import * as React from 'react';

import { parsePairing } from '~/lib/protocol';
import { useConnections } from '~/lib/connections';
import { useRepoRegistry } from '~/lib/repo/registry';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useDevPairing(): void {
  const hydrated = useConnections((s) => s.hydrated);
  React.useEffect(() => {
    const raw = process.env.EXPO_PUBLIC_DEV_PAIRING;
    if (!__DEV__ || !raw || !hydrated) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pairing = parsePairing(raw);
        const state = useConnections.getState();
        if (!state.hosts.some((h) => h.hostId === pairing.hostId)) {
          await state.addHost(pairing);
        }
        state.setActiveHost(pairing.hostId);
        for (let i = 0; i < 10 && !cancelled; i += 1) {
          const runtime = useConnections.getState().runtime[pairing.hostId];
          if (runtime?.status === 'online') {
            console.log('[dev-pairing] online');
            const repo = process.env.EXPO_PUBLIC_DEV_REPO;
            if (repo) {
              await useRepoRegistry.getState().addPath(pairing.hostId, repo).catch(() => undefined);
            }
            return;
          }
          console.log('[dev-pairing] connect attempt', i, runtime?.status ?? 'idle');
          await useConnections.getState().connect(pairing.hostId).catch(() => undefined);
          await sleep(2500);
        }
      } catch (e) {
        console.log('[dev-pairing] failed', String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);
}
