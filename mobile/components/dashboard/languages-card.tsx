import { FileCode2 } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { formatBytes } from '~/components/dashboard/aggregate';
import { Panel, PanelEmpty, PanelError, PanelHeader } from '~/components/dashboard/panel';
import { useLanguageStats, type LanguageStat } from '~/components/dashboard/queries';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const VISIBLE = 6;
const OTHER_COLOR = palette.mutedForeground;

type Segment = {
  key: string;
  label: string;
  color: string;
  percent: number;
  bytes: number;
};

function toSegments(stats: readonly LanguageStat[]): Segment[] {
  const top = stats.slice(0, VISIBLE).map<Segment>((stat) => ({
    key: stat.language,
    label: stat.language,
    color: stat.color || palette.mutedForeground,
    percent: stat.percent,
    bytes: stat.bytes,
  }));
  const rest = stats.slice(VISIBLE);
  if (rest.length > 0) {
    top.push({
      key: '__other__',
      label: `Other (${rest.length})`,
      color: OTHER_COLOR,
      percent: rest.reduce((acc, stat) => acc + stat.percent, 0),
      bytes: rest.reduce((acc, stat) => acc + stat.bytes, 0),
    });
  }
  return top;
}

export function LanguagesCard({
  hostId,
  repoPath,
}: {
  hostId: string;
  repoPath: string | null;
}) {
  const query = useLanguageStats(hostId, repoPath);
  const segments = React.useMemo(() => toSegments(query.data ?? []), [query.data]);
  const total = query.data?.reduce((acc, stat) => acc + stat.bytes, 0) ?? 0;

  return (
    <Panel>
      <PanelHeader
        title="Languages"
        icon={FileCode2}
        iconColor={palette.cat.cyan}
        hint={total > 0 ? `${formatBytes(total)} tracked` : undefined}
      />

      {query.isPending ? (
        <View className="gap-3 py-1">
          <Skeleton className="h-2.5 w-full rounded-sm" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-full rounded" />
          ))}
        </View>
      ) : query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : segments.length === 0 ? (
        <PanelEmpty icon={FileCode2} message="No tracked source files in HEAD." />
      ) : (
        <Animated.View entering={FadeIn.duration(200)} className="gap-3">
          <View className="bg-secondary h-3 w-full flex-row gap-px overflow-hidden rounded-full">
            {segments.map((segment) => (
              <View
                key={segment.key}
                style={{
                  flexGrow: Math.max(0.6, segment.percent),
                  flexBasis: 0,
                  backgroundColor: segment.color,
                }}
                className="h-full"
              />
            ))}
          </View>

          <View className="gap-2.5">
            {segments.map((segment) => (
              <View key={segment.key} className="flex-row items-center gap-2">
                <View
                  style={{ backgroundColor: segment.color }}
                  className="h-2.5 w-2.5 rounded-full"
                />
                <Text numberOfLines={1} className="text-foreground flex-1 text-sm font-medium">
                  {segment.label}
                </Text>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-foreground font-mono text-xs font-semibold">
                  {`${segment.percent.toFixed(1)}%`}
                </Text>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-muted-foreground/60 w-16 text-right font-mono text-2xs">
                  {formatBytes(segment.bytes)}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </Panel>
  );
}
