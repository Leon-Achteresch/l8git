import { useQueries, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getClient, useOnlineHostIds } from '~/lib/connections';
import {
  useViewerIdentityHydration,
  viewerLoginForHost,
} from '~/lib/inbox-identity';
import {
  buildInboxSections,
  emptyInboxSections,
  inboxBadgeCount,
  normalizeHost,
  type InboxProviderCapabilities,
  type InboxPullRequest,
  type InboxRepoError,
  type InboxRepoInput,
  type InboxSections,
  type InboxWorkflowRun,
} from '~/lib/inbox';
import { hostQueryKey } from '~/lib/query';
import { useRepoRegistry, useRepoRegistryHydration } from '~/lib/repo/registry';

export const INBOX_DOMAIN = 'inbox';
export const INBOX_STALE_MS = 60_000;
export const INBOX_REFETCH_MS = 120_000;

export type InboxAgentItem = {
  key: string;
  hostId: string;
  path: string;
  repoName: string;
  title: string;
  provider: string;
  branch: string | null;
  pendingRequests: number;
  updatedAt: string;
};

type InboxRepoBase = Omit<InboxRepoInput, 'viewerLogin'>;

type RepoInboxPayload = {
  input: InboxRepoBase | null;
  providerHost: string | null;
  error: InboxRepoError | null;
};

async function loadRepoInbox(
  hostId: string,
  path: string,
  repoName: string
): Promise<RepoInboxPayload> {
  const client = getClient(hostId);
  if (!client) {
    throw new Error('host is offline');
  }

  let caps: InboxProviderCapabilities;
  try {
    caps = await client.request<InboxProviderCapabilities>('pr_provider_capabilities', { path });
  } catch {
    return { input: null, providerHost: null, error: null };
  }

  const providerHost = normalizeHost(caps.host) || null;

  let prs: InboxPullRequest[] = [];
  let error: InboxRepoError | null = null;
  try {
    prs = await client.request<InboxPullRequest[]>('pr_list', { path });
  } catch (cause) {
    error = {
      hostId,
      path,
      repoName,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }

  let defaultBranch: string | null = null;
  try {
    defaultBranch = await client.request<string | null>('pr_default_branch', { path });
  } catch {
    defaultBranch = null;
  }

  let runs: InboxWorkflowRun[] = [];
  if (caps.can_workflows) {
    try {
      runs = await client.request<InboxWorkflowRun[]>('list_workflow_runs', { path });
    } catch {
      runs = [];
    }
  }

  if (error && prs.length === 0 && runs.length === 0) {
    return { input: null, providerHost, error };
  }

  return {
    input: { hostId, path, repoName, prs, runs, defaultBranch },
    providerHost,
    error,
  };
}

export type InboxState = {
  sections: InboxSections;
  agents: InboxAgentItem[];
  errors: InboxRepoError[];
  loading: boolean;
  fetching: boolean;
  failed: boolean;
  repoCount: number;
  hostCount: number;
  badgeCount: number;
  totalCount: number;
  providerHosts: string[];
  unidentifiedHosts: string[];
};

export function usePendingAgentApprovals(): InboxAgentItem[] {
  return React.useMemo<InboxAgentItem[]>(() => [], []);
}

export type InboxRepoTarget = {
  hostId: string;
  path: string;
  name: string;
};

export function repoNameFromPath(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? path;
}

export function useInboxRepos(): InboxRepoTarget[] {
  useRepoRegistryHydration();
  const hostIds = useOnlineHostIds();
  const pathsByHost = useRepoRegistry((state) => state.pathsByHost);

  return React.useMemo(
    () =>
      hostIds.flatMap((hostId) =>
        (pathsByHost[hostId] ?? []).map((path) => ({
          hostId,
          path,
          name: repoNameFromPath(path),
        }))
      ),
    [hostIds, pathsByHost]
  );
}

export function useInbox(): InboxState & { refresh: () => Promise<void> } {
  const logins = useViewerIdentityHydration();
  const repos = useInboxRepos();
  const agents = usePendingAgentApprovals();
  const queryClient = useQueryClient();

  const state = useQueries({
    queries: repos.map((repo) => ({
      queryKey: hostQueryKey(repo.hostId, repo.path, INBOX_DOMAIN),
      queryFn: () => loadRepoInbox(repo.hostId, repo.path, repo.name),
      staleTime: INBOX_STALE_MS,
      refetchInterval: INBOX_REFETCH_MS,
      retry: 1,
    })),
    combine: (results): InboxState => {
      const inputs: InboxRepoInput[] = [];
      const errors: InboxRepoError[] = [];
      const providerHosts = new Set<string>();
      const unidentifiedHosts = new Set<string>();
      let failed = false;

      results.forEach((result, index) => {
        const providerHost = result.data?.providerHost ?? null;
        if (providerHost) {
          providerHosts.add(providerHost);
        }
        if (result.data?.input) {
          const viewerLogin = viewerLoginForHost(logins, providerHost);
          if (!viewerLogin && providerHost) {
            unidentifiedHosts.add(providerHost);
          }
          inputs.push({ ...result.data.input, viewerLogin });
        }
        if (result.data?.error) {
          errors.push(result.data.error);
        }
        if (result.error) {
          failed = true;
          const repo = repos[index];
          errors.push({
            hostId: repo.hostId,
            path: repo.path,
            repoName: repo.name,
            message: result.error instanceof Error ? result.error.message : String(result.error),
          });
        }
      });

      const sections = inputs.length > 0 ? buildInboxSections(inputs) : emptyInboxSections();
      const badgeCount = inboxBadgeCount(sections, agents.length);

      return {
        sections,
        agents,
        errors,
        loading: results.some((result) => result.isPending),
        fetching: results.some((result) => result.isFetching),
        failed,
        repoCount: repos.length,
        hostCount: new Set(repos.map((repo) => repo.hostId)).size,
        badgeCount,
        totalCount: sections.myPrs.length + badgeCount,
        providerHosts: [...providerHosts].sort(),
        unidentifiedHosts: [...unidentifiedHosts].sort(),
      };
    },
  });

  const refresh = React.useCallback(async () => {
    await queryClient.refetchQueries({
      predicate: (query) => query.queryKey[2] === INBOX_DOMAIN,
    });
  }, [queryClient]);

  return { ...state, refresh };
}

export function useInboxBadgeCount(): number {
  return useInbox().badgeCount;
}
