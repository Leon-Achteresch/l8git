import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DashboardSparkline } from "@/components/dashboard/dashboard-sparkline";
import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/dashboard-aggregations";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

type RepoOverview = {
  path: string;
  name: string;
  branch: string;
  ahead: number;
  behind: number;
  dirty_count: number;
  last_commit_at: number | null;
  commits_last_30d: number[];
  error: string | null;
};

export function AllReposTable({ paths }: { paths: string[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setActive = useRepoStore((s) => s.setActive);
  const [rows, setRows] = useState<RepoOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (paths.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    invoke<RepoOverview[]>("repos_overview", { paths })
      .then(setRows)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [paths]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    let ahead = 0;
    let behind = 0;
    let dirty = 0;
    let stale = 0;
    const staleCut = Date.now() / 1000 - 30 * 86400;
    for (const r of rows) {
      ahead += r.ahead;
      behind += r.behind;
      if (r.dirty_count > 0) dirty += 1;
      if (r.last_commit_at !== null && r.last_commit_at < staleCut) stale += 1;
    }
    return { ahead, behind, dirty, stale };
  }, [rows]);

  const onOpen = (path: string) => {
    setActive(path);
    void navigate({ to: "/" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DashboardStatCard
          label={t("dashboard.all.totals.repos")}
          value={paths.length}
        />
        <DashboardStatCard
          label={t("dashboard.all.totals.behind")}
          value={totals.behind}
          delta={totals.behind > 0 ? t("dashboard.all.totals.attention") : t("dashboard.all.totals.allClear")}
          trend={totals.behind > 0 ? "down" : "up"}
        />
        <DashboardStatCard
          label={t("dashboard.all.totals.ahead")}
          value={totals.ahead}
          trend={totals.ahead > 0 ? "up" : "flat"}
        />
        <DashboardStatCard
          label={t("dashboard.all.totals.dirty")}
          value={totals.dirty}
          delta={`${rows.length} ${t("dashboard.all.totals.scanned")}`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>{t("dashboard.all.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("dashboard.all.subtitle")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("dashboard.all.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {paths.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("dashboard.all.empty")}</p>
          ) : error ? (
            <p className="text-xs text-rose-500">{error}</p>
          ) : loading && rows.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">{t("dashboard.all.cols.repo")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("dashboard.all.cols.branch")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("dashboard.all.cols.sync")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("dashboard.all.cols.dirty")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("dashboard.all.cols.last")}</th>
                    <th className="pb-2 font-medium">{t("dashboard.all.cols.activity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.path}
                      onClick={() => onOpen(r.path)}
                      className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.name || r.path}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{r.path}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{r.branch || "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <ArrowUp className="size-3 text-emerald-500" />
                          {r.ahead}
                          <ArrowDown className="size-3 text-rose-500" />
                          {r.behind}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-xs">
                        {r.dirty_count > 0 ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                            {r.dirty_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {r.last_commit_at
                          ? formatRelativeTime(new Date(r.last_commit_at * 1000), i18n.resolvedLanguage)
                          : "—"}
                      </td>
                      <td className="py-2">
                        <div className="h-8 w-28 text-primary">
                          <DashboardSparkline data={r.commits_last_30d} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
