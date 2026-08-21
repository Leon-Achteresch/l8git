import { useRouter } from 'expo-router';
import {
  Bot,
  Eye,
  FolderGit2,
  GitPullRequest,
  Plug,
  TriangleAlert,
  UserRound,
  WifiOff,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { InboxCiRow } from '~/components/inbox/inbox-ci-row';
import { InboxErrors } from '~/components/inbox/inbox-errors';
import {
  InboxIdentityDialog,
  InboxIdentityNudge,
} from '~/components/inbox/inbox-identity-dialog';
import { InboxPrRow } from '~/components/inbox/inbox-pr-row';
import { InboxSection } from '~/components/inbox/inbox-section';
import { InboxZero } from '~/components/inbox/inbox-zero';
import { useInbox } from '~/components/inbox/use-inbox';
import { EmptyState } from '~/components/empty-state';
import { Screen, ScreenTitle } from '~/components/screen';
import { Spinner } from '~/components/shared/spinner';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import type { InboxCiItem, InboxPrItem } from '~/lib/inbox';
import { ciLink, prLink } from '~/lib/repo/route';
import { palette } from '~/lib/theme';

function CountChip({ value, busy }: { value: number; busy: boolean }) {
  return (
    <View className="border-border bg-secondary h-8 min-w-10 flex-row items-center justify-center gap-1.5 rounded-full border px-3">
      {busy ? <Spinner size={11} className="text-muted-foreground" /> : null}
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className={
          value > 0
            ? 'text-primary font-mono text-sm font-semibold'
            : 'text-muted-foreground font-mono text-sm font-semibold'
        }>
        {value}
      </Text>
    </View>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const inbox = useInbox();
  const pairedHosts = useConnections((state) => state.hosts.length);
  const [refreshing, setRefreshing] = React.useState(false);

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
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openPr = React.useCallback(
    (item: InboxPrItem) => {
      router.push(prLink(item.hostId, item.path, item.number));
    },
    [router]
  );

  const openCi = React.useCallback(
    (item: InboxCiItem) => {
      router.push(ciLink(item.hostId, item.path, item.runId));
    },
    [router]
  );

  const subtitle =
    pairedHosts === 0
      ? 'Pair a host to get started'
      : hostCount === 0
        ? 'Waiting for a host to come online'
        : `${repoCount} ${repoCount === 1 ? 'repo' : 'repos'} on ${hostCount} ${hostCount === 1 ? 'host' : 'hosts'}`;

  return (
    <Screen contentClassName="px-0">
      <View className="px-4">
        <ScreenTitle
          title="Inbox"
          illustration="inbox"
          subtitle={subtitle}
          right={
            <View className="flex-row items-center gap-2">
              {providerHosts.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit your review handles"
                  hitSlop={8}
                  onPress={openIdentity}
                  className="bg-secondary active:opacity-80 h-8 w-8 items-center justify-center rounded-full">
                  <Icon as={UserRound} size={14} className="text-muted-foreground" />
                </Pressable>
              ) : null}
              <CountChip value={totalCount} busy={fetching && !refreshing} />
            </View>
          }
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-24 pt-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.mutedForeground}
            colors={[palette.foreground]}
            progressBackgroundColor={palette.card}
          />
        }>
        <InboxErrors errors={errors} busy={fetching} onRetry={() => void onRefresh()} />
        <InboxIdentityNudge
          hosts={nudgeDismissed ? [] : unidentifiedHosts}
          onPress={openIdentity}
          onDismiss={dismissNudge}
        />

        {pairedHosts === 0 ? (
          <EmptyState
            icon={Plug}
            title="No host paired"
            description="Scan the QR code from l8gitd pair to connect your first machine."
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/settings')}>
                <Text>Pair a host</Text>
              </Button>
            }
          />
        ) : hostCount === 0 ? (
          <EmptyState
            icon={WifiOff}
            title="All hosts offline"
            description="Reconnecting in the background. Pull down to retry now."
          />
        ) : repoCount === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="No repos tracked yet"
            description="Open a repo on the Repos tab and its reviews and pipelines land here."
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/repos')}>
                <Text>Browse repos</Text>
              </Button>
            }
          />
        ) : totalCount === 0 && !loading ? (
          <InboxZero />
        ) : (
          <Animated.View layout={LinearTransition.duration(220)} className="gap-3">
            <InboxSection
              icon={Eye}
              title="Awaiting your review"
              count={sections.reviewRequested.length}
              hint="No pull request is waiting for your review."
              loading={loading}
              index={0}>
              {sections.reviewRequested.map((item, index) => (
                <Animated.View key={item.key} entering={FadeIn.duration(180)}>
                  <InboxPrRow
                    item={item}
                    showHost={showHost}
                    divider={index > 0}
                    onOpen={openPr}
                  />
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
                  <InboxCiRow
                    item={item}
                    showHost={showHost}
                    divider={index > 0}
                    onOpen={openCi}
                  />
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
                  <InboxPrRow
                    item={item}
                    showHost={showHost}
                    divider={index > 0}
                    onOpen={openPr}
                  />
                </Animated.View>
              ))}
            </InboxSection>
          </Animated.View>
        )}
      </ScrollView>

      <InboxIdentityDialog
        open={identityOpen}
        onOpenChange={setIdentityOpen}
        hosts={providerHosts}
      />
    </Screen>
  );
}
