import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import {
  PR_FILTERS,
  PR_FILTER_LABEL,
  type PrFilter,
} from '~/components/repo/pr/pr-types';
import { Glass } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const CHIP_SHAPE = {
  height: 36,
  borderRadius: 18,
  paddingHorizontal: 14,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
};

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
  const inner = (
    <>
      <Text
        className={
          active
            ? 'text-primary-foreground text-sm font-semibold'
            : 'text-foreground text-sm font-medium'
        }>
        {PR_FILTER_LABEL[filter]}
      </Text>
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className={
          active ? 'text-primary-foreground/60 text-xs' : 'text-muted-foreground text-xs'
        }>
        {count}
      </Text>
    </>
  );

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${PR_FILTER_LABEL[filter]} pull requests`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {active ? (
        <View style={[CHIP_SHAPE, { backgroundColor: palette.primary }]}>{inner}</View>
      ) : (
        <Glass style={CHIP_SHAPE}>{inner}</Glass>
      )}
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
    <View className="flex-row items-center gap-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow"
        contentContainerStyle={{ alignItems: 'center', gap: 8 }}>
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
