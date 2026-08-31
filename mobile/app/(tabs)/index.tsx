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
import { EmptyState } from '~/components/empty-state';
import { HostStories } from '~/components/host-stories';
import { InboxAgentRow } from '~/components/inbox/inbox-agent-row';
import { InboxCiRow } from '~/components/inbox/inbox-ci-row';
import { InboxErrors } from '~/components/inbox/inbox-errors';
import {
  InboxIdentityDialog,
  InboxIdentityNudge,
} from '~/components/inbox/inbox-identity-dialog';
import { InboxPrRow } from '~/components/inbox/inbox-pr-row';
import { InboxSection } from '~/components/inbox/inbox-section';
import { useInbox, type InboxAgentItem } from '~/components/inbox/use-inbox';
import { RepoCard, REPO_CARD_GAP, REPO_CARD_WIDTH } from '~/components/repo-card';
import { SectionHeader } from '~/components/section-header';
import { GlassCircle, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useOpenAgentThread } from '~/components/agents/chat/route';
import { useConnections, useOnlineHostIds } from '~/lib/connections';
import type { InboxCiItem, InboxPrItem } from '~/lib/inbox';
import { ciLink, prLink } from '~/lib/repo/route';
import { palette } from '~/lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const inbox = useInbox();
  const openAgentThread = useOpenAgentThread();
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
  const openAgent = React.useCallback(
    (item: InboxAgentItem) =>
      openAgentThread({
        hostId: item.hostId,
        provider: item.provider,
        threadId: item.threadId,
        path: item.path,
      }),
    [openAgentThread]
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
        contentContainerClassName="gap-6 pb-36"
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
            <SectionHeader
              title="For you"
              count={repoCards.length}
              actionLabel="See all"
              onAction={() => router.push('/repos')}
              className="px-5 pb-0 pt-0"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={REPO_CARD_WIDTH + REPO_CARD_GAP}
              snapToAlignment="start"
              contentContainerStyle={{ paddingHorizontal: 20, gap: REPO_CARD_GAP }}>
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
            description="Add a working copy on the Repos tab. Reviews and pipelines land here."
            action={<SolidPill label="Browse repos" onPress={() => router.push('/repos')} />}
          />
        ) : null}

        {hostCount > 0 && repoCount > 0 ? (
          totalCount === 0 && !loading ? (
            <View className="gap-3 px-5">
              <SectionHeader title="Needs you" className="px-0 pb-0 pt-0" />
              <View className="flex-row items-center gap-3 rounded-[28px] bg-card px-5 py-5">
                <Icon as={CircleCheck} size={18} color={palette.success} />
                <Text className="text-muted-foreground flex-1 text-sm leading-5">
                  Nothing waiting. Reviews, red pipelines, and agent approvals show up here.
                </Text>
              </View>
            </View>
          ) : (
            <Animated.View layout={LinearTransition.duration(220)} className="gap-3">
              <SectionHeader title="Needs you" count={totalCount} className="px-5 pb-0 pt-0" />
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
                  hint="Approval requests from connected hosts appear here."
                  index={2}>
                  {agents.map((item, index) => (
                    <Animated.View key={item.key} entering={FadeIn.duration(180)}>
                      <InboxAgentRow
                        item={item}
                        showHost={showHost}
                        divider={index > 0}
                        onOpen={openAgent}
                      />
                    </Animated.View>
                  ))}
                </InboxSection>

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
