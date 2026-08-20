import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

const PULSE = { duration: 2200, easing: Easing.out(Easing.cubic) } as const;

export function InboxZero({ subtitle }: { subtitle?: string }) {
  const halo = useSharedValue(0);
  const mark = useSharedValue(0);

  React.useEffect(() => {
    mark.value = withDelay(120, withSpring(1, { damping: 12, stiffness: 160, mass: 0.7 }));
    halo.value = withRepeat(
      withSequence(withTiming(1, PULSE), withTiming(0, { duration: 0 })),
      -1,
      false
    );
  }, [halo, mark]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.32 * (1 - halo.value),
    transform: [{ scale: 0.9 + halo.value * 0.85 }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: 0.82 + mark.value * 0.18 }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      className="items-center justify-center gap-4 px-8 py-16">
      <View className="h-20 w-20 items-center justify-center">
        <Animated.View
          pointerEvents="none"
          style={haloStyle}
          className="bg-success/25 absolute h-20 w-20 rounded-full"
        />
        <Animated.View
          style={markStyle}
          className="border-success/35 bg-success/12 h-14 w-14 items-center justify-center rounded-full border">
          <Icon as={Check} size={24} className="text-success" />
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.duration(320).delay(120)} className="items-center gap-1.5">
        <Text className="text-foreground text-3xl font-bold tracking-tight">Inbox zero</Text>
        <Text className="text-muted-foreground max-w-72 text-center text-base">
          {subtitle ?? 'No reviews waiting, no red pipelines, nothing needs you right now.'}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
