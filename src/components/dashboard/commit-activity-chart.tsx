import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Bucket = "day" | "week" | "month";

type ActivityBucket = {
  bucket: string;
  commits: number;
  insertions: number;
  deletions: number;
};

export function CommitActivityChart({
  path,
  className,
}: {
  path: string | null;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [bucket, setBucket] = useState<Bucket>("day");
  const [data, setData] = useState<ActivityBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sinceDays = bucket === "day" ? 90 : bucket === "week" ? 365 : 730;
    invoke<ActivityBucket[]>("repo_activity_buckets", {
      path,
      sinceDays,
      bucket,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, bucket]);

  const labelFormatter = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      year: "numeric",
      month: "short",
      day: bucket === "month" ? undefined : "2-digit",
    });
    return (value: string) => {
      const d = new Date(value + "T00:00:00Z");
      return Number.isNaN(d.getTime()) ? value : fmt.format(d);
    };
  }, [bucket, i18n.resolvedLanguage]);

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-heading text-base font-medium leading-none">
            {t("dashboard.activity.title")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("dashboard.activity.subtitle")}
          </span>
        </div>
        <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
          <TabsList variant="line" className="h-7 p-0">
            <TabsTrigger value="day" className="h-7 px-2 text-xs">
              {t("dashboard.activity.day")}
            </TabsTrigger>
            <TabsTrigger value="week" className="h-7 px-2 text-xs">
              {t("dashboard.activity.week")}
            </TabsTrigger>
            <TabsTrigger value="month" className="h-7 px-2 text-xs">
              {t("dashboard.activity.month")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="relative min-h-[220px] flex-1">
        {loading ? (
          <Skeleton className="absolute inset-0 rounded-lg" />
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("dashboard.activity.empty")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="dashboard-activity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: string) => {
                  const d = new Date(v + "T00:00:00Z");
                  if (Number.isNaN(d.getTime())) return v;
                  return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                    month: "short",
                    day: bucket === "month" ? undefined : "2-digit",
                  }).format(d);
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={32}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--popover)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                labelFormatter={(label) => labelFormatter(String(label))}
                formatter={(value, name) => [String(value), t(`dashboard.activity.legend.${String(name)}`)]}
              />
              <Area
                type="monotone"
                dataKey="commits"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#dashboard-activity-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
