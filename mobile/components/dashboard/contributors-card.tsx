import { Users } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { compactNumber } from '~/components/dashboard/aggregate';
import { Panel, PanelEmpty, PanelError, PanelHeader } from '~/components/dashboard/panel';
import { useContributorStats } from '~/components/dashboard/queries';
import { initials } from '~/components/shared/format';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const VISIBLE = 6;

export function ContributorsCard({
  hostId,
  repoPath,
  sinceDays,
  rangeLabel,
}: {
  hostId: string;
  repoPath: string | null;
  sinceDays: number;
  rangeLabel: string;
}) {
  const query = useContributorStats(hostId, repoPath, sinceDays);
  const stats = query.data ?? [];
  const top = stats.slice(0, VISIBLE);
  const peak = Math.max(1, ...top.map((entry) => entry.commits));
  const rest = stats.length - top.length;

  return (
    <Panel>
      <PanelHeader
        title="Contributors"
        hint={rangeLabel}
        icon={Users}
        right={
          query.data ? (
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-foreground text-2xl font-bold">
              {stats.length}
            </Text>
          ) : null
        }
      />

      {query.isPending ? (
        <View className="gap-3 py-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} className="flex-row items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-3 flex-1 rounded" />
              <Skeleton className="h-3 w-8 rounded" />
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : top.length === 0 ? (
        <PanelEmpty icon={Users} message={`No commits in the ${rangeLabel}.`} />
      ) : (
        <Animated.View entering={FadeIn.duration(200)} className="gap-3">
          {top.map((entry, index) => {
            return (
              <View key={`${entry.email}-${entry.name}-${index}`} className="flex-row items-center gap-3">
                <Avatar alt={entry.name || entry.email} className="bg-secondary size-9">
                  <AvatarFallback className="bg-transparent">
                    <Text className="text-foreground text-xs font-semibold">
                      {initials(entry.name || entry.email)}
                    </Text>
                  </AvatarFallback>
                </Avatar>

                <View className="min-w-0 flex-1 gap-1.5">
                  <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
                    {entry.name || entry.email || 'Unknown'}
                  </Text>
                  <View className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                    <View
                      style={{
                        width: `${Math.max(4, (entry.commits / peak) * 100)}%`,
                        backgroundColor: palette.foreground,
                      }}
                      className="h-full rounded-full"
                    />
                  </View>
                </View>

                <View className="items-end gap-0.5">
                  <Text
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="text-foreground text-base font-bold">
                    {compactNumber(entry.commits)}
                  </Text>
                  <Text className="text-2xs font-mono">
                    <Text className="text-git-added text-2xs font-mono">
                      {`+${compactNumber(entry.insertions)}`}
                    </Text>
                    <Text className="text-muted-foreground/60 text-2xs font-mono">{'  '}</Text>
                    <Text className="text-git-removed text-2xs font-mono">
                      {`-${compactNumber(entry.deletions)}`}
                    </Text>
                  </Text>
                </View>
              </View>
            );
          })}

          {rest > 0 ? (
            <Text className="text-muted-foreground/70 text-xs">{`+${rest} more contributors`}</Text>
          ) : null}
        </Animated.View>
      )}
    </Panel>
  );
}
