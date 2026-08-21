import * as React from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AgentThreadRow } from '~/components/agents/agent-thread-row';
import { RowGroup } from '~/components/shared/pressable-row';
import { Text } from '~/components/ui/text';
import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';
import { illustrations } from '~/lib/illustrations';
import { palette } from '~/lib/theme';

export function AgentAttentionSection({
  entries,
  showHost,
  onOpen,
}: {
  entries: readonly HostAgentEntry[];
  showHost: boolean;
  onOpen: (entry: HostAgentEntry) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  const approvals = entries.filter((entry) => entry.status === 'awaitingApproval').length;
  const failures = entries.length - approvals;
  const hint =
    approvals > 0 && failures > 0
      ? `${approvals} waiting on you · ${failures} failed`
      : approvals > 0
        ? `${approvals} ${approvals === 1 ? 'thread is' : 'threads are'} waiting on you`
        : `${failures} ${failures === 1 ? 'thread' : 'threads'} failed`;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(220)}
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
      className="border-warning/35 bg-card overflow-hidden rounded-3xl border">
      <View className="flex-row items-center gap-3 px-3.5 pb-2 pt-3.5">
        <Image
          source={illustrations.agent}
          resizeMode="cover"
          style={{ width: 44, height: 44, borderRadius: 14 }}
        />
        <View className="flex-1 gap-0.5">
          <Text className="text-warning text-base font-bold">Needs attention</Text>
          <Text className="text-muted-foreground text-xs">{hint}</Text>
        </View>
        <Text
          style={{ fontVariant: ['tabular-nums'], color: palette.warning }}
          className="text-3xl font-bold tabular-nums">
          {entries.length}
        </Text>
      </View>

      <View className="px-1.5 pb-1.5 pt-1">
        <RowGroup className="rounded-2xl">
          {entries.map((entry) => (
            <AgentThreadRow
              key={entry.key}
              entry={entry}
              showRepo
              showHost={showHost}
              onOpen={onOpen}
            />
          ))}
        </RowGroup>
      </View>
    </Animated.View>
  );
}
