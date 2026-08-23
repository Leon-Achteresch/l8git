import { ChevronDown, Coins, Gauge } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

import { estimateCost, formatTokens, formatUsd } from '@desktop/lib/agents/token-cost';
import type { AgentTokenUsage } from '@desktop/lib/agents/types';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-16 gap-0.5">
      <Text className="text-muted-foreground/70 text-2xs uppercase tracking-widest">{label}</Text>
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="text-foreground font-mono text-xs">
        {value}
      </Text>
    </View>
  );
}

export function AgentUsageFooter({
  usage,
  model,
}: {
  usage: AgentTokenUsage | null | undefined;
  model: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  const cost = React.useMemo(() => estimateCost(usage ?? undefined, model), [model, usage]);
  const contextPercent =
    usage?.modelContextWindow && usage.modelContextWindow > 0
      ? Math.min(100, Math.round((usage.totalTokens / usage.modelContextWindow) * 100))
      : null;

  if (!usage || usage.totalTokens === 0) {
    return null;
  }

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      className="">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Token usage details"
        onPress={() => setOpen((value) => !value)}
        className="active:bg-accent/30 flex-row items-center gap-2 px-3.5 py-1.5">
        <Icon as={Gauge} size={11} className="text-muted-foreground/70" />
        <Text className="text-muted-foreground font-mono text-2xs">
          {formatTokens(usage.totalTokens)} tokens
        </Text>
        {contextPercent !== null ? (
          <View className="flex-row items-center gap-1.5">
            <View className="bg-muted h-1 w-14 overflow-hidden rounded-full">
              <View
                style={{ width: `${contextPercent}%` }}
                className={cn(
                  'h-1 rounded-full',
                  contextPercent > 85
                    ? 'bg-destructive'
                    : contextPercent > 60
                      ? 'bg-warning'
                      : 'bg-success'
                )}
              />
            </View>
            <Text className="text-muted-foreground font-mono text-2xs">{contextPercent}%</Text>
          </View>
        ) : null}
        {cost ? (
          <View className="flex-row items-center gap-1">
            <Icon as={Coins} size={10} className="text-muted-foreground/70" />
            <Text className="text-muted-foreground font-mono text-2xs">
              {formatUsd(cost.totalUsd)}
            </Text>
          </View>
        ) : null}
        <View className="flex-1" />
        <Icon
          as={ChevronDown}
          size={11}
          className={cn('text-muted-foreground/60', open && 'rotate-180')}
        />
      </Pressable>

      {open ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          className="border-border/50 flex-row flex-wrap gap-4 border-t px-3.5 py-2.5">
          <Metric label="Input" value={formatTokens(usage.inputTokens ?? 0)} />
          <Metric label="Output" value={formatTokens(usage.outputTokens ?? 0)} />
          <Metric label="Cache read" value={formatTokens(usage.cacheReadTokens ?? 0)} />
          <Metric label="Cache write" value={formatTokens(usage.cacheWriteTokens ?? 0)} />
          {usage.modelContextWindow ? (
            <Metric label="Window" value={formatTokens(usage.modelContextWindow)} />
          ) : null}
          {cost ? <Metric label="Saved" value={formatUsd(cost.cacheSavedUsd)} /> : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
