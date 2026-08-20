import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {
  PR_FILTERS,
  PR_FILTER_LABEL,
  type PrFilter,
} from '~/components/repo/pr/pr-types';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const SPRING = { damping: 20, stiffness: 260, mass: 0.6 } as const;

function Chip({
  filter,
  count,
  active,
  onPress,
}: {
  filter: PrFilter;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const value = useSharedValue(active ? 1 : 0);

  React.useEffect(() => {
    value.value = withSpring(active ? 1 : 0, SPRING);
  }, [active, value]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: value.value,
    transform: [{ scale: 0.94 + value.value * 0.06 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${PR_FILTER_LABEL[filter]} pull requests`}
      onPress={onPress}
      className="mr-2">
      <View
        className={cn(
          'overflow-hidden rounded-full border',
          active ? 'border-accent-foreground/30' : 'border-border'
        )}>
        <Animated.View
          pointerEvents="none"
          style={fillStyle}
          className="bg-accent absolute bottom-0 left-0 right-0 top-0"
        />
        <View className="flex-row items-center gap-1.5 px-3 py-1.5">
          <Text
            className={cn(
              'text-xs font-medium',
              active ? 'text-accent-foreground' : 'text-muted-foreground'
            )}>
            {PR_FILTER_LABEL[filter]}
          </Text>
          <Text
            className={cn(
              'font-mono text-2xs tabular-nums',
              active ? 'text-accent-foreground/70' : 'text-muted-foreground/60'
            )}>
            {count}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function PrFilterChips({
  value,
  counts,
  onChange,
  trailing,
}: {
  value: PrFilter;
  counts: Record<PrFilter, number>;
  onChange: (next: PrFilter) => void;
  trailing?: React.ReactNode;
}) {
  const select = React.useCallback(
    (next: PrFilter) => {
      if (next === value) {
        return;
      }
      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      onChange(next);
    },
    [onChange, value]
  );

  return (
    <View className="flex-row items-center gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow"
        contentContainerClassName="items-center">
        {PR_FILTERS.map((filter) => (
          <Chip
            key={filter}
            filter={filter}
            count={counts[filter]}
            active={filter === value}
            onPress={() => select(filter)}
          />
        ))}
      </ScrollView>
      {trailing}
    </View>
  );
}
