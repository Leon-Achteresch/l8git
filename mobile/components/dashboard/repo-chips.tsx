import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type RepoChip = {
  path: string;
  name: string;
  dirty: boolean;
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
      className="-mx-4"
      contentContainerClassName="gap-2 px-4">
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
        }}
        style={active ? { borderColor: accent, backgroundColor: `${accent}1f` } : undefined}
        className={cn(
          'flex-row items-center gap-1.5 rounded-full border px-3 py-1.5',
          active ? 'border-transparent' : 'border-border bg-muted/50'
        )}>
        {chip.dirty ? <View className="bg-git-modified h-1.5 w-1.5 rounded-full" /> : null}
        <Text
          numberOfLines={1}
          className={cn(
            'max-w-40 text-xs font-medium',
            active ? 'text-foreground' : 'text-muted-foreground'
          )}>
          {chip.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
