import { useRouter } from 'expo-router';
import { CloudOff, Inbox, MessageSquare, ShieldCheck } from 'lucide-react-native';
import * as React from 'react';
import { SectionList, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentApprovalCard } from '~/components/agents/approval-card';
import { useOpenAgentThread } from '~/components/agents/chat/route';
import { EmptyState } from '~/components/empty-state';
import { DetailHeader } from '~/components/shared/detail-header';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
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
      <View className="border-border bg-card/40 mb-2 flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5">
        <Icon as={CloudOff} size={14} className="text-muted-foreground" />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
            {hostName}
          </Text>
          <Text className="text-muted-foreground text-2xs">
            {online
              ? 'Bind this host in the Agents tab to respond.'
              : 'Host offline — approvals cannot be answered.'}
          </Text>
        </View>
        <StatusPill label={pending} tone="warning" size="xs" mono />
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
      <DetailHeader
        title="Approvals"
        subtitle={
          approvals.length > 0
            ? `${approvals.length} waiting across ${sections.length} thread${sections.length === 1 ? '' : 's'}`
            : 'Nothing waiting on you'
        }
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/agents'))}
        right={
          approvals.length > 0 ? (
            <StatusPill label={approvals.length} tone="warning" size="xs" mono dot />
          ) : null
        }
      />

      {phase === 'booting' || phase === 'idle' ? (
        <View className="px-4 pt-3">
          <SkeletonList rows={3} />
        </View>
      ) : approvals.length === 0 && staleHosts.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Inbox zero"
          description={
            boundHostId && hostRuntime.status === 'online'
              ? 'Every agent request has been answered. New approvals land here instantly.'
              : 'Connect a host and open an agent thread — pending approvals show up here.'
          }
          action={
            <Button variant="outline" size="sm" onPress={() => router.replace('/agents')}>
              <Icon as={MessageSquare} size={13} className="text-foreground" />
              <Text className="text-xs">Go to Agents</Text>
            </Button>
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          contentContainerClassName="gap-2 px-4 pb-16 pt-3"
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
              <View className="flex-row items-center gap-2 pb-1.5 pt-3">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
                    {section.title}
                  </Text>
                  <Text numberOfLines={1} className="text-muted-foreground text-2xs">
                    {section.subtitle}
                  </Text>
                </View>
                <StatusPill label={`${section.data.length}`} tone="warning" size="xs" mono />
                <Text className="text-primary text-2xs font-semibold uppercase tracking-wide">
                  Open
                </Text>
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
