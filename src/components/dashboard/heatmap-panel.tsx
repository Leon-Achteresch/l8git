import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { PanelValue } from "@/components/dashboard/panel-bits";
import { useActivityBuckets } from "@/components/dashboard/use-activity-buckets";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildDailySeries, selectStreaks } from "@/lib/dashboard-aggregations";

const HEATMAP_DAYS = 364;

export function HeatmapPanel({ path, className }: { path: string | null; className?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const { data, loading } = useActivityBuckets(path, HEATMAP_DAYS, "day");

  const series = useMemo(() => buildDailySeries(data ?? [], HEATMAP_DAYS), [data]);
  const streaks = useMemo(() => selectStreaks(series), [series]);

  const busiestFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    [locale],
  );

  const heatDays = useMemo(
    () => series.map((d) => ({ date: d.date, count: d.commits })),
    [series],
  );

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <PanelValue
            value={streaks.activeDays.toLocaleString(locale)}
            label={t("dashboard.heatmap.label")}
          />
          <div className="flex items-center gap-6">
            <HeatStat
              label={t("dashboard.heatmap.currentStreak")}
              value={t("dashboard.heatmap.days", { count: streaks.currentStreak })}
            />
            <HeatStat
              label={t("dashboard.heatmap.longestStreak")}
              value={t("dashboard.heatmap.days", { count: streaks.longestStreak })}
            />
            <HeatStat
              label={t("dashboard.heatmap.busiest")}
              value={
                streaks.busiest
                  ? `${busiestFmt.format(new Date(streaks.busiest.date + "T00:00:00Z"))} · ${streaks.busiest.commits}`
                  : "—"
              }
            />
          </div>
        </div>
        {loading && !data ? (
          <Skeleton className="h-[116px] w-full rounded-lg" />
        ) : (
          <CalendarHeatmap
            days={heatDays}
            locale={locale}
            countLabel={t("dashboard.heatmap.commits")}
          />
        )}
      </CardContent>
    </Card>
  );
}

function HeatStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-right">
      <span className="text-sm font-semibold tabular-nums leading-tight">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
