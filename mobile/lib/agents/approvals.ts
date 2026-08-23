import * as React from 'react';

import { overviewRepoName, type ProviderOverviewInput } from '@desktop/lib/agents/overview';
import type {
  AgentConversation,
  AgentPendingRequest,
  AgentThreadSummary,
} from '@desktop/lib/agents/types';

import { useHostMeta } from '~/lib/connections';

import { useAgentBinding } from './use-agent-connection';
import { useAgentHostSnapshots } from './use-agent-overview';
import { AGENT_PROVIDERS, useChatStore, type NativeAgentProvider } from './stores';

export interface PendingApproval {
  key: string;
  hostId: string;
  hostName: string;
  provider: NativeAgentProvider;
  threadId: string;
  path: string;
  repoName: string;
  threadTitle: string;
  request: AgentPendingRequest;
}

export interface ApprovalContext {
  hostId: string;
  hostName: string;
}

export interface StaleApprovalHost {
  hostId: string;
  hostName: string;
  online: boolean;
  pending: number;
}

const EMPTY_THREADS: Record<string, AgentThreadSummary[]> = {};
const EMPTY_CONVERSATIONS: Record<string, AgentConversation> = {};
const EMPTY_REQUESTS: Record<string, AgentPendingRequest[]> = {};
const EMPTY_APPROVALS: PendingApproval[] = [];

export function approvalKey(
  hostId: string,
  provider: NativeAgentProvider,
  request: AgentPendingRequest
): string {
  return `${hostId}:${provider}:${request.threadId}:${String(request.requestId)}`;
}

export function collectApprovals(
  provider: NativeAgentProvider,
  input: ProviderOverviewInput,
  context: ApprovalContext
): PendingApproval[] {
  const summaries = new Map<string, { path: string; title: string }>();
  for (const [path, threads] of Object.entries(input.threadsByPath)) {
    for (const thread of threads) {
      summaries.set(thread.id, { path, title: thread.title });
    }
  }

  const approvals: PendingApproval[] = [];
  for (const [threadId, requests] of Object.entries(input.requestsByThread)) {
    if (!requests || requests.length === 0) {
      continue;
    }
    const conversation = input.conversations[threadId];
    const summary = summaries.get(threadId);
    const path = conversation?.path ?? summary?.path ?? '';
    const title = conversation?.title || summary?.title || 'Agent thread';
    for (const request of requests) {
      approvals.push({
        key: approvalKey(context.hostId, provider, request),
        hostId: context.hostId,
        hostName: context.hostName,
        provider,
        threadId,
        path,
        repoName: path ? overviewRepoName(path) : 'Unknown repo',
        threadTitle: title,
        request,
      });
    }
  }
  return approvals;
}

export function countSnapshotApprovals(providers: {
  [key: string]: ProviderOverviewInput | undefined;
}): number {
  let total = 0;
  for (const input of Object.values(providers)) {
    if (!input) {
      continue;
    }
    for (const requests of Object.values(input.requestsByThread)) {
      total += requests?.length ?? 0;
    }
  }
  return total;
}

function useProviderInput(provider: NativeAgentProvider): ProviderOverviewInput {
  const threadsByPath = useChatStore(provider, (state) => state.threadsByPath, EMPTY_THREADS);
  const conversations = useChatStore(provider, (state) => state.conversations, EMPTY_CONVERSATIONS);
  const requestsByThread = useChatStore(
    provider,
    (state) => state.requestsByThread,
    EMPTY_REQUESTS
  );
  return React.useMemo(
    () => ({ threadsByPath, conversations, requestsByThread }),
    [conversations, requestsByThread, threadsByPath]
  );
}

export function usePendingApprovals(): PendingApproval[] {
  const hostId = useAgentBinding((state) => state.hostId);
  const meta = useHostMeta(hostId);
  const hostName = meta?.name ?? hostId ?? '';

  const codex = useProviderInput('codex');
  const claude = useProviderInput('claude');
  const cursor = useProviderInput('cursor');
  const opencode = useProviderInput('opencode');

  return React.useMemo(() => {
    if (!hostId) {
      return EMPTY_APPROVALS;
    }
    const context: ApprovalContext = { hostId, hostName };
    const inputs: Record<NativeAgentProvider, ProviderOverviewInput> = {
      codex,
      claude,
      cursor,
      opencode,
    };
    const approvals = AGENT_PROVIDERS.flatMap((provider) =>
      collectApprovals(provider, inputs[provider], context)
    );
    return approvals.length === 0 ? EMPTY_APPROVALS : approvals;
  }, [claude, codex, cursor, hostId, hostName, opencode]);
}

export function usePendingApprovalCount(): number {
  return usePendingApprovals().length;
}

export function useStaleApprovalHosts(): StaleApprovalHost[] {
  const snapshots = useAgentHostSnapshots();
  const boundHostId = useAgentBinding((state) => state.hostId);
  return React.useMemo(
    () =>
      snapshots
        .filter((snapshot) => snapshot.hostId !== boundHostId)
        .map((snapshot) => ({
          hostId: snapshot.hostId,
          hostName: snapshot.hostName,
          online: snapshot.online,
          pending: countSnapshotApprovals(snapshot.providers),
        }))
        .filter((entry) => entry.pending > 0),
    [boundHostId, snapshots]
  );
}

export function useApprovalsByThread(threadId: string | null | undefined): PendingApproval[] {
  const approvals = usePendingApprovals();
  return React.useMemo(
    () => (threadId ? approvals.filter((approval) => approval.threadId === threadId) : EMPTY_APPROVALS),
    [approvals, threadId]
  );
}
