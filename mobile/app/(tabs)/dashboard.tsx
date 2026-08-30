import { RotateCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
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
import { ActivityHero } from '~/components/activity-hero';
import { EmptyState } from '~/components/empty-state';
import { GlassCircle, SolidPill } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { useConnections, useOnlineHostIds } from '~/lib/connections';
import { palette } from '~/lib/theme';

export default function DashboardScreen() {
  const router = useRouter();
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
    const series = Array.from({ length: 30 }, () => 0);
    for (const query of overviews) {
      for (const repo of query.data ?? []) {
        repos += 1;
        ahead += repo.ahead;
        behind += repo.behind;
        commits += repo.commits_last_30d.reduce((acc, value) => acc + value, 0);
        repo.commits_last_30d.forEach((value, index) => {
          if (index < series.length) {
            series[index] += value;
          }
        });
        if (repo.dirty_count > 0) {
          dirty += 1;
        }
      }
    }
    return { repos, dirty, ahead, behind, commits, series };
  }, [overviews]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center justify-between gap-3 px-5 pb-4 pt-1">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[32px] font-bold tracking-tight">Dashboard</Text>
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
        contentContainerClassName="gap-5 px-5 pb-36 pt-1"
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
            action={<SolidPill label="Pair a host" onPress={() => router.push('/settings')} />}
          />
        ) : (
          <>
            <ActivityHero
              commits={compactNumber(totals.commits)}
              series={totals.series}
              dirty={totals.dirty}
              ahead={totals.ahead}
              behind={totals.behind}
              loading={loading && totals.repos === 0}
            />

            {onlineHostIds.length === 0 ? (
              <EmptyState
                illustration="host"
                title="Every host is offline"
                description="Host detail cards appear as soon as a paired machine reconnects."
                className="py-10"
              />
            ) : (
              entries.map((entry, index) => (
                <HostSection
                  key={entry.hostId}
                  hostId={entry.hostId}
                  paths={entry.paths}
                  overview={overviews[index]}
                  index={index}
                />
              ))
            )}

            <Text className="text-muted-foreground/60 pt-4 text-center text-2xs">
              Pull to refresh
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
