import { useRouter } from 'expo-router';
import { GitPullRequest, GitPullRequestClosed, RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import { useRepoScope } from '~/components/repo/git-queries';
import { PrFilterChips } from '~/components/repo/pr/pr-filter-chips';
import { usePrCapabilities, usePrList, usePrRefresh } from '~/components/repo/pr/pr-queries';
import { PrRow } from '~/components/repo/pr/pr-row';
import {
  countPrFilters,
  matchesPrFilter,
  providerUnknownHost,
  type PrFilter,
  type PullRequest,
} from '~/components/repo/pr/pr-types';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { useRepoRoute } from '~/lib/repo/route';
import { errorMessage } from '~/components/repo/git-types';
import { SkeletonList } from '~/components/skeleton-list';
import { GlassCircle } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const EMPTY_COUNTS = { open: 0, merged: 0, closed: 0, all: 0 } as const;

const EMPTY_COPY: Record<PrFilter, { title: string; description: string }> = {
  open: {
    title: 'No open pull requests',
    description: 'Everything on this repository is merged or closed.',
  },
  merged: {
    title: 'Nothing merged yet',
    description: 'Merged pull requests will show up here.',
  },
  closed: {
    title: 'No closed pull requests',
    description: 'Pull requests closed without merging appear here.',
  },
  all: {
    title: 'No pull requests',
    description: 'This repository has no pull requests on its remote provider.',
  },
};

export default function RepoPullRequestsScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const scope = useRepoScope(hostId, repoPath);
  const [filter, setFilter] = React.useState<PrFilter>('open');

  const caps = usePrCapabilities(scope);
  const list = usePrList(scope);
  const refresh = usePrRefresh(scope);

  const prs = React.useMemo<PullRequest[]>(() => list.data ?? [], [list.data]);
  const counts = React.useMemo(() => (prs.length > 0 ? countPrFilters(prs) : EMPTY_COUNTS), [prs]);
  const visible = React.useMemo(
    () => prs.filter((pr) => matchesPrFilter(pr, filter)),
    [filter, prs]
  );

  const openPr = React.useCallback(
    (number: number) => {
      router.push({
        pathname: '/repos/[hostId]/[repo]/pr/[number]',
        params: { hostId, repo: repoPath, number: String(number) },
      });
    },
    [hostId, repoPath, router]
  );

  const renderItem = React.useCallback(
    ({ item, index }: { item: PullRequest; index: number }) => (
      <PrRow
        pr={item}
        first={index === 0}
        last={index === visible.length - 1}
        onPress={openPr}
      />
    ),
    [openPr, visible.length]
  );

  if (!scope.online) {
    return (
      <View className="bg-background flex-1">
        <OfflineState hostId={hostId} />
      </View>
    );
  }

  const unknownHost = list.isError ? providerUnknownHost(errorMessage(list.error)) : null;

  return (
    <View className="bg-background flex-1">
      <View className="gap-2 px-5 pb-3 pt-1">
        <PrFilterChips
          value={filter}
          counts={counts}
          onChange={setFilter}
          trailing={
            <GlassCircle
              icon={RotateCw}
              label="Reload pull requests"
              size={36}
              color={list.isFetching ? palette.foreground : palette.mutedForeground}
              onPress={refresh}
            />
          }
        />
        {caps.data ? (
          <Text className="text-muted-foreground px-1 text-2xs">
            {caps.data.label} · {caps.data.host}
            {caps.data.merge_strategies.length > 0
              ? ` · merge: ${caps.data.merge_strategies.join(', ')}`
              : ''}
          </Text>
        ) : null}
      </View>

      {list.isError ? (
        <View className="px-5">
          <QueryErrorState
            title={
              unknownHost
                ? `No provider configured for ${unknownHost}`
                : 'Could not load pull requests'
            }
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        </View>
      ) : list.isPending ? (
        <View className="px-5 pt-1">
          <SkeletonList rows={6} />
        </View>
      ) : visible.length === 0 ? (
        <Animated.View entering={FadeIn.duration(180)} className="flex-1">
          <EmptyState
            icon={filter === 'closed' ? GitPullRequestClosed : GitPullRequest}
            title={prs.length === 0 ? EMPTY_COPY.all.title : EMPTY_COPY[filter].title}
            description={
              prs.length === 0 ? EMPTY_COPY.all.description : EMPTY_COPY[filter].description
            }
          />
        </Animated.View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.number)}
          renderItem={renderItem}
          contentContainerClassName="px-5 pb-28"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={refresh}
              tintColor={palette.mutedForeground}
            />
          }
        />
      )}
    </View>
  );
}
