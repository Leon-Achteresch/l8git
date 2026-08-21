import type { UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { ActivityCard } from '~/components/dashboard/activity-card';
import { RANGES, daysSince, type RangeKey } from '~/components/dashboard/aggregate';
import { ContributorsCard } from '~/components/dashboard/contributors-card';
import { LanguagesCard } from '~/components/dashboard/languages-card';
import { PanelError } from '~/components/dashboard/panel';
import {
  useBranchActivity,
  useOpenPullRequests,
  type RepoOverview,
} from '~/components/dashboard/queries';
import { RepoChips } from '~/components/dashboard/repo-chips';
import { RepoTile } from '~/components/dashboard/repo-tile';
import { StatTile } from '~/components/dashboard/stat-tile';
import { EmptyState } from '~/components/empty-state';
import { repoName } from '~/components/shared/format';
import { illustrations } from '~/lib/illustrations';
import { palette } from '~/lib/theme';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { useHostMeta, useHostRuntime } from '~/lib/connections';
import { repoLink } from '~/lib/repo/route';

const ACTIVE_BRANCH_WINDOW_DAYS = 14;

export function HostSection({
  hostId,
  paths,
  overview,
  index,
}: {
  hostId: string;
  paths: readonly string[];
  overview: UseQueryResult<RepoOverview[]>;
  index: number;
}) {
  const router = useRouter();
  const meta = useHostMeta(hostId);
  const runtime = useHostRuntime(hostId);
  const accent = palette.foreground;
  const [range, setRange] = React.useState<RangeKey>('1m');
  const [picked, setPicked] = React.useState<string | null>(null);

  const repos = React.useMemo(() => overview.data ?? [], [overview.data]);
  const byPath = React.useMemo(
    () => new Map(repos.map((repo) => [repo.path, repo])),
    [repos]
  );

  const chips = React.useMemo(
    () =>
      paths.map((path) => {
        const repo = byPath.get(path);
        return {
          path,
          name: repo?.name || repoName(path),
          dirty: (repo?.dirty_count ?? 0) > 0,
        };
      }),
    [byPath, paths]
  );

  const selectedPath = picked && paths.includes(picked) ? picked : (paths[0] ?? null);
  const selected = selectedPath ? (byPath.get(selectedPath) ?? null) : null;

  const branches = useBranchActivity(hostId, selectedPath);
  const prs = useOpenPullRequests(hostId, selectedPath);

  const activeBranches = React.useMemo(() => {
    if (!branches.data) {
      return null;
    }
    return branches.data.filter((branch) => {
      if (branch.is_remote) {
        return false;
      }
      const age = daysSince(branch.last_commit_at);
      return age !== null && age <= ACTIVE_BRANCH_WINDOW_DAYS;
    }).length;
  }, [branches.data]);

  const openPrs = React.useMemo(() => {
    if (!prs.data) {
      return null;
    }
    return prs.data.filter((pr) => (pr.state ? pr.state.toLowerCase() === 'open' : true)).length;
  }, [prs.data]);

  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 70)}
      layout={LinearTransition.duration(200)}
      className="gap-3 pt-3">
      <View className="flex-row items-center gap-2.5">
        <Image
          source={illustrations.host}
          resizeMode="cover"
          style={{ width: 40, height: 40, borderRadius: 13 }}
        />
        <Text numberOfLines={1} className="text-foreground max-w-52 text-lg font-bold tracking-tight">
          {meta?.name ?? hostId}
        </Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-muted-foreground text-xs">
          {`${paths.length} ${paths.length === 1 ? 'repo' : 'repos'}`}
        </Text>
        <View className="flex-1" />
        {runtime.latencyMs === null ? null : (
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground/70 font-mono text-2xs">
            {`${Math.round(runtime.latencyMs)} ms`}
          </Text>
        )}
      </View>

      {paths.length === 0 ? (
        <EmptyState
          illustration="repo"
          title="No repos tracked here"
          description="Add repos on the Repos tab to see this host's metrics."
          className="py-8"
        />
      ) : (
        <>
          <RepoChips chips={chips} selected={selectedPath} accent={accent} onSelect={setPicked} />

          {overview.isPending ? (
            <View className="flex-row flex-wrap gap-3">
              {Array.from({ length: Math.min(4, paths.length) }).map((_, tile) => (
                <Skeleton
                  key={tile}
                  className="h-[150px] rounded-2xl opacity-60"
                  style={{ width: '48%' }}
                />
              ))}
            </View>
          ) : overview.isError ? (
            <PanelError
              message="This host did not return a repo overview."
              onRetry={() => void overview.refetch()}
            />
          ) : (
            <View className="flex-row flex-wrap gap-3">
              {repos.map((repo, tileIndex) => (
                <RepoTile
                  key={repo.path}
                  repo={repo}
                  accent={accent}
                  index={tileIndex}
                  selected={repo.path === selectedPath}
                  onPress={() => setPicked(repo.path)}
                  onOpen={() => router.push(repoLink(hostId, repo.path))}
                />
              ))}
            </View>
          )}

          <View className="flex-row flex-wrap gap-3">
            <StatTile
              label="Dirty files"
              value={selected ? String(selected.dirty_count) : '—'}
              tone={selected && selected.dirty_count > 0 ? 'warning' : 'default'}
              loading={overview.isPending}
            />
            <StatTile
              label="Ahead / behind"
              value={selected ? `${selected.ahead}/${selected.behind}` : '—'}
              tone={selected && selected.behind > 0 ? 'danger' : 'default'}
              loading={overview.isPending}
            />
            <StatTile
              label="Active branches"
              value={activeBranches === null ? '—' : String(activeBranches)}
              tone="branch"
              loading={branches.isPending && Boolean(selectedPath)}
            />
            <StatTile
              label="Open PRs"
              value={openPrs === null ? '—' : String(openPrs)}
              tone={openPrs && openPrs > 0 ? 'success' : 'default'}
              loading={prs.isPending && Boolean(selectedPath)}
            />
          </View>

          <ActivityCard
            hostId={hostId}
            repoPath={selectedPath}
            accent={accent}
            range={range}
            onRangeChange={setRange}
          />

          <ContributorsCard
            hostId={hostId}
            repoPath={selectedPath}
            sinceDays={RANGES[range].days}
            rangeLabel={RANGES[range].long}
          />

          <LanguagesCard hostId={hostId} repoPath={selectedPath} />
        </>
      )}
    </Animated.View>
  );
}
