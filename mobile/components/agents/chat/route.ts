import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as React from 'react';

import { decodeRouteValue } from '~/lib/repo/route';
import { focusAgentHost } from '~/lib/agents/host-focus';
import { selectProvider } from '~/lib/agents/provider-selection';
import { AGENT_PROVIDERS, type NativeAgentProvider } from '~/lib/agents/stores';

export const AGENT_THREAD_ROUTE = '/agents/[hostId]/[provider]/[thread]' as const;

export const NEW_AGENT_THREAD = 'new';

export interface AgentThreadTarget {
  hostId: string;
  provider: NativeAgentProvider;
  threadId: string | null;
  path: string;
}

export function agentThreadHref(target: AgentThreadTarget): Href {
  return {
    pathname: AGENT_THREAD_ROUTE,
    params: {
      hostId: target.hostId,
      provider: target.provider,
      thread: target.threadId ?? NEW_AGENT_THREAD,
      path: target.path,
    },
  } as Href;
}

export function bindAgentThreadTarget(target: AgentThreadTarget): void {
  focusAgentHost(target.hostId);
  selectProvider(target.provider, target.hostId);
}

export function useOpenAgentThread(): (target: AgentThreadTarget) => void {
  const router = useRouter();
  return React.useCallback(
    (target: AgentThreadTarget) => {
      bindAgentThreadTarget(target);
      router.push(agentThreadHref(target));
    },
    [router]
  );
}

function asProvider(value: string): NativeAgentProvider | null {
  return AGENT_PROVIDERS.includes(value as NativeAgentProvider)
    ? (value as NativeAgentProvider)
    : null;
}

export interface AgentThreadRoute {
  hostId: string;
  provider: NativeAgentProvider | null;
  threadId: string | null;
  path: string;
  ready: boolean;
}

export function useAgentThreadRoute(): AgentThreadRoute {
  const params = useLocalSearchParams<{
    hostId?: string;
    provider?: string;
    thread?: string;
    path?: string;
  }>();

  const hostId = decodeRouteValue(params.hostId);
  const provider = asProvider(decodeRouteValue(params.provider));
  const rawThread = decodeRouteValue(params.thread);
  const threadId = !rawThread || rawThread === NEW_AGENT_THREAD ? null : rawThread;
  const path = decodeRouteValue(params.path);

  return React.useMemo(
    () => ({
      hostId,
      provider,
      threadId,
      path,
      ready: hostId.length > 0 && provider !== null && path.length > 0,
    }),
    [hostId, path, provider, threadId]
  );
}
