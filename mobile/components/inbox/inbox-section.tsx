import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PressableRow } from '~/components/shared/pressable-row';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type InboxSectionTone = 'neutral' | 'attention' | 'danger' | 'info';

const TONE_ICON: Record<InboxSectionTone, string> = {
  neutral: 'text-muted-foreground',
  attention: 'text-git-modified',
  danger: 'text-git-removed',
  info: 'text-git-branch',
};

const TONE_SURFACE: Record<InboxSectionTone, string> = {
  neutral: 'border-border bg-muted/60',
  attention: 'border-git-modified/35 bg-git-modified/12',
  danger: 'border-git-removed/35 bg-git-removed/12',
  info: 'border-git-branch/35 bg-git-branch/12',
};

const TONE_COUNT_SURFACE: Record<InboxSectionTone, string> = {
  neutral: 'bg-muted',
  attention: 'bg-git-modified/15',
  danger: 'bg-git-removed/15',
  info: 'bg-git-branch/15',
};

function SectionSkeleton() {
  return (
    <View className="gap-3 px-3.5 py-3.5">
      {[0, 1].map((row) => (
        <View key={row} className="gap-2">
          <View className="flex-row items-center gap-2">
            <Skeleton className="h-3.5 w-16 rounded" />
            <Skeleton className={cn('h-3.5 rounded', row === 0 ? 'w-2/5' : 'w-1/3')} />
          </View>
          <Skeleton className="h-2.5 w-1/2 rounded" />
        </View>
      ))}
    </View>
  );
}

export function InboxSection({
  icon,
  title,
  count,
  tone = 'neutral',
  hint,
  loading = false,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  tone?: InboxSectionTone;
  hint: string;
  loading?: boolean;
  index?: number;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const rotation = useSharedValue(1);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 90}deg` }],
  }));

  React.useEffect(() => {
    rotation.value = withTiming(open ? 1 : 0, { duration: 180 });
  }, [open, rotation]);

  const toggle = React.useCallback(() => {
    setOpen((previous) => !previous);
  }, []);

  const active = count > 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(index * 60)}
      layout={LinearTransition.duration(220)}
      className="border-border/70 bg-card/40 overflow-hidden rounded-2xl border">
      <PressableRow
        flat
        haptic={false}
        onPress={toggle}
        accessibilityLabel={`${title}, ${count} items`}>
        <View className="flex-row items-center gap-2.5 px-3.5 py-3">
          <Animated.View style={chevronStyle}>
            <Icon as={ChevronRight} size={13} className="text-muted-foreground/70" />
          </Animated.View>

          <View
            className={cn(
              'h-7 w-7 items-center justify-center rounded-lg border',
              active ? TONE_SURFACE[tone] : 'border-border bg-muted/50'
            )}>
            <Icon
              as={icon}
              size={14}
              className={active ? TONE_ICON[tone] : 'text-muted-foreground'}
            />
          </View>

          <Text className="text-foreground min-w-0 flex-1 text-sm font-medium">{title}</Text>

          <View
            className={cn(
              'h-5 min-w-5 items-center justify-center rounded-full px-1.5',
              active ? TONE_COUNT_SURFACE[tone] : 'bg-muted'
            )}>
            <Text
              className={cn(
                'font-mono text-2xs',
                active ? TONE_ICON[tone] : 'text-muted-foreground'
              )}>
              {count}
            </Text>
          </View>
        </View>
      </PressableRow>

      {open ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          layout={LinearTransition.duration(200)}
          className="border-border/60 border-t">
          {loading && count === 0 ? (
            <SectionSkeleton />
          ) : count === 0 ? (
            <Text className="text-muted-foreground/80 px-3.5 py-3.5 text-xs">{hint}</Text>
          ) : (
            children
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
