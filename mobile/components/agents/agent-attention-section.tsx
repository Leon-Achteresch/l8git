import { ShieldQuestion } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AgentThreadRow } from '~/components/agents/agent-thread-row';
import { statusMeta } from '~/components/agents/agent-meta';
import { PulseDot } from '~/components/agents/agent-status-chip';
import { RowGroup } from '~/components/shared/pressable-row';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';

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
      className="border-warning/35 bg-warning/8 overflow-hidden rounded-2xl border">
      <View className="flex-row items-center gap-2.5 px-3 pb-2 pt-3">
        {approvals > 0 ? (
          <PulseDot color={statusMeta('awaitingApproval').color} size={7} />
        ) : (
          <Icon as={ShieldQuestion} size={13} className="text-warning" />
        )}
        <Text className="text-warning flex-1 text-xs font-semibold uppercase tracking-widest">
          Needs attention
        </Text>
        <Text className="text-warning/80 font-mono text-2xs">{entries.length}</Text>
      </View>

      <Text className="text-muted-foreground px-3 pb-2.5 text-xs">{hint}</Text>

      <View className="px-1.5 pb-1.5">
        <RowGroup className="rounded-xl">
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
