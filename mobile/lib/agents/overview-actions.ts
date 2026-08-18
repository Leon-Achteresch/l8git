import { agentSendHaptic } from './attention';
import { focusAgentHost } from './host-focus';
import { selectProvider } from './provider-selection';
import { AGENT_PROVIDERS, tryChatStore, type NativeAgentProvider } from './stores';
import { useAgentBinding } from './use-agent-connection';
import { useAgentSnapshots } from './snapshots';

const BIND_TIMEOUT_MS = 12_000;

export function waitForAgentHost(hostId: string, timeoutMs = BIND_TIMEOUT_MS): Promise<void> {
  if (useAgentBinding.getState().hostId === hostId) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let off: () => void = () => undefined;
    const timer = setTimeout(() => {
      off();
      reject(new Error('The host did not become ready in time.'));
    }, timeoutMs);
    off = useAgentBinding.subscribe((state) => {
      if (state.hostId !== hostId) {
        return;
      }
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

export async function refreshAgentThreads(paths: readonly string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  await Promise.all(
    AGENT_PROVIDERS.map(async (provider) => {
      const store = tryChatStore(provider);
      if (!store) {
        return;
      }
      try {
        await store.getState().loadThreads(unique);
      } catch {
        return;
      }
    })
  );
}

export interface CreateAgentThreadInput {
  hostId: string;
  provider: NativeAgentProvider;
  path: string;
}

export async function createAgentThread(input: CreateAgentThreadInput): Promise<string> {
  focusAgentHost(input.hostId);
  await waitForAgentHost(input.hostId);
  selectProvider(input.provider, input.hostId);
  const store = tryChatStore(input.provider);
  if (!store) {
    throw new Error('The agent runtime is not ready yet.');
  }
  const release = store.getState().retainSurface();
  try {
    await store.getState().connect();
    const threadId = await store.getState().createThread(input.path);
    agentSendHaptic();
    return threadId;
  } finally {
    release();
  }
}

export function agentSnapshotAge(hostId: string, now = Date.now()): number | null {
  const snapshot = useAgentSnapshots.getState().byHost[hostId];
  if (!snapshot || snapshot.capturedAt === 0) {
    return null;
  }
  return now - snapshot.capturedAt;
}

export function useAgentApprovalBadge(): number {
  return useAgentSnapshots((state) => {
    let pending = 0;
    for (const snapshot of Object.values(state.byHost)) {
      if (!snapshot.bound) {
        continue;
      }
      for (const input of Object.values(snapshot.providers)) {
        for (const requests of Object.values(input?.requestsByThread ?? {})) {
          pending += requests.length;
        }
      }
    }
    return pending;
  });
}
