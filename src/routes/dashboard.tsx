import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Languages as LanguagesIcon,
  ListChecks,
  Activity as ActivityIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityPanel } from "@/components/dashboard/activity-panel";
import { AllReposTable } from "@/components/dashboard/all-repos-table";
import { ContributorsPanel } from "@/components/dashboard/contributors-panel";
import { HeatmapPanel } from "@/components/dashboard/heatmap-panel";
import { LanguageBreakdown } from "@/components/dashboard/language-breakdown";
import { MonthlyPanel } from "@/components/dashboard/monthly-panel";
import type { RangeKey } from "@/components/dashboard/ranges";
import { RecentActivityFeed } from "@/components/dashboard/recent-activity-feed";
import { RepoHealthList } from "@/components/dashboard/repo-health-list";
import { StatusStrip } from "@/components/dashboard/status-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { selectRecentActivity, selectRepoHealth } from "@/lib/dashboard-aggregations";
import { useRepoStore } from "@/lib/repo-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const activePath = useRepoStore((s) => s.activePath);
  const activeRepoName = useRepoStore((s) =>
    s.activePath ? (s.repos[s.activePath]?.path?.split(/[\\/]/).pop() ?? "") : "",
  );

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspacePaths = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.repoPaths ?? [],
  );
  const knownPaths = useRepoStore((s) => s.paths);
  const allPaths = useMemo(() => {
    const set = new Set<string>();
    for (const p of workspacePaths) set.add(p);
    for (const p of knownPaths) set.add(p);
    return Array.from(set);
  }, [workspacePaths, knownPaths]);

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => router.history.back()}
            aria-label={t("dashboard.backAria")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-semibold leading-tight">
              {t("dashboard.title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("dashboard.subtitle")}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="active" key={activeWorkspaceId}>
        <TabsList>
          <TabsTrigger value="active">{t("dashboard.tabs.active")}</TabsTrigger>
          <TabsTrigger value="all">
            {t("dashboard.tabs.all")}
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {allPaths.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ActiveRepoDashboard path={activePath} repoName={activeRepoName} />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AllReposTable paths={allPaths} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function ActiveRepoDashboard({ path, repoName }: { path: string | null; repoName: string }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeKey>("1m");

  const repo = useRepoStore((s) => (path ? s.repos[path] : undefined));
  const status = useRepoStore((s) => (path ? s.status[path] : undefined));
  const upstreamSync = useRepoStore((s) => (path ? s.upstreamSync[path] : undefined));
  const hasUpstream = useRepoStore((s) => (path ? s.hasUpstream[path] : undefined));
  const prs = useRepoStore((s) => (path ? s.prs[path] : undefined));
  const stashes = useRepoStore((s) => (path ? s.stashes[path] : undefined));
  const worktrees = useRepoStore((s) => (path ? s.worktrees[path] : undefined));
  const bisect = useRepoStore((s) => (path ? s.bisect[path] : undefined));
  const cherryPick = useRepoStore((s) => (path ? s.cherryPickState[path] : undefined));
  const mergeState = useRepoStore((s) => (path ? s.mergeState[path] : undefined));

  const commits = repo?.commits ?? [];
  const branches = repo?.branches ?? [];

  const recent = useMemo(
    () => selectRecentActivity({ commits, prs, stashes, branches, limit: 10 }),
    [commits, prs, stashes, branches],
  );

  const health = useMemo(
    () =>
      selectRepoHealth({
        status,
        upstreamSync,
        hasUpstream,
        cherryPick,
        mergeState,
        bisect,
        stashes,
        worktrees,
      }),
    [status, upstreamSync, hasUpstream, cherryPick, mergeState, bisect, stashes, worktrees],
  );

  if (!path) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("dashboard.noActiveRepo")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("dashboard.activeRepoLabel")}
        <span className="ml-2 font-medium text-foreground">{repoName || path}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityPanel
          path={path}
          range={range}
          onRangeChange={setRange}
          className="lg:col-span-2"
        />
        <MonthlyPanel path={path} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HeatmapPanel path={path} className="lg:col-span-2" />
        <ContributorsPanel path={path} range={range} />
      </div>

      <StatusStrip path={path} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LanguagesIcon className="size-4 text-muted-foreground" />
              {t("dashboard.languages.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LanguageBreakdown path={path} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ActivityIcon className="size-4 text-muted-foreground" />
              {t("dashboard.activityFeed.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecentActivityFeed items={recent} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="size-4 text-muted-foreground" />
              {t("dashboard.health.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RepoHealthList items={health} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
