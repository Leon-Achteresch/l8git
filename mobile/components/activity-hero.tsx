import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ActivityChip } from '~/components/activity-chip';
import { Sparkline } from '~/components/dashboard/sparkline';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export function ActivityHero({
  commits,
  series,
  dirty,
  ahead,
  behind,
  loading,
}: {
  commits: string;
  series: readonly number[];
  dirty: number;
  ahead: number;
  behind: number;
  loading?: boolean;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(280)} className="bg-card gap-4 rounded-[28px] px-5 py-5">
      <Text className="text-muted-foreground text-sm font-semibold">Last 30 days</Text>
      {loading ? (
        <Skeleton className="h-12 w-28 rounded-full" />
      ) : (
        <View className="flex-row items-end gap-2">
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-foreground text-5xl font-bold tracking-tight">
            {commits}
          </Text>
          <Text className="text-muted-foreground pb-1.5 text-base font-semibold">commits</Text>
        </View>
      )}
      <Sparkline values={series} accent={palette.foreground} height={56} />
      <View className="flex-row gap-2">
        <ActivityChip label="Dirty" value={String(dirty)} hot={dirty > 0} />
        <ActivityChip label="Ahead" value={String(ahead)} />
        <ActivityChip label="Behind" value={String(behind)} hot={behind > 0} />
      </View>
    </Animated.View>
  );
}
