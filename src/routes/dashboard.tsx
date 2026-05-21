import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FileDiff,
  FilePlus2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Languages as LanguagesIcon,
  ListChecks,
  Activity as ActivityIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AllReposTable } from "@/components/dashboard/all-repos-table";
import { CommitActivityChart } from "@/components/dashboard/commit-activity-chart";
import { DashboardDonut } from "@/components/dashboard/dashboard-donut";
import { DashboardMiniBars, DashboardMirrorBars } from "@/components/dashboard/dashboard-mini-bars";
import { DashboardSparkline } from "@/components/dashboard/dashboard-sparkline";
import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";
import { LanguageBreakdown } from "@/components/dashboard/language-breakdown";
import { RecentActivityFeed } from "@/components/dashboard/recent-activity-feed";
import { RepoHealthList } from "@/components/dashboard/repo-health-list";
import { TopContributorsList } from "@/components/dashboard/top-contributors-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  selectBranchBuckets,
  selectCommitsByDay,
  selectOpenPrTrend,
  selectRecentActivity,
  selectRepoHealth,
  selectWorkingCopy,
} from "@/lib/dashboard-aggregations";
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

  const last30 = useMemo(() => selectCommitsByDay(commits, 30), [commits]);
  const prev30 = useMemo(() => {
    const buckets = selectCommitsByDay(commits, 60).slice(0, 30);
    return buckets;
  }, [commits]);
  const commitsLast30Total = last30.reduce((acc, b) => acc + b.commits, 0);
  const commitsPrev30Total = prev30.reduce((acc, b) => acc + b.commits, 0);
  const commitsDeltaPct =
    commitsPrev30Total === 0
      ? null
      : Math.round(((commitsLast30Total - commitsPrev30Total) / commitsPrev30Total) * 100);

  const branchBuckets = useMemo(() => selectBranchBuckets(branches, commits), [branches, commits]);

  const workingCopy = useMemo(() => selectWorkingCopy(status), [status]);

  const prTrend = useMemo(() => selectOpenPrTrend(prs, 8), [prs]);
  const openPrCount = prs?.filter((p) => p.state === "open").length ?? 0;

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

  const additions = (status ?? []).reduce(
    (acc, e) => acc + e.additions_staged + e.additions_unstaged,
    0,
  );
  const deletions = (status ?? []).reduce(
    (acc, e) => acc + e.deletions_staged + e.deletions_unstaged,
    0,
  );

  const ahead = upstreamSync?.ahead ?? 0;
  const behind = upstreamSync?.behind ?? 0;

  const fakeAddRemoveSeries = last30.map((b) => b.commits);

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("dashboard.activeRepoLabel")}
        <span className="ml-2 text-foreground">{repoName || path}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <DashboardStatCard
          icon={GitCommit}
          label={t("dashboard.cards.commits30")}
          value={commitsLast30Total}
          delta={
            commitsDeltaPct === null
              ? undefined
              : `${commitsDeltaPct >= 0 ? "+" : ""}${commitsDeltaPct}%`
          }
          trend={commitsDeltaPct === null ? "flat" : commitsDeltaPct >= 0 ? "up" : "down"}
          chart={
            <div className="h-full w-full text-primary">
              <DashboardMiniBars data={last30.map((b) => b.commits)} color="currentColor" />
            </div>
          }
        />
        <DashboardStatCard
          icon={FileDiff}
          label={t("dashboard.cards.lineDelta")}
          value={`${additions - deletions >= 0 ? "+" : ""}${(additions - deletions).toLocaleString()}`}
          delta={`+${additions} / -${deletions}`}
          trend={additions >= deletions ? "up" : "down"}
          chart={
            <DashboardMirrorBars
              positive={fakeAddRemoveSeries}
              negative={fakeAddRemoveSeries.map((v) => Math.max(0, v - 1))}
              positiveColor="rgb(16 185 129)"
              negativeColor="rgb(244 63 94)"
            />
          }
        />
        <DashboardStatCard
          icon={GitBranch}
          label={t("dashboard.cards.branches")}
          value={branchBuckets.total}
          footer={t("dashboard.cards.branchesFooter", {
            active: branchBuckets.active,
            stale: branchBuckets.stale,
          })}
          chart={
            <DashboardDonut
              size={48}
              thickness={8}
              slices={[
                { key: "active", value: branchBuckets.active, color: "rgb(16 185 129)" },
                { key: "stale", value: branchBuckets.stale, color: "rgb(245 158 11)" },
                { key: "remote", value: branchBuckets.remote, color: "rgb(99 102 241)" },
              ]}
            />
          }
        />
        <DashboardStatCard
          icon={ahead >= behind ? ArrowUp : ArrowDown}
          label={t("dashboard.cards.upstream")}
          value={
            hasUpstream === false ? (
              <span className="text-base font-normal text-muted-foreground">
                {t("dashboard.cards.noUpstream")}
              </span>
            ) : (
              `${ahead}/${behind}`
            )
          }
          footer={
            hasUpstream === false
              ? undefined
              : t("dashboard.cards.upstreamFooter", { ahead, behind })
          }
        />
        <DashboardStatCard
          icon={GitPullRequest}
          label={t("dashboard.cards.openPrs")}
          value={openPrCount}
          chart={
            <div className="h-full w-full text-primary">
              <DashboardSparkline data={prTrend.map((p) => p.count)} />
            </div>
          }
        />
        <DashboardStatCard
          icon={FilePlus2}
          label={t("dashboard.cards.workingCopy")}
          value={workingCopy.total}
          footer={
            <div className="flex flex-wrap gap-1">
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                {t("dashboard.cards.staged", { n: workingCopy.staged })}
              </span>
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                {t("dashboard.cards.unstaged", { n: workingCopy.unstaged })}
              </span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t("dashboard.cards.untracked", { n: workingCopy.untracked })}
              </span>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="h-[320px]">
            <CommitActivityChart path={path} className="h-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ActivityIcon className="size-4 text-muted-foreground" />
              {t("dashboard.contributors.title")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.contributors.subtitle")}
            </p>
          </CardHeader>
          <CardContent>
            <TopContributorsList path={path} />
          </CardContent>
        </Card>
      </div>

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
