import { ArrowDown, ArrowUp, ChevronRight, GitBranch, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { middleTruncate, relativeTime, splitPath } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { RepoOverview } from '~/lib/repo/types';

export type RepoRowProps = {
  overview: RepoOverview;
  first?: boolean;
  last?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export const RepoRow = React.memo(function RepoRow({
  overview,
  first,
  last,
  onPress,
  onLongPress,
}: RepoRowProps) {
  const { dir } = splitPath(overview.path);
  const lastCommit = overview.last_commit_at
    ? relativeTime(overview.last_commit_at * 1000)
    : null;

  return (
    <PressableRow
      first={first}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${overview.name}, ${overview.branch || 'no branch'}`}>
      <View className="flex-row items-center gap-3 px-3.5 py-3">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="text-foreground text-[15px] font-semibold">
              {overview.name || splitPath(overview.path).name}
            </Text>
            {overview.dirty_count > 0 ? (
              <View className="bg-git-modified h-1.5 w-1.5 rounded-full" />
            ) : null}
          </View>

          {overview.error ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={TriangleAlert} size={11} className="text-destructive" />
              <Text numberOfLines={1} className="text-destructive text-2xs">
                {overview.error}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center gap-1">
                <Icon as={GitBranch} size={11} className="text-git-branch" />
                <Text numberOfLines={1} className="text-git-branch max-w-36 text-2xs font-medium">
                  {overview.branch || 'detached'}
                </Text>
              </View>
              {lastCommit ? (
                <Text className="text-muted-foreground/60 text-2xs">{lastCommit}</Text>
              ) : null}
              {dir ? (
                <Text numberOfLines={1} className="text-muted-foreground/40 flex-1 text-2xs">
                  {middleTruncate(dir, 24)}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View className="flex-row items-center gap-1.5">
          {overview.dirty_count > 0 ? (
            <StatusPill label={overview.dirty_count} tone="modified" size="xs" mono />
          ) : null}
          {overview.behind > 0 ? (
            <StatusPill label={overview.behind} tone="info" size="xs" mono icon={ArrowDown} />
          ) : null}
          {overview.ahead > 0 ? (
            <StatusPill label={overview.ahead} tone="added" size="xs" mono icon={ArrowUp} />
          ) : null}
          <Icon as={ChevronRight} size={15} className="text-muted-foreground/40" />
        </View>
      </View>
    </PressableRow>
  );
});
