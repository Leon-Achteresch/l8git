import { useRouter } from 'expo-router';
import { ArrowLeft, CloudOff, Inbox, MessageSquare } from 'lucide-react-native';
import * as React from 'react';
import { SectionList, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentApprovalCard } from '~/components/agents/approval-card';
import { useOpenAgentThread } from '~/components/agents/chat/route';
import { EmptyState } from '~/components/empty-state';
import { PressableRow } from '~/components/shared/pressable-row';
import { SkeletonList } from '~/components/skeleton-list';
import { GlassCircle, GlassPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import {
  usePendingApprovals,
  useStaleApprovalHosts,
  type PendingApproval,
} from '~/lib/agents/approvals';
import { useAgentRuntime } from '~/lib/agents/runtime';
import { useAgentBinding } from '~/lib/agents/use-agent-connection';
import { useHostRuntime } from '~/lib/connections';

interface ApprovalSection {
  key: string;
  title: string;
  subtitle: string;
  head: PendingApproval;
  data: PendingApproval[];
}

function groupApprovals(approvals: readonly PendingApproval[]): ApprovalSection[] {
  const sections = new Map<string, ApprovalSection>();
  for (const approval of approvals) {
    const key = `${approval.hostId}:${approval.provider}:${approval.threadId}`;
    const existing = sections.get(key);
    if (existing) {
      existing.data.push(approval);
      continue;
    }
    sections.set(key, {
      key,
      title: approval.threadTitle,
      subtitle: `${approval.repoName} · ${approval.hostName}`,
      head: approval,
      data: [approval],
    });
  }
  return [...sections.values()];
}

function CountBadge({ value }: { value: number }) {
  return (
    <View className="bg-warning/15 min-w-7 items-center justify-center rounded-full px-2 py-1">
      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-warning text-xs font-bold">
        {value}
      </Text>
    </View>
  );
}

function StaleHostRow({
  hostName,
  online,
  pending,
}: {
  hostName: string;
  online: boolean;
  pending: number;
}) {
  return (
    <PressableRow flat>
      <View className="bg-card mb-2 flex-row items-center gap-3 rounded-3xl px-4 py-3.5">
        <View className="bg-white/10 h-9 w-9 items-center justify-center rounded-full">
          <Icon as={CloudOff} size={15} className="text-muted-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
            {hostName}
          </Text>
          <Text className="text-muted-foreground text-2xs">
            {online
              ? 'Bind this host in the Agents tab to respond.'
              : 'Host offline — approvals cannot be answered.'}
          </Text>
        </View>
        <CountBadge value={pending} />
      </View>
    </PressableRow>
  );
}

export default function AgentApprovalsScreen() {
  const router = useRouter();
  const phase = useAgentRuntime((state) => state.phase);
  const boundHostId = useAgentBinding((state) => state.hostId);
  const hostRuntime = useHostRuntime(boundHostId);
  const approvals = usePendingApprovals();
  const staleHosts = useStaleApprovalHosts();

  const sections = React.useMemo(() => groupApprovals(approvals), [approvals]);

  const openAgentThread = useOpenAgentThread();

  const openThread = React.useCallback(
    (approval: PendingApproval) => {
      if (!approval.path) {
        return;
      }
      openAgentThread({
        hostId: approval.hostId,
        provider: approval.provider,
        threadId: approval.threadId,
        path: approval.path,
      });
    },
    [openAgentThread]
  );

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-4 pt-2">
        <GlassCircle
          icon={ArrowLeft}
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/agents'))}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-3xl font-bold tracking-tight">
            Approvals
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {approvals.length > 0
              ? `${approvals.length} waiting across ${sections.length} thread${sections.length === 1 ? '' : 's'}`
              : 'Nothing waiting on you'}
          </Text>
        </View>
        {approvals.length > 0 ? <CountBadge value={approvals.length} /> : null}
      </View>

      {phase === 'booting' || phase === 'idle' ? (
        <View className="px-5 pt-1">
          <SkeletonList rows={3} />
        </View>
      ) : approvals.length === 0 && staleHosts.length === 0 ? (
        <EmptyState
          illustration="inbox"
          title="Inbox zero"
          description={
            boundHostId && hostRuntime.status === 'online'
              ? 'Every agent request has been answered. New approvals land here instantly.'
              : 'Connect a host and open an agent thread — pending approvals show up here.'
          }
          action={
            <GlassPill
              icon={MessageSquare}
              label="Go to Agents"
              onPress={() => router.replace('/agents')}
            />
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          contentContainerClassName="gap-3 px-5 pb-16 pt-1"
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            staleHosts.length > 0 ? (
              <View className="pb-1">
                {staleHosts.map((host) => (
                  <StaleHostRow
                    key={host.hostId}
                    hostName={host.hostName}
                    online={host.online}
                    pending={host.pending}
                  />
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              title="No live approvals"
              description="The connected host has no pending agent requests right now."
            />
          }
          renderSectionHeader={({ section }) => (
            <PressableRow
              flat
              onPress={() => openThread(section.head)}
              accessibilityLabel={`Open ${section.title}`}>
              <View className="flex-row items-center gap-2.5 px-1 pb-1 pt-3">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-foreground text-base font-semibold">
                    {section.title}
                  </Text>
                  <Text numberOfLines={1} className="text-muted-foreground text-xs">
                    {section.subtitle}
                  </Text>
                </View>
                <CountBadge value={section.data.length} />
                <View className="bg-white/10 rounded-full px-3 py-1.5">
                  <Text className="text-foreground text-xs font-semibold">Open</Text>
                </View>
              </View>
            </PressableRow>
          )}
          renderItem={({ item }) => (
            <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition.duration(200)}>
              <AgentApprovalCard
                request={item.request}
                provider={item.provider}
                hostName={item.hostName}
                repoName={item.repoName}
                showContext
              />
            </Animated.View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
