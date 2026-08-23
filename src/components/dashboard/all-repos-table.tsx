import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PanelValue } from "@/components/dashboard/panel-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/dashboard-aggregations";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";
import { motionize, staggerEnter } from "@/components/motion/kit";

const MotionTableRow = motionize(TableRow);

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
    let commits30 = 0;
    for (const r of rows) {
      ahead += r.ahead;
      behind += r.behind;
      if (r.dirty_count > 0) dirty += 1;
      commits30 += r.commits_last_30d.reduce((acc, v) => acc + v, 0);
    }
    return { ahead, behind, dirty, commits30 };
  }, [rows]);

  const onOpen = (path: string) => {
    setActive(path);
    void navigate({ to: "/" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <PanelValue value={paths.length} label={t("dashboard.all.totals.repos")} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <PanelValue
              value={totals.commits30.toLocaleString(i18n.resolvedLanguage)}
              label={t("dashboard.all.totals.commits30")}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <PanelValue
              value={
                <span>
                  <span className="text-git-added">↑{totals.ahead}</span>{" "}
                  <span className="text-git-removed">↓{totals.behind}</span>
                </span>
              }
              label={t("dashboard.all.totals.sync")}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <PanelValue
              value={totals.dirty}
              label={t("dashboard.all.totals.dirty")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>{t("dashboard.all.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("dashboard.all.subtitle")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <SpinIcon icon={RefreshCw} active={loading} className="size-3.5" />
            {t("dashboard.all.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {paths.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("dashboard.all.empty")}</p>
          ) : error ? (
            <p className="text-xs text-git-removed">{error}</p>
          ) : loading && rows.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : (
            <Table className="min-w-[640px] border-collapse">
              <TableHeader>
                <TableRow className="text-left text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                  <TableHead className="h-auto pb-2 pr-3 text-[10px] font-medium text-muted-foreground">{t("dashboard.all.cols.repo")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-[10px] font-medium text-muted-foreground">{t("dashboard.all.cols.branch")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-right text-[10px] font-medium text-muted-foreground">{t("dashboard.all.cols.sync")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-right text-[10px] font-medium text-muted-foreground">{t("dashboard.all.cols.dirty")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-[10px] font-medium text-muted-foreground">{t("dashboard.all.cols.last")}</TableHead>
                  <TableHead className="h-auto pb-2 text-[10px] font-medium text-muted-foreground">{t("dashboard.all.cols.activity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {rows.map((r, i) => (
                    <MotionTableRow
                      key={r.path}
                      {...staggerEnter(i)}
                      onClick={() => onOpen(r.path)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(r.path);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      className="cursor-pointer border-border/40 hover:bg-muted/40"
                    >
                      <TableCell className="py-2.5 pr-3">
                        <div className="font-medium">{r.name || r.path}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{r.path}</div>
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                        {r.branch || "—"}
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 text-right tabular-nums">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={cn(r.ahead > 0 ? "text-git-added" : "text-muted-foreground")}>
                            ↑{r.ahead}
                          </span>
                          <span className={cn(r.behind > 0 ? "text-git-removed" : "text-muted-foreground")}>
                            ↓{r.behind}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 text-right tabular-nums text-xs">
                        {r.dirty_count > 0 ? (
                          <Badge variant="outline" className="border-0 bg-git-modified-subtle text-git-modified">
                            {r.dirty_count}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {r.last_commit_at
                          ? formatRelativeTime(new Date(r.last_commit_at * 1000), i18n.resolvedLanguage)
                          : "—"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <ActivityStrip data={r.commits_last_30d} />
                      </TableCell>
                    </MotionTableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityStrip({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-7 w-32 items-end gap-px">
      {data.map((v, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[1px]",
            v > 0 ? "bg-foreground/70" : "bg-foreground/[0.12]",
          )}
          style={{ height: v > 0 ? `${Math.max(18, (v / max) * 100)}%` : "12%" }}
        />
      ))}
    </div>
  );
}
