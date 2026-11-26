import { formatBackendError } from '@/lib/backend-error';
import { createReadCache } from '@/lib/async-cache';
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PanelValue } from "@/components/dashboard/panel-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/dashboard-aggregations";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { SpinIcon, staggerEnter } from "@/components/motion/kit";

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

// Share concurrent reads. Refresh always starts a fresh status snapshot.
const overviewRequests = createReadCache<RepoOverview[]>(0, 0);

export function AllReposTable({ paths }: { paths: string[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setActive = useRepoStore((s) => s.setActive);
  const [rows, setRows] = useState<RepoOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (!needle) return rows;
    return rows.filter(row =>
      row.name.toLowerCase().includes(needle) ||
      row.path.toLowerCase().includes(needle) ||
      row.branch.toLowerCase().includes(needle),
    );
  }, [rows, needle]);

  const load = useCallback(() => {
    if (paths.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    overviewRequests.get(JSON.stringify(paths), () => invoke<RepoOverview[]>("repos_overview", { paths }))
      .then(setRows)
      .catch((err) => setError(formatBackendError(err)))
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
    let available = 0;
    for (const r of rows) {
      if (r.error) continue;
      available += 1;
      ahead += r.ahead;
      behind += r.behind;
      if (r.dirty_count > 0) dirty += 1;
      commits30 += r.commits_last_30d.reduce((acc, v) => acc + v, 0);
    }
    return { ahead, behind, dirty, commits30, available };
  }, [rows]);
  const hasTotals = paths.length === 0 || totals.available > 0;

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
              value={hasTotals ? totals.commits30.toLocaleString(i18n.resolvedLanguage) : "—"}
              label={t("dashboard.all.totals.commits30")}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <PanelValue
              value={hasTotals ? (
                <span>
                  <span className="text-git-added">↑{totals.ahead}</span>{" "}
                  <span className="text-git-removed">↓{totals.behind}</span>
                </span>
              ) : "—"}
              label={t("dashboard.all.totals.sync")}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <PanelValue
              value={hasTotals ? totals.dirty : "—"}
              label={t("dashboard.all.totals.dirty")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t("dashboard.all.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {totals.available < rows.length
                ? t("dashboard.all.partialTotals", { loaded: totals.available, total: rows.length })
                : t("dashboard.all.subtitle")}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {paths.length > 0 && (
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-muted-foreground" />
                <Input
                  type="search" inputSize="sm" className="w-56 max-w-full pl-7" value={query}
                  aria-label={t("dashboard.all.filter")} placeholder={t("dashboard.all.filter")}
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Escape" && query) {
                      event.preventDefault();
                      setQuery("");
                    }
                  }}
                />
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <SpinIcon icon={RefreshCw} active={loading} className="size-3.5" />
              {t("dashboard.all.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p role="alert" className="mb-2 text-xs text-git-removed">
            {error}{rows.length > 0 && ` · ${t("dashboard.health.states.lastKnown")}`}
          </p>}
          {paths.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("dashboard.all.empty")}</p>
          ) : loading && rows.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : error && rows.length === 0 ? null : needle && visibleRows.length === 0 ? (
            <p role="status" className="text-xs text-muted-foreground">{t("dashboard.all.noMatches")}</p>
          ) : (
            <Table className="min-w-[640px] border-collapse">
              <TableHeader>
                <TableRow className="text-left text-[0.625rem] uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                  <TableHead className="h-auto pb-2 pr-3 text-[0.625rem] font-medium text-muted-foreground">{t("dashboard.all.cols.repo")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-[0.625rem] font-medium text-muted-foreground">{t("dashboard.all.cols.branch")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-right text-[0.625rem] font-medium text-muted-foreground">{t("dashboard.all.cols.sync")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-right text-[0.625rem] font-medium text-muted-foreground">{t("dashboard.all.cols.dirty")}</TableHead>
                  <TableHead className="h-auto pb-2 pr-3 text-[0.625rem] font-medium text-muted-foreground">{t("dashboard.all.cols.last")}</TableHead>
                  <TableHead className="h-auto pb-2 text-[0.625rem] font-medium text-muted-foreground">{t("dashboard.all.cols.activity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {visibleRows.map((r, i) => (
                    <TableRow
                      key={r.path}
                      {...staggerEnter(i)}
                      className="relative cursor-pointer border-border/40 hover:bg-muted/40 focus-within:bg-muted/40"
                    >
                      <TableCell className="py-2.5 pr-3">
                        <button type="button" onClick={() => onOpen(r.path)}
                          className="block max-w-full rounded-sm text-left after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-ring">
                          <span className="block font-medium">{r.name || r.path}</span>
                          {r.name && <span className="block truncate text-[0.625rem] text-muted-foreground">{r.path}</span>}
                        </button>
                      </TableCell>
                      {r.error ? (
                        <TableCell colSpan={5} className="py-2.5 text-xs text-git-removed">
                          {formatBackendError(r.error)}
                        </TableCell>
                      ) : <>
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
                          {r.last_commit_at != null
                            ? formatRelativeTime(new Date(r.last_commit_at * 1000), i18n.resolvedLanguage)
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <ActivityStrip data={r.commits_last_30d} />
                        </TableCell>
                      </>}
                    </TableRow>
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
