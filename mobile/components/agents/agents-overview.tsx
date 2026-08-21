import { formatUsd } from '@desktop/lib/agents/token-cost';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FolderGit2, ListFilter, Plug, Plus, WifiOff } from 'lucide-react-native';
import * as React from 'react';
import { Image, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { AgentAttentionSection } from '~/components/agents/agent-attention-section';
import { AgentConnectionStrip } from '~/components/agents/agent-connection-strip';
import { AgentFilterRow } from '~/components/agents/agent-filter-row';
import { AgentRepoGroupCard } from '~/components/agents/agent-repo-group';
import {
  ApprovalsInboxIconButton,
  WorktreeReviewsIconButton,
} from '~/components/agents/approvals-link';
import { NewThreadSheet } from '~/components/agents/new-thread-sheet';
import {
  DEFAULT_AGENT_FILTERS,
  applyAgentFilters,
  attentionEntries,
  formatTokens,
  groupEntriesByRepo,
  isDefaultFilters,
  needsAttention,
  totalCostUsd,
  totalTokens,
  type AgentOverviewFilters,
  type AgentRepoGroup,
} from '~/components/agents/overview-model';
import { EmptyState } from '~/components/empty-state';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { focusAgentHost, useFocusedAgentHostId } from '~/lib/agents/host-focus';
import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';
import { refreshAgentThreads } from '~/lib/agents/overview-actions';
import { useActiveProvider } from '~/lib/agents/provider-selection';
import { useOpenAgentThread, type AgentThreadTarget } from '~/components/agents/chat/route';
import { useAgentConnection } from '~/lib/agents/use-agent-connection';
import { useAgentOverview } from '~/lib/agents/use-agent-overview';
import { useConnections } from '~/lib/connections';
import { useHostRepoPaths, useRepoRegistry } from '~/lib/repo/registry';
import { illustrations } from '~/lib/illustrations';
import { palette } from '~/lib/theme';

function HeaderPill({ label }: { label: string }) {
  return (
    <View className="bg-secondary rounded-full px-2.5 py-1">
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="text-muted-foreground font-mono text-2xs">
        {label}
      </Text>
    </View>
  );
}

export function AgentsOverview() {
  const router = useRouter();
  const bottomInset = useBottomInset(24);

  const openAgentThread = useOpenAgentThread();
  const focusedHostId = useFocusedAgentHostId();
  const connection = useAgentConnection(focusedHostId);
  const provider = useActiveProvider();
  const summary = useAgentOverview();
  const focusedPaths = useHostRepoPaths(focusedHostId);
  const pairedHosts = useConnections((state) => state.hosts.length);
  const trackedRepos = useRepoRegistry(
    (state) => Object.values(state.pathsByHost).reduce((sum, paths) => sum + paths.length, 0)
  );

  const [filters, setFilters] = React.useState<AgentOverviewFilters>(DEFAULT_AGENT_FILTERS);
  const [refreshing, setRefreshing] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [composerPath, setComposerPath] = React.useState<string | null>(null);
  const [composerHostId, setComposerHostId] = React.useState<string | null>(null);

  const entries = summary.entries;
  const filtered = React.useMemo(
    () => applyAgentFilters(entries, filters),
    [entries, filters]
  );
  const attention = React.useMemo(() => attentionEntries(filtered), [filtered]);
  const groups = React.useMemo(
    () => groupEntriesByRepo(filtered.filter((entry) => !needsAttention(entry))),
    [filtered]
  );

  const showHost = summary.hosts.length > 1;
  const onlineHosts = summary.hosts.filter((host) => host.online).length;
  const cost = totalCostUsd(entries);
  const tokens = formatTokens(totalTokens(entries));

  const openThread = React.useCallback(
    (entry: HostAgentEntry) => {
      openAgentThread({
        hostId: entry.hostId,
        provider: entry.provider,
        threadId: entry.threadId,
        path: entry.path,
      });
    },
    [openAgentThread]
  );

  const openComposer = React.useCallback(
    (seed?: { hostId: string; path: string }) => {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setComposerHostId(seed?.hostId ?? focusedHostId);
      setComposerPath(seed?.path ?? null);
      setComposerOpen(true);
    },
    [focusedHostId]
  );

  const openGroupComposer = React.useCallback(
    (group: AgentRepoGroup) => openComposer({ hostId: group.hostId, path: group.path }),
    [openComposer]
  );

  const onCreated = React.useCallback(
    (target: AgentThreadTarget) => {
      setComposerOpen(false);
      openAgentThread(target);
    },
    [openAgentThread]
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAgentThreads(focusedPaths);
    } finally {
      setRefreshing(false);
    }
  }, [focusedPaths]);

  const connectionReady = connection.bound && connection.status === 'ready';

  React.useEffect(() => {
    if (!connectionReady || focusedPaths.length === 0) {
      return;
    }
    void refreshAgentThreads(focusedPaths);
  }, [connectionReady, focusedHostId, focusedPaths]);

  const subtitle =
    pairedHosts === 0
      ? 'Pair a host to run agents'
      : onlineHosts === 0
        ? 'All hosts offline — cached threads'
        : `${entries.length} ${entries.length === 1 ? 'thread' : 'threads'} · ${onlineHosts} ${
            onlineHosts === 1 ? 'host' : 'hosts'
          } online`;

  return (
    <View className="flex-1">
      <View className="flex-row items-start justify-between gap-3 px-4 pb-3 pt-1">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <Image
            source={illustrations.agent}
            resizeMode="cover"
            style={{ width: 48, height: 48, borderRadius: 15 }}
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-3xl font-bold tracking-tight">Agents</Text>
            <Text numberOfLines={1} className="text-muted-foreground text-sm">
              {subtitle}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2 pt-1">
          {tokens ? <HeaderPill label={tokens} /> : null}
          {cost > 0 ? <HeaderPill label={formatUsd(cost)} /> : null}
          <ApprovalsInboxIconButton />
          <WorktreeReviewsIconButton />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new agent thread"
            hitSlop={8}
            onPress={() => openComposer()}
            className="bg-primary active:opacity-80 h-9 w-9 items-center justify-center rounded-full">
            <Icon as={Plus} size={17} className="text-primary-foreground" />
          </Pressable>
        </View>
      </View>

      {entries.length > 0 || !isDefaultFilters(filters) ? (
        <View className="px-4 pb-2">
          <AgentFilterRow
            entries={entries}
            hosts={summary.hosts}
            filters={filters}
            boundHostId={connection.bound ? connection.hostId : null}
            onChange={setFilters}
            onFocusHost={focusAgentHost}
          />
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-24 pt-1"
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
        <AgentConnectionStrip connection={connection} />

        {pairedHosts === 0 ? (
          <EmptyState
            icon={Plug}
            title="No host paired"
            description="Scan the QR code from l8gitd pair to reach the agents running on your machine."
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/settings')}>
                <Text>Pair a host</Text>
              </Button>
            }
          />
        ) : trackedRepos === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="No repositories tracked"
            description="Agents work inside a repository. Add one from the Repos tab and it shows up here."
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/repos')}>
                <Text>Browse repos</Text>
              </Button>
            }
          />
        ) : entries.length === 0 && onlineHosts === 0 ? (
          <EmptyState
            icon={WifiOff}
            title="All hosts offline"
            description="Reconnecting in the background. Pull down to retry now."
          />
        ) : entries.length === 0 ? (
          <EmptyState
            illustration="agent"
            title="No agent threads yet"
            description={`Start a thread on ${
              connection.hostName ?? 'this host'
            } and Codex, Claude, OpenCode and Cursor sessions all land in this dashboard.`}
            action={
              <Button size="sm" onPress={() => openComposer()}>
                <Icon as={Plus} size={14} className="text-primary-foreground" />
                <Text>New thread</Text>
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title="No threads match"
            description="Loosen the filters to see the rest of your agent sessions."
            action={
              <Button
                size="sm"
                variant="outline"
                onPress={() => setFilters(DEFAULT_AGENT_FILTERS)}>
                <Text>Clear filters</Text>
              </Button>
            }
          />
        ) : (
          <Animated.View layout={LinearTransition.duration(220)} className="gap-4">
            <AgentAttentionSection
              entries={attention}
              showHost={showHost}
              onOpen={openThread}
            />
            {groups.map((group, index) => (
              <AgentRepoGroupCard
                key={group.key}
                group={group}
                showHost={showHost}
                index={index}
                onOpen={openThread}
                onNewThread={openGroupComposer}
              />
            ))}
          </Animated.View>
        )}

        <View style={{ height: bottomInset + 72 }} />
      </ScrollView>

      <NewThreadSheet
        visible={composerOpen}
        initialHostId={composerHostId}
        initialPath={composerPath}
        initialProvider={provider}
        onClose={() => setComposerOpen(false)}
        onCreated={onCreated}
      />
    </View>
  );
}
