import * as React from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useConnections } from '~/lib/connections';

interface AgentHostFocusState {
  hostId: string | null;
}

export const useAgentHostFocus = create<AgentHostFocusState>(() => ({ hostId: null }));

export function focusAgentHost(hostId: string | null): void {
  if (useAgentHostFocus.getState().hostId === hostId) {
    return;
  }
  useAgentHostFocus.setState({ hostId });
}

export function focusedAgentHostId(): string | null {
  return useAgentHostFocus.getState().hostId;
}

export function useOnlineAgentHostIds(): string[] {
  return useConnections(
    useShallow((state) =>
      state.hosts
        .filter((host) => state.runtime[host.hostId]?.status === 'online')
        .map((host) => host.hostId)
    )
  );
}

export function useFocusedAgentHostId(): string | null {
  const selected = useAgentHostFocus((state) => state.hostId);
  const online = useOnlineAgentHostIds();
  const resolved = selected && online.includes(selected) ? selected : (online[0] ?? null);

  React.useEffect(() => {
    if (resolved !== selected) {
      useAgentHostFocus.setState({ hostId: resolved });
    }
  }, [resolved, selected]);

  return resolved;
}
