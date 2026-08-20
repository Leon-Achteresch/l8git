import { formatUsd } from '@desktop/lib/agents/token-cost';
import { Bot, CircleAlert, FolderGit2, GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { providerMeta } from '~/components/agents/agent-meta';
import { AgentStatusChip } from '~/components/agents/agent-status-chip';
import { agentTimestampMs, formatTokens } from '~/components/agents/overview-model';
import { relativeTime } from '~/components/shared/format';
import { IconBadge } from '~/components/shared/icon-badge';
import { PressableRow } from '~/components/shared/pressable-row';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';
import { cn } from '~/lib/utils';

function MetaDot() {
  return <Text className="text-muted-foreground/50 text-2xs">·</Text>;
}

export const AgentThreadRow = React.memo(function AgentThreadRow({
  entry,
  showRepo = false,
  showHost = false,
  first = false,
  last = false,
  onOpen,
}: {
  entry: HostAgentEntry;
  showRepo?: boolean;
  showHost?: boolean;
  first?: boolean;
  last?: boolean;
  onOpen: (entry: HostAgentEntry) => void;
}) {
  const meta = providerMeta(entry.provider);
  const attention = entry.status === 'awaitingApproval';
  const failed = entry.status === 'failed';
  const tokens = formatTokens(entry.tokens);
  const cost = entry.costUsd && entry.costUsd > 0 ? formatUsd(entry.costUsd) : null;
  const stamp = relativeTime(agentTimestampMs(entry.updatedAt));

  return (
    <PressableRow
      first={first}
      last={last}
      accessibilityLabel={`${entry.title} on ${entry.repoName}`}
      onPress={() => onOpen(entry)}
      className={cn(attention && 'bg-warning/8', failed && 'bg-destructive/6')}>
      <View className="flex-row items-start gap-3 px-3 py-3">
        {attention ? (
          <View
            pointerEvents="none"
            className="bg-warning absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full"
          />
        ) : null}

        <View style={{ opacity: entry.stale ? 0.55 : 1 }}>
          <IconBadge icon={Bot} color={meta.color} size="md" />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-start gap-2">
            <Text
              numberOfLines={1}
              className={cn(
                'min-w-0 flex-1 text-base font-semibold',
                entry.stale ? 'text-foreground/70' : 'text-foreground'
              )}>
              {entry.title}
            </Text>
            {stamp ? (
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-muted-foreground/80 shrink-0 font-mono text-2xs">
                {stamp}
              </Text>
            ) : null}
          </View>

          <View className="flex-row flex-wrap items-center gap-1.5">
            <AgentStatusChip status={entry.status} count={entry.pendingRequests} compact />

            {showRepo ? (
              <>
                <Text
                  numberOfLines={1}
                  className="text-muted-foreground max-w-36 text-2xs font-medium">
                  {entry.repoName}
                </Text>
                <MetaDot />
              </>
            ) : null}

            {showHost ? (
              <>
                <Text numberOfLines={1} className="text-muted-foreground/80 max-w-28 text-2xs">
                  {entry.hostName}
                </Text>
                <MetaDot />
              </>
            ) : null}

            <Text style={{ color: meta.color }} className="text-2xs opacity-80">
              {meta.short}
            </Text>

            {entry.isWorktree ? (
              <View className="border-border bg-muted/60 flex-row items-center gap-1 rounded-full border px-1.5 py-px">
                <Icon as={FolderGit2} size={9} className="text-muted-foreground" />
                <Icon as={GitBranch} size={9} className="text-git-branch" />
                <Text numberOfLines={1} className="text-muted-foreground max-w-24 text-2xs">
                  {entry.branch ?? 'worktree'}
                </Text>
              </View>
            ) : null}

            {tokens ? (
              <View className="border-border bg-muted/60 rounded-full border px-1.5 py-px">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-muted-foreground font-mono text-2xs">
                  {tokens}
                  {cost ? ` · ${cost}` : ''}
                </Text>
              </View>
            ) : cost ? (
              <View className="border-border bg-muted/60 rounded-full border px-1.5 py-px">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-muted-foreground font-mono text-2xs">
                  {cost}
                </Text>
              </View>
            ) : null}

            {entry.stale ? (
              <View className="border-border bg-muted/40 flex-row items-center gap-1 rounded-full border px-1.5 py-px">
                <Icon as={CircleAlert} size={9} className="text-muted-foreground/70" />
                <Text className="text-muted-foreground/70 text-2xs">cached</Text>
              </View>
            ) : null}
          </View>

          {entry.preview ? (
            <Text numberOfLines={1} className="text-muted-foreground/85 text-xs leading-4">
              {entry.preview}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableRow>
  );
});
