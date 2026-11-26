import { formatBackendError } from '@/lib/backend-error';
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PanelError, PanelValue } from "@/components/dashboard/panel-bits";
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

type ContributorSummary = {
  total: number;
  leaders: ContributorStat[];
  other_commits: number;
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
  const [data, setData] = useState<ContributorSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setData(null);
    setLoading(true);
    setError(null);
    invoke<ContributorSummary>("repo_contributor_summary", { path, sinceDays })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(formatBackendError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, sinceDays]);

  const slices = useMemo<PieSlice[]>(() => {
    if (!data) return [];
    const top = data.leaders.map((c) => ({
      key: JSON.stringify([c.name, c.email]),
      label: c.name || c.email,
      value: c.commits,
    }));
    if (data.other_commits > 0) {
      top.push({ key: "__others__", label: t("dashboard.contributorsPie.others"), value: data.other_commits });
    }
    return top;
  }, [data, t]);

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-4">
        <PanelValue
          value={data ? data.total.toLocaleString(locale) : "—"}
          label={t("dashboard.contributorsPie.label", { range: t(`dashboard.rangeLong.${range}`) })}
        />
        {loading && !data ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : error ? (
          <PanelError message={t("dashboard.loadError")} className="h-[180px]" />
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
