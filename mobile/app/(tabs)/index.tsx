import { useRouter } from 'expo-router';
import {
  Bell,
  Bot,
  CircleCheck,
  Eye,
  FolderGit2,
  GitPullRequest,
  Plug,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
  WifiOff,
} from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { useHostOverviews, useHostRepoEntries } from '~/components/dashboard/queries';
import { HostStories, RepoCard } from '~/components/home';
import { InboxCiRow } from '~/components/inbox/inbox-ci-row';
import { InboxErrors } from '~/components/inbox/inbox-errors';
import {
  InboxIdentityDialog,
  InboxIdentityNudge,
} from '~/components/inbox/inbox-identity-dialog';
import { InboxPrRow } from '~/components/inbox/inbox-pr-row';
import { InboxSection } from '~/components/inbox/inbox-section';
import { useInbox } from '~/components/inbox/use-inbox';
import { EmptyState } from '~/components/empty-state';
import { GlassCircle, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections, useOnlineHostIds } from '~/lib/connections';
import type { InboxCiItem, InboxPrItem } from '~/lib/inbox';
import { ciLink, prLink } from '~/lib/repo/route';
import { palette } from '~/lib/theme';

function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <View className="flex-row items-center gap-2 px-5">
      <Text className="text-foreground text-base font-semibold">{title}</Text>
      {typeof count === 'number' && count > 0 ? (
        <Text style={{ fontVariant: ['tabular-nums'] }} className="text-muted-foreground text-sm">
          {count}
        </Text>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const inbox = useInbox();
  const pairedHosts = useConnections((state) => state.hosts.length);
  const onlineHostIds = useOnlineHostIds();
  const entries = useHostRepoEntries(onlineHostIds);
  const overviews = useHostOverviews(entries);
  const [refreshing, setRefreshing] = React.useState(false);

  const repoCards = React.useMemo(
    () =>
      entries.flatMap(({ hostId }, hostIndex) =>
        (overviews[hostIndex]?.data ?? []).map((overview) => ({ hostId, overview }))
      ),
    [entries, overviews]
  );

  const {
    sections,
    agents,
    errors,
    loading,
    fetching,
    refresh,
    repoCount,
    hostCount,
    totalCount,
    providerHosts,
    unidentifiedHosts,
  } = inbox;
  const showHost = hostCount > 1;
  const [identityOpen, setIdentityOpen] = React.useState(false);
  const [nudgeDismissed, setNudgeDismissed] = React.useState(false);
  const openIdentity = React.useCallback(() => setIdentityOpen(true), []);
  const dismissNudge = React.useCallback(() => setNudgeDismissed(true), []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), ...overviews.map((query) => query.refetch())]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, overviews]);

  const openPr = React.useCallback(
    (item: InboxPrItem) => router.push(prLink(item.hostId, item.path, item.number)),
    [router]
  );
  const openCi = React.useCallback(
    (item: InboxCiItem) => router.push(ciLink(item.hostId, item.path, item.runId)),
    [router]
  );

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center justify-between px-5 pb-4 pt-2">
        <GlassCircle
          icon={SlidersHorizontal}
          label="Settings"
          onPress={() => router.push('/settings')}
        />
        <View className="flex-row items-center gap-3">
          {providerHosts.length > 0 ? (
            <GlassCircle icon={UserRound} label="Edit your review handles" onPress={openIdentity} />
          ) : null}
          <GlassCircle
            icon={Bell}
            label={`${totalCount} items need you`}
            badge={totalCount}
            onPress={() => router.push('/agents/approvals')}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.mutedForeground}
            colors={[palette.foreground]}
            progressBackgroundColor={palette.card}
          />
        }>
        <HostStories />

        <View className="px-5">
          <InboxErrors errors={errors} busy={fetching} onRetry={() => void onRefresh()} />
          <InboxIdentityNudge
            hosts={nudgeDismissed ? [] : unidentifiedHosts}
            onPress={openIdentity}
            onDismiss={dismissNudge}
          />
        </View>

        {pairedHosts === 0 ? (
          <EmptyState
            icon={Plug}
            title="No host paired"
            description="Scan the QR code from l8gitd pair to connect your first machine."
            action={<SolidPill label="Pair a host" onPress={() => router.push('/settings')} />}
          />
        ) : hostCount === 0 ? (
          <EmptyState
            icon={WifiOff}
            title="All hosts offline"
            description="Reconnecting in the background. Pull down to retry now."
          />
        ) : null}

        {repoCards.length > 0 ? (
          <View className="gap-3">
            <SectionLabel title="For you" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={248 + 12}
              snapToAlignment="start"
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {repoCards.map(({ hostId, overview }, index) => (
                <RepoCard
                  key={`${hostId}:${overview.path}`}
                  hostId={hostId}
                  overview={overview}
                  index={index}
                />
              ))}
            </ScrollView>
          </View>
        ) : hostCount > 0 && repoCount === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="No repos tracked yet"
            description="Open a repo on the Repos tab and its reviews and pipelines land here."
            action={<SolidPill label="Browse repos" onPress={() => router.push('/repos')} />}
          />
        ) : null}

        {hostCount > 0 && repoCount > 0 ? (
          totalCount === 0 && !loading ? (
            <View className="gap-3">
              <SectionLabel title="Needs you" />
              <View className="bg-card mx-5 flex-row items-center gap-3 rounded-[28px] px-5 py-4">
                <Icon as={CircleCheck} size={18} color={palette.success} />
                <Text className="text-muted-foreground flex-1 text-sm">
                  No reviews waiting, no red pipelines, nothing needs you right now.
                </Text>
              </View>
            </View>
          ) : (
            <Animated.View layout={LinearTransition.duration(220)} className="gap-3">
              <SectionLabel title="Needs you" count={totalCount} />
              <View className="gap-3 px-5">
                <InboxSection
                  icon={Eye}
                  title="Awaiting your review"
                  count={sections.reviewRequested.length}
                  hint="No pull request is waiting for your review."
                  loading={loading}
                  index={0}>
                  {sections.reviewRequested.map((item, index) => (
                    <Animated.View key={item.key} entering={FadeIn.duration(180)}>
                      <InboxPrRow item={item} showHost={showHost} divider={index > 0} onOpen={openPr} />
                    </Animated.View>
                  ))}
                </InboxSection>

                <InboxSection
                  icon={TriangleAlert}
                  title="Failing pipelines"
                  count={sections.redRuns.length}
                  color={palette.destructive}
                  hint="Every tracked branch is green."
                  loading={loading}
                  index={1}>
                  {sections.redRuns.map((item, index) => (
                    <Animated.View key={item.key} entering={FadeIn.duration(180)}>
                      <InboxCiRow item={item} showHost={showHost} divider={index > 0} onOpen={openCi} />
                    </Animated.View>
                  ))}
                </InboxSection>

                <InboxSection
                  icon={Bot}
                  title="Agents awaiting approval"
                  count={agents.length}
                  hint="Approval requests from every connected host will appear here."
                  index={2}
                />

                <InboxSection
                  icon={GitPullRequest}
                  title="My open pull requests"
                  count={sections.myPrs.length}
                  hint="You have no open pull requests."
                  loading={loading}
                  index={3}>
                  {sections.myPrs.map((item, index) => (
                    <Animated.View key={item.key} entering={FadeIn.duration(180)}>
                      <InboxPrRow item={item} showHost={showHost} divider={index > 0} onOpen={openPr} />
                    </Animated.View>
                  ))}
                </InboxSection>
              </View>
            </Animated.View>
          )
        ) : null}
      </ScrollView>

      <InboxIdentityDialog open={identityOpen} onOpenChange={setIdentityOpen} hosts={providerHosts} />
    </SafeAreaView>
  );
}
