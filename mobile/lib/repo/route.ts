import { useGlobalSearchParams, useLocalSearchParams, type Href } from 'expo-router';
import * as React from 'react';

export const REPO_ROUTE = '/repos/[hostId]/[repo]' as const;

export const REPO_SECTIONS = ['index', 'history', 'branches', 'stash', 'pr', 'ci'] as const;

export type RepoSection = (typeof REPO_SECTIONS)[number];

export const REPO_SECTION_LABEL: Record<RepoSection, string> = {
  index: 'Status',
  history: 'History',
  branches: 'Branches',
  stash: 'Stash',
  pr: 'PRs',
  ci: 'CI',
};

export const REPO_SECTION_ROUTE = {
  index: REPO_ROUTE,
  history: `${REPO_ROUTE}/history`,
  branches: `${REPO_ROUTE}/branches`,
  stash: `${REPO_ROUTE}/stash`,
  pr: `${REPO_ROUTE}/pr`,
  ci: `${REPO_ROUTE}/ci`,
} as const satisfies Record<RepoSection, string>;

export function repoRouteParams(hostId: string, repoPath: string): Record<string, string> {
  return { hostId, repo: repoPath };
}

export function repoSectionHref(section: RepoSection, hostId: string, repoPath: string): Href {
  return {
    pathname: REPO_SECTION_ROUTE[section],
    params: repoRouteParams(hostId, repoPath),
  } as Href;
}

export function repoLink(hostId: string, repoPath: string): Href {
  return repoSectionHref('index', hostId, repoPath);
}

export function prLink(hostId: string, repoPath: string, number: number): Href {
  return {
    pathname: `${REPO_ROUTE}/pr/[number]`,
    params: { ...repoRouteParams(hostId, repoPath), number: String(number) },
  } as Href;
}

export function ciLink(hostId: string, repoPath: string, runId?: number): Href {
  return {
    pathname: `${REPO_ROUTE}/ci`,
    params: {
      ...repoRouteParams(hostId, repoPath),
      ...(runId === undefined ? {} : { runId: String(runId) }),
    },
  } as Href;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export function decodeRouteValue(value: string | string[] | undefined): string {
  const raw = firstParam(value);
  if (!raw.includes('%')) {
    return raw;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const decodeRepoParam = decodeRouteValue;

export type RepoRoute = {
  hostId: string;
  repoPath: string;
  ready: boolean;
};

export function useRepoRoute(): RepoRoute {
  const local = useLocalSearchParams<{ hostId?: string; repo?: string }>();
  const global = useGlobalSearchParams<{ hostId?: string; repo?: string }>();

  const hostId = decodeRouteValue(local.hostId) || decodeRouteValue(global.hostId);
  const repoPath = decodeRouteValue(local.repo) || decodeRouteValue(global.repo);

  return React.useMemo(
    () => ({ hostId, repoPath, ready: hostId.length > 0 && repoPath.length > 0 }),
    [hostId, repoPath]
  );
}

export function sectionFromSegments(segments: readonly string[]): RepoSection {
  const last = segments[segments.length - 1] ?? '';
  return (REPO_SECTIONS as readonly string[]).includes(last) ? (last as RepoSection) : 'index';
}

export function isRepoDetailRoute(segments: readonly string[]): boolean {
  const last = segments[segments.length - 1] ?? '';
  return last.startsWith('[') && last !== '[repo]';
}
