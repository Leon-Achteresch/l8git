import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PanelValue } from "@/components/dashboard/panel-bits";
import { PatternPie, type PieSlice } from "@/components/dashboard/pattern-pie";
import { RANGES, type RangeKey } from "@/components/dashboard/ranges";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ContributorStat = {
  name: string;
  email: string;
  commits: number;
  insertions: number;
  deletions: number;
};

export function ContributorsPanel({
  path,
  range,
  className,
}: {
  path: string | null;
  range: RangeKey;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const sinceDays = RANGES[range].days;
  const [data, setData] = useState<ContributorStat[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<ContributorStat[]>("repo_contributor_stats", { path, sinceDays, limit: 64 })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, sinceDays]);

  const slices = useMemo<PieSlice[]>(() => {
    const stats = data ?? [];
    const top = stats.slice(0, 5).map((c) => ({
      key: c.email || c.name,
      label: c.name || c.email,
      value: c.commits,
    }));
    const rest = stats.slice(5).reduce((acc, c) => acc + c.commits, 0);
    if (rest > 0) {
      top.push({ key: "__others__", label: t("dashboard.contributorsPie.others"), value: rest });
    }
    return top;
  }, [data, t]);

  const contributorCount = data?.length ?? 0;

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-4">
        <PanelValue
          value={contributorCount.toLocaleString(locale)}
          label={t("dashboard.contributorsPie.label", { range: t(`dashboard.rangeLong.${range}`) })}
        />
        {loading && !data ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : slices.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {t("dashboard.contributors.empty")}
          </div>
        ) : (
          <PatternPie
            slices={slices}
            size={172}
            formatValue={(n) => n.toLocaleString(locale)}
            className="my-auto"
          />
        )}
      </CardContent>
    </Card>
  );
}
