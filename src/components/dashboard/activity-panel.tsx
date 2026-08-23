import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BrickBarChart } from "@/components/dashboard/brick-bar-chart";
import {
  DeltaBadge,
  LegendDot,
  PanelError,
  PanelValue,
  RangePills,
} from "@/components/dashboard/panel-bits";
import { RANGE_KEYS, RANGES, type RangeKey } from "@/components/dashboard/ranges";
import { formatCompact, useActivityBuckets } from "@/components/dashboard/use-activity-buckets";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildDailySeries, groupActivity, sumActivity } from "@/lib/dashboard-aggregations";

export function ActivityPanel({
  path,
  range,
  onRangeChange,
  className,
}: {
  path: string | null;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const { days, grouping } = RANGES[range];
  const { data, loading, error } = useActivityBuckets(path, days * 2, "day");

  const series = useMemo(() => buildDailySeries(data ?? [], days * 2), [data, days]);
  const current = useMemo(() => series.slice(days), [series, days]);
  const previous = useMemo(() => series.slice(0, days), [series, days]);
  const totals = useMemo(() => sumActivity(current), [current]);
  const prevTotals = useMemo(() => sumActivity(previous), [previous]);

  const deltaPct =
    prevTotals.commits === 0
      ? null
      : Math.round(((totals.commits - prevTotals.commits) / prevTotals.commits) * 100);

  const labelFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, grouping === "month"
        ? { month: "short" }
        : { day: "numeric", month: "short" }),
    [locale, grouping],
  );

  const chartData = useMemo(
    () =>
      groupActivity(current, grouping).map((d) => ({
        key: d.date,
        label: labelFmt.format(new Date(d.date + "T00:00:00Z")),
        primary: d.insertions,
        secondary: d.deletions,
      })),
    [current, grouping, labelFmt],
  );

  const compact = (n: number) => formatCompact(n, locale);
  const isEmpty = !loading && totals.commits === 0;

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelValue
            value={data ? totals.commits.toLocaleString(locale) : "—"}
            label={t("dashboard.hero.label", { range: t(`dashboard.rangeLong.${range}`) })}
          >
            <div className="mt-1.5 flex items-center gap-3">
              <LegendDot
                swatchClassName="bg-foreground/[0.22]"
                label={t("dashboard.hero.insertions")}
              />
              <LegendDot swatchClassName="bg-foreground/80" label={t("dashboard.hero.deletions")} />
            </div>
          </PanelValue>
          <div className="flex flex-col items-end gap-2">
            <RangePills
              options={RANGE_KEYS.map((k) => ({ key: k, label: t(`dashboard.range.${k}`) }))}
              value={range}
              onChange={onRangeChange}
            />
            {data ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  <span className="text-git-added">+{compact(totals.insertions)}</span>
                  {" / "}
                  <span className="text-git-removed">−{compact(totals.deletions)}</span>{" "}
                  {t("dashboard.hero.lines")}
                </span>
                <DeltaBadge pct={deltaPct} suffix={t("dashboard.hero.vsPrev")} />
              </div>
            ) : null}
          </div>
        </div>

        {loading && !data ? (
          <Skeleton className="h-[248px] w-full rounded-lg" />
        ) : error ? (
          <PanelError message={t("dashboard.loadError")} className="h-[248px]" />
        ) : isEmpty ? (
          <div className="flex h-[248px] items-center justify-center text-xs text-muted-foreground">
            {t("dashboard.hero.empty")}
          </div>
        ) : (
          <BrickBarChart
            data={chartData}
            height={248}
            primaryLabel={t("dashboard.hero.insertions")}
            secondaryLabel={t("dashboard.hero.deletions")}
            formatValue={compact}
          />
        )}
      </CardContent>
    </Card>
  );
}
