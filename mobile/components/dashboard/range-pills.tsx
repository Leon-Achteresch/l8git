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
    <View className="border-border bg-muted/50 flex-row rounded-lg border p-0.5">
      {RANGE_KEYS.map((key) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            className="rounded-md">
            <Animated.View
              layout={LinearTransition.duration(160)}
              className={cn('rounded-md px-2 py-1', active && 'bg-foreground')}>
              <Text
                className={cn(
                  'text-2xs font-medium',
                  active ? 'text-background' : 'text-muted-foreground'
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
