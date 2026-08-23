import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '~/lib/utils';

const PRESS_IN = { duration: 90 } as const;
const PRESS_OUT = { duration: 180 } as const;

export type PressableRowProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  first?: boolean;
  last?: boolean;
  flat?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  className?: string;
  style?: ViewStyle;
};

export function PressableRow({
  children,
  onPress,
  onLongPress,
  disabled = false,
  selected = false,
  first = false,
  last = false,
  flat = false,
  haptic = true,
  accessibilityLabel,
  className,
  style,
}: PressableRowProps) {
  const pressed = useSharedValue(0);
  const interactive = Boolean(onPress || onLongPress) && !disabled;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.012 }],
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: pressed.value,
  }));

  const handleLongPress = React.useCallback(() => {
    if (!onLongPress) {
      return;
    }
    if (haptic && Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onLongPress();
  }, [haptic, onLongPress]);

  return (
    <Animated.View style={[animatedStyle, style]} className={cn(!flat && 'overflow-hidden')}>
      <Pressable
        accessibilityRole={interactive ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        disabled={!interactive}
        onPress={onPress}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={280}
        onPressIn={() => {
          pressed.value = withTiming(1, PRESS_IN);
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, PRESS_OUT);
        }}
        className={cn(
          'relative',
          !flat && 'bg-card',
          !flat && !last && 'border-white/5 border-b',
          !flat && first && 'rounded-t-3xl',
          !flat && last && 'rounded-b-3xl',
          selected && 'bg-accent/60',
          disabled && 'opacity-45',
          className
        )}>
        {interactive ? (
          <Animated.View
            pointerEvents="none"
            style={highlightStyle}
            className="bg-accent absolute bottom-0 left-0 right-0 top-0"
          />
        ) : null}
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function RowGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View className={cn('overflow-hidden', className)}>
      {items.map((child, index) =>
        React.cloneElement(child as React.ReactElement<{ first?: boolean; last?: boolean }>, {
          first: index === 0,
          last: index === items.length - 1,
        })
      )}
    </View>
  );
}
