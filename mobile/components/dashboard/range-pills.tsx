import { Pressable, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { RANGE_KEYS, type RangeKey } from '~/components/dashboard/aggregate';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export function RangePills({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}) {
  return (
    <View className="border-border bg-secondary flex-row rounded-full border p-1">
      {RANGE_KEYS.map((key) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            className="rounded-full">
            <Animated.View
              layout={LinearTransition.duration(160)}
              className={cn('rounded-full px-3 py-1', active && 'bg-primary')}>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className={cn(
                  'text-2xs font-semibold tracking-wide',
                  active ? 'text-primary-foreground' : 'text-muted-foreground'
                )}>
                {key}
              </Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}
