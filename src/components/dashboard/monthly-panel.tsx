import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DashedBarChart } from "@/components/dashboard/dashed-bar-chart";
import { DeltaBadge, PanelError, PanelValue } from "@/components/dashboard/panel-bits";
import { useActivityBuckets } from "@/components/dashboard/use-activity-buckets";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DAY_MS = 86_400_000;
const MONTHS_SHOWN = 12;

function daysCoveringMonths(months: number): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1);
  return Math.ceil((Date.now() - start) / DAY_MS) + 1;
}

export function MonthlyPanel({ path, className }: { path: string | null; className?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const sinceDays = useMemo(() => daysCoveringMonths(MONTHS_SHOWN), []);
  const { data, loading, error } = useActivityBuckets(path, sinceDays, "month");

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  const monthLongFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long" }),
    [locale],
  );

  const months = useMemo(() => {
    const byKey = new Map((data ?? []).map((b) => [b.bucket.slice(0, 7), b.commits]));
    const now = new Date();
    const result: { key: string; label: string; value: number; date: Date }[] = [];
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      result.push({ key, label: monthFmt.format(d), value: byKey.get(key) ?? 0, date: d });
    }
    return result;
  }, [data, monthFmt]);

  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];
  const deltaPct =
    !lastMonth || lastMonth.value === 0
      ? null
      : Math.round(((thisMonth.value - lastMonth.value) / lastMonth.value) * 100);

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <PanelValue
            value={data ? thisMonth.value.toLocaleString(locale) : "—"}
            label={t("dashboard.monthly.label", { month: monthLongFmt.format(thisMonth.date) })}
          />
          {data ? <DeltaBadge pct={deltaPct} className="mt-1" /> : null}
        </div>
        {loading && !data ? (
          <Skeleton className="h-[248px] w-full rounded-lg" />
        ) : error ? (
          <PanelError message={t("dashboard.loadError")} className="h-[248px]" />
        ) : (
          <DashedBarChart
            data={months}
            height={248}
            valueLabel={t("dashboard.monthly.commits")}
            formatValue={(n) => n.toLocaleString(locale)}
          />
        )}
      </CardContent>
    </Card>
  );
}
