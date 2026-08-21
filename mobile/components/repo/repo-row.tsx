import { GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { Image, Pressable, View } from 'react-native';

const REPO_ART = require('../../assets/illustrations/repo.png');

import { relativeTime, splitPath } from '~/components/shared/format';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import type { RepoOverview } from '~/lib/repo/types';

export type RepoRowProps = {
  overview: RepoOverview;
  first?: boolean;
  last?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

function Stat({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <View className="flex-1 items-center">
      <Text
        style={{ color: tint ?? palette.foreground, fontVariant: ['tabular-nums'] }}
        className="text-[26px] font-bold leading-tight">
        {value}
      </Text>
      <Text className="text-muted-foreground mt-1 text-2xs font-medium uppercase tracking-wider">
        {label}
      </Text>
    </View>
  );
}

export const RepoRow = React.memo(function RepoRow({
  overview,
  onPress,
  onLongPress,
}: RepoRowProps) {
  const name = overview.name || splitPath(overview.path).name;
  const time = overview.last_commit_at ? relativeTime(overview.last_commit_at * 1000) : '';

  return (
    <View className="bg-card mb-3 rounded-3xl p-5">
      <View className="flex-row items-center gap-3">
        <Image
          source={REPO_ART}
          resizeMode="cover"
          style={{ width: 52, height: 52, borderRadius: 16 }}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-xl font-bold">
            {name}
          </Text>
          {overview.error ? (
            <Text numberOfLines={1} className="text-destructive mt-0.5 text-sm">
              {overview.error}
            </Text>
          ) : (
            <View className="mt-1 flex-row items-center gap-1.5">
              <Icon as={GitBranch} size={13} className="text-muted-foreground" />
              <Text numberOfLines={1} className="text-muted-foreground max-w-[70%] text-sm">
                {overview.branch || 'detached'}
              </Text>
            </View>
          )}
        </View>
        {time ? <Text className="text-muted-foreground text-xs">{time}</Text> : null}
      </View>

      <View className="border-border mt-4 flex-row items-center rounded-2xl border py-3.5">
        <Stat
          label="Ahead"
          value={overview.ahead}
          tint={overview.ahead > 0 ? palette.success : undefined}
        />
        <View className="bg-border h-8 w-px" />
        <Stat label="Behind" value={overview.behind} />
        <View className="bg-border h-8 w-px" />
        <Stat
          label="Dirty"
          value={overview.dirty_count}
          tint={overview.dirty_count > 0 ? palette.warning : undefined}
        />
      </View>

      <View className="mt-4 flex-row gap-2.5">
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name}`}
          className="bg-primary active:opacity-80 flex-1 items-center justify-center rounded-full py-3">
          <Text className="text-primary-foreground text-sm font-semibold">Open</Text>
        </Pressable>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Details for ${name}`}
          className="bg-secondary active:opacity-80 w-14 items-center justify-center rounded-full py-3">
          <Text className="text-foreground text-base">···</Text>
        </Pressable>
      </View>
    </View>
  );
});
