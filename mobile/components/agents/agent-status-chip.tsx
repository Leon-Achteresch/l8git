import type { AgentOverviewStatus } from '@desktop/lib/agents/overview';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { statusMeta } from '~/components/agents/agent-meta';
import { Spinner } from '~/components/shared/spinner';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const wave = useSharedValue(0);

  React.useEffect(() => {
    wave.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    return () => cancelAnimation(wave);
  }, [wave]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - wave.value),
    transform: [{ scale: 1 + wave.value * 2.2 }],
  }));

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Animated.View
        pointerEvents="none"
        style={[
          ringStyle,
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={{ width: size, height: size, borderRadius: size, backgroundColor: color }}
      />
    </View>
  );
}

const CHIP_SURFACE: Record<AgentOverviewStatus, string> = {
  awaitingApproval: 'border-warning/45 bg-warning/12',
  running: 'border-git-branch/40 bg-git-branch/12',
  failed: 'border-destructive/40 bg-destructive/12',
  idle: 'border-border bg-muted/60',
};

const CHIP_TEXT: Record<AgentOverviewStatus, string> = {
  awaitingApproval: 'text-warning',
  running: 'text-git-branch',
  failed: 'text-destructive',
  idle: 'text-muted-foreground',
};

export function AgentStatusChip({
  status,
  count,
  compact = false,
  className,
}: {
  status: AgentOverviewStatus;
  count?: number;
  compact?: boolean;
  className?: string;
}) {
  const meta = statusMeta(status);
  const label = compact ? meta.short : meta.label;

  return (
    <View
      accessibilityLabel={`${meta.label}${count && count > 1 ? ` (${count})` : ''}`}
      className={cn(
        'flex-row items-center gap-1.5 rounded-full border px-2 py-0.5',
        CHIP_SURFACE[status],
        className
      )}>
      {status === 'running' ? (
        <Spinner size={9} className={CHIP_TEXT[status]} />
      ) : status === 'awaitingApproval' ? (
        <PulseDot color={meta.color} size={5} />
      ) : (
        <View style={{ backgroundColor: meta.color }} className="h-1.5 w-1.5 rounded-full" />
      )}
      <Text className={cn('text-2xs font-medium', CHIP_TEXT[status])}>{label}</Text>
      {count && count > 1 ? (
        <Text className={cn('font-mono text-2xs opacity-70', CHIP_TEXT[status])}>{count}</Text>
      ) : null}
    </View>
  );
}
