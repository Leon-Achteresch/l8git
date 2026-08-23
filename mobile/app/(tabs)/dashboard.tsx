import { RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { compactNumber } from '~/components/dashboard/aggregate';
import { HostSection } from '~/components/dashboard/host-section';
import {
  useDashboardRefresh,
  useHostOverviews,
  useHostRepoEntries,
  useOverviewInvalidation,
} from '~/components/dashboard/queries';
import { StatTile } from '~/components/dashboard/stat-tile';
import { EmptyState } from '~/components/empty-state';
import { GlassCircle } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { useConnections, useOnlineHostIds } from '~/lib/connections';
import { palette } from '~/lib/theme';

export default function DashboardScreen() {
  const pairedCount = useConnections((state) => state.hosts.length);
  const onlineHostIds = useOnlineHostIds();
  const entries = useHostRepoEntries(onlineHostIds);
  const overviews = useHostOverviews(entries);
  const refresh = useDashboardRefresh();
  const [refreshing, setRefreshing] = React.useState(false);

  useOverviewInvalidation(onlineHostIds);

  const loading = overviews.some((query) => query.isPending);
  const totals = React.useMemo(() => {
    let repos = 0;
    let dirty = 0;
    let ahead = 0;
    let behind = 0;
    let commits = 0;
    for (const query of overviews) {
      for (const repo of query.data ?? []) {
        repos += 1;
        ahead += repo.ahead;
        behind += repo.behind;
        commits += repo.commits_last_30d.reduce((acc, value) => acc + value, 0);
        if (repo.dirty_count > 0) {
          dirty += 1;
        }
      }
    }
    return { repos, dirty, ahead, behind, commits };
  }, [overviews]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center justify-between gap-3 px-5 pb-4 pt-1">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-3xl font-bold tracking-tight">Dashboard</Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {pairedCount === 0
              ? 'No hosts paired yet'
              : `${onlineHostIds.length} of ${pairedCount} hosts online`}
          </Text>
        </View>
        <GlassCircle icon={RotateCw} label="Refresh dashboard" onPress={onRefresh} />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-5 pb-32 pt-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.mutedForeground}
            colors={[palette.foreground]}
            progressBackgroundColor={palette.card}
          />
        }>
        {pairedCount === 0 ? (
          <EmptyState
            illustration="host"
            title="No hosts paired"
            description="Pair an l8gitd host in Settings to see live repo metrics."
          />
        ) : onlineHostIds.length === 0 ? (
          <EmptyState
            illustration="host"
            title="Every host is offline"
            description="Metrics appear as soon as a paired host reconnects."
          />
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3">
              <StatTile
                label="Repos"
                value={String(totals.repos)}
                loading={loading && totals.repos === 0}
              />
              <StatTile
                label="Commits 30d"
                value={compactNumber(totals.commits)}
                loading={loading && totals.repos === 0}
              />
              <StatTile
                label="Dirty repos"
                value={String(totals.dirty)}
                tone={totals.dirty > 0 ? 'warning' : 'default'}
                loading={loading && totals.repos === 0}
              />
              <StatTile
                label="Ahead / behind"
                value={`${totals.ahead}/${totals.behind}`}
                tone={totals.behind > 0 ? 'danger' : 'default'}
                loading={loading && totals.repos === 0}
              />
            </View>

            {entries.map((entry, index) => (
              <HostSection
                key={entry.hostId}
                hostId={entry.hostId}
                paths={entry.paths}
                overview={overviews[index]}
                index={index}
              />
            ))}

            <Text className="text-muted-foreground/60 pt-4 text-center text-2xs">
              Pull to refresh · drag across the chart to inspect a bucket
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
