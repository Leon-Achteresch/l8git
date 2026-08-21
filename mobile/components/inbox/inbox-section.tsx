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
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export type InboxSectionTone = 'neutral' | 'attention' | 'danger' | 'info';

function SectionSkeleton() {
  return (
    <View className="gap-3 px-4 py-4">
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
  color,
  hint,
  loading = false,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  color?: string;
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
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
      className="border-border bg-card overflow-hidden rounded-3xl border">
      <PressableRow
        flat
        haptic={false}
        onPress={toggle}
        accessibilityLabel={`${title}, ${count} items`}>
        <View className="flex-row items-center gap-3 px-4 py-3.5">
          <Icon
            as={icon}
            size={20}
            color={active ? (color ?? palette.foreground) : palette.mutedForeground}
          />

          <Text
            style={{ letterSpacing: 0.6 }}
            className="text-foreground min-w-0 flex-1 text-xs font-semibold uppercase">
            {title}
          </Text>

          <View className="bg-secondary h-7 min-w-7 items-center justify-center rounded-full px-2">
            <Text
              style={{
                fontVariant: ['tabular-nums'],
                color: active ? (color ?? palette.foreground) : palette.mutedForeground,
              }}
              className="text-xs font-semibold">
              {count}
            </Text>
          </View>

          <Animated.View style={chevronStyle}>
            <Icon as={ChevronRight} size={16} className="text-muted-foreground/70" />
          </Animated.View>
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
            <Text className="text-muted-foreground/80 px-4 py-4 text-sm">{hint}</Text>
          ) : (
            children
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
