import { Activity } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { ActivityChart } from '~/components/dashboard/activity-chart';
import {
  RANGES,
  bucketLabel,
  buildDailySeries,
  compactNumber,
  deltaPercent,
  groupActivity,
  sumActivity,
  type RangeKey,
} from '~/components/dashboard/aggregate';
import { Panel, PanelEmpty, PanelError, PanelHeader, PanelValue } from '~/components/dashboard/panel';
import { RangePills } from '~/components/dashboard/range-pills';
import { useActivityBuckets } from '~/components/dashboard/queries';
import { DeltaBadge } from '~/components/dashboard/stat-tile';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';

const CHART_HEIGHT = 132;

export function ActivityCard({
  hostId,
  repoPath,
  accent,
  range,
  onRangeChange,
}: {
  hostId: string;
  repoPath: string | null;
  accent: string;
  range: RangeKey;
  onRangeChange: (next: RangeKey) => void;
}) {
  const { days, grouping, long } = RANGES[range];
  const query = useActivityBuckets(hostId, repoPath, days * 2);
  const [scrubIndex, setScrubIndex] = React.useState<number | null>(null);

  const series = React.useMemo(
    () => buildDailySeries(query.data, days * 2),
    [days, query.data]
  );
  const current = React.useMemo(() => series.slice(days), [days, series]);
  const points = React.useMemo(() => groupActivity(current, grouping), [current, grouping]);
  const totals = React.useMemo(() => sumActivity(current), [current]);
  const previous = React.useMemo(() => sumActivity(series.slice(0, days)), [days, series]);
  const delta = deltaPercent(totals.commits, previous.commits);

  React.useEffect(() => {
    setScrubIndex(null);
  }, [range, repoPath]);

  const active = scrubIndex === null ? null : (points[scrubIndex] ?? null);
  const headline = active ? active.commits : totals.commits;
  const caption = active
    ? `${bucketLabel(active.date, grouping)} · +${compactNumber(active.insertions)} / -${compactNumber(active.deletions)}`
    : `commits in the ${long}`;

  const onScrub = React.useCallback((index: number | null) => {
    setScrubIndex(index);
  }, []);

  return (
    <Panel>
      <PanelHeader
        title="Activity"
        icon={Activity}
        right={<RangePills value={range} onChange={onRangeChange} />}
      />

      {query.isPending ? (
        <View className="gap-3">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="w-full rounded-3xl" style={{ height: CHART_HEIGHT }} />
        </View>
      ) : query.isError ? (
        <PanelError onRetry={() => void query.refetch()} height={CHART_HEIGHT} />
      ) : (
        <>
          <View className="flex-row items-end justify-between gap-3">
            <PanelValue value={compactNumber(headline)} label={caption} />
            {active ? null : (
              <View className="items-end gap-1 pb-0.5">
                <DeltaBadge value={delta} />
                <Text className="font-mono text-2xs">
                  <Text className="text-git-added font-mono text-2xs">
                    {`+${compactNumber(totals.insertions)}`}
                  </Text>
                  <Text className="text-muted-foreground/60 font-mono text-2xs">{' / '}</Text>
                  <Text className="text-git-removed font-mono text-2xs">
                    {`-${compactNumber(totals.deletions)}`}
                  </Text>
                </Text>
              </View>
            )}
          </View>

          {totals.commits === 0 ? (
            <PanelEmpty
              icon={Activity}
              message={`No commits in the ${long}.`}
              height={CHART_HEIGHT}
            />
          ) : (
            <ActivityChart
              points={points}
              grouping={grouping}
              accent={accent}
              height={CHART_HEIGHT}
              onScrub={onScrub}
            />
          )}
        </>
      )}
    </Panel>
  );
}
