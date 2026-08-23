import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Glass } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export type RepoChip = {
  path: string;
  name: string;
  dirty: boolean;
};

const CHIP_SHAPE = {
  height: 36,
  borderRadius: 18,
  paddingHorizontal: 14,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
};

export function RepoChips({
  chips,
  selected,
  accent,
  onSelect,
}: {
  chips: readonly RepoChip[];
  selected: string | null;
  accent: string;
  onSelect: (path: string) => void;
}) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerClassName="gap-2 px-5">
      {chips.map((chip) => (
        <Chip
          key={chip.path}
          chip={chip}
          accent={accent}
          active={chip.path === selected}
          onPress={() => onSelect(chip.path)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  chip,
  accent,
  active,
  onPress,
}: {
  chip: RepoChip;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.04 }],
    opacity: 1 - pressed.value * 0.25,
  }));

  const inner = (
    <>
      {chip.dirty ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: active ? palette.primaryForeground : palette.warning,
          }}
        />
      ) : null}
      <Text
        numberOfLines={1}
        className={
          active
            ? 'text-primary-foreground max-w-40 text-sm font-semibold'
            : 'text-foreground max-w-40 text-sm font-medium'
        }>
        {chip.name}
      </Text>
    </>
  );

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 180 });
        }}>
        {active ? (
          <View style={[CHIP_SHAPE, { backgroundColor: accent }]}>{inner}</View>
        ) : (
          <Glass style={CHIP_SHAPE}>{inner}</Glass>
        )}
      </Pressable>
    </Animated.View>
  );
}
