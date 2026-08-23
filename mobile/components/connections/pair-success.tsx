import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

export function PairSuccess({ name }: { name: string }) {
  const scale = useSharedValue(0.4);
  const ring = useSharedValue(0);
  const label = useSharedValue(0);

  React.useEffect(() => {
    scale.value = withSequence(
      withSpring(1.12, { damping: 9, stiffness: 220 }),
      withSpring(1, { damping: 14, stiffness: 180 })
    );
    ring.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
    label.value = withDelay(140, withTiming(1, { duration: 260 }));
  }, [label, ring, scale]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - ring.value,
    transform: [{ scale: 0.8 + ring.value * 1.4 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: label.value,
    transform: [{ translateY: (1 - label.value) * 10 }],
  }));

  return (
    <View className="items-center gap-4 py-6">
      <View className="h-20 w-20 items-center justify-center">
        <Animated.View
          style={ringStyle}
          className="bg-success/25 absolute h-20 w-20 rounded-full"
        />
        <Animated.View
          style={badgeStyle}
          className="bg-success h-16 w-16 items-center justify-center rounded-full">
          <Icon as={Check} className="text-success-foreground size-7" />
        </Animated.View>
      </View>
      <Animated.View style={labelStyle} className="items-center gap-1">
        <Text className="text-foreground text-lg font-bold tracking-tight">Host paired</Text>
        <Text className="text-muted-foreground text-sm">{name}</Text>
      </Animated.View>
    </View>
  );
}
