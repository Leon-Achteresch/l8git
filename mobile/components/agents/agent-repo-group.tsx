import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AgentThreadRow } from '~/components/agents/agent-thread-row';
import type { AgentRepoGroup } from '~/components/agents/overview-model';
import { middleTruncate } from '~/components/shared/format';
import { HostBadge } from '~/components/shared/host-badge';
import { RowGroup } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';
import { illustrations } from '~/lib/illustrations';

export function AgentRepoGroupCard({
  group,
  showHost,
  index = 0,
  onOpen,
  onNewThread,
}: {
  group: AgentRepoGroup;
  showHost: boolean;
  index?: number;
  onOpen: (entry: HostAgentEntry) => void;
  onNewThread: (group: AgentRepoGroup) => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(200).delay(Math.min(index, 6) * 25)}
      layout={LinearTransition.duration(220)}
      className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start a new thread in ${group.repoName}`}
        onPress={() => onNewThread(group)}
        className="active:opacity-70 flex-row items-center gap-2 px-1">
        <Image
          source={illustrations.repo}
          resizeMode="cover"
          style={{ width: 30, height: 30, borderRadius: 10 }}
        />
        <Text numberOfLines={1} className="text-foreground max-w-40 text-sm font-semibold">
          {group.repoName}
        </Text>
        {showHost ? <HostBadge hostId={group.hostId} name={group.hostName} size="xs" /> : null}
        <View className="flex-1" />
        {group.counts.awaitingApproval > 0 ? (
          <StatusPill
            size="xs"
            tone="warning"
            dot
            label={`${group.counts.awaitingApproval} approval${group.counts.awaitingApproval === 1 ? '' : 's'}`}
          />
        ) : group.counts.running > 0 ? (
          <StatusPill size="xs" tone="branch" dot label={`${group.counts.running} running`} />
        ) : null}
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-muted-foreground/70 font-mono text-2xs">
          {group.entries.length}
        </Text>
        <Icon as={ChevronRight} size={12} className="text-muted-foreground/60" />
      </Pressable>

      <RowGroup className="rounded-2xl">
        {group.entries.map((entry) => (
          <AgentThreadRow key={entry.key} entry={entry} showHost={false} onOpen={onOpen} />
        ))}
      </RowGroup>

      <Text numberOfLines={1} className="text-muted-foreground/50 px-1 font-mono text-2xs">
        {middleTruncate(group.path, 52)}
      </Text>
    </Animated.View>
  );
}
