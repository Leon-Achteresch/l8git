import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useBranchActivity } from "@/components/dashboard/use-branch-activity";
import type { DashboardPrs } from "@/components/dashboard/use-dashboard-prs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  selectBranchActivity,
  selectBranchScopes,
  selectWorkingCopy,
} from "@/lib/dashboard-aggregations";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

export function StatusStrip({
  path,
  prs: prState,
  className,
}: {
  path: string;
  prs: DashboardPrs;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const repo = useRepoStore((s) => s.repos[path]);
  const status = useRepoStore((s) => s.status[path]);
  const upstreamSync = useRepoStore((s) => s.upstreamSync[path]);
  const hasUpstream = useRepoStore((s) => s.hasUpstream[path]);
  const { data: prs, loading: prsLoading, unavailable: prsUnavailable } = prState;

  const { data: branchActivity, loading: branchActivityLoading } = useBranchActivity(path);

  const workingCopy = useMemo(() => selectWorkingCopy(status), [status]);
  const branchScopes = useMemo(() => selectBranchScopes(repo?.branches), [repo?.branches]);
  const branchAges = useMemo(() => selectBranchActivity(branchActivity ?? undefined), [branchActivity]);
  const openPrs = useMemo(() => (prs ?? []).filter((p) => p.state === "open"), [prs]);
  const draftPrs = openPrs.filter((p) => p.is_draft).length;

  const additions = (status ?? []).reduce(
    (acc, e) => acc + e.additions_staged + e.additions_unstaged,
    0,
  );
  const deletions = (status ?? []).reduce(
    (acc, e) => acc + e.deletions_staged + e.deletions_unstaged,
    0,
  );

  const statusLoaded = status !== undefined;
  const upstreamLoaded = upstreamSync !== undefined || hasUpstream !== undefined;
  const branchesLoaded = repo !== undefined;
  const ahead = upstreamSync?.ahead ?? 0;
  const behind = upstreamSync?.behind ?? 0;

  return (
    <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>
      <StatusTile
        label={t("dashboard.cards.workingCopy")}
        value={statusLoaded ? workingCopy.total.toLocaleString(locale) : <TileSkeleton />}
        aside={
          statusLoaded ? (
            <span className="text-[11px] tabular-nums">
              <span className="text-git-added">+{additions.toLocaleString(locale)}</span>{" "}
              <span className="text-git-removed">−{deletions.toLocaleString(locale)}</span>
            </span>
          ) : null
        }
      >
        <SegmentBar
          segments={[
            { value: workingCopy.staged, className: "bg-foreground/80" },
            { value: workingCopy.unstaged, className: "bg-foreground/45" },
            { value: workingCopy.untracked, className: "bg-foreground/[0.18]" },
          ]}
        />
        {statusLoaded ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>{t("dashboard.cards.staged", { n: workingCopy.staged })}</span>
            <span>{t("dashboard.cards.unstaged", { n: workingCopy.unstaged })}</span>
            <span>{t("dashboard.cards.untracked", { n: workingCopy.untracked })}</span>
          </div>
        ) : null}
      </StatusTile>

      <StatusTile
        label={t("dashboard.cards.upstream")}
        value={
          !upstreamLoaded ? (
            <TileSkeleton />
          ) : hasUpstream === false ? (
            <span className="text-sm font-normal text-muted-foreground">
              {t("dashboard.cards.noUpstream")}
            </span>
          ) : (
            <span>
              <span className="text-git-added">↑{ahead}</span>{" "}
              <span className="text-git-removed">↓{behind}</span>
            </span>
          )
        }
      >
        {hasUpstream === false || !upstreamLoaded ? null : (
          <>
            <SegmentBar
              segments={[
                { value: ahead, className: "bg-foreground/80" },
                { value: behind, className: "bg-foreground/[0.18]" },
              ]}
            />
            <span className="text-[10px] text-muted-foreground">
              {t("dashboard.cards.upstreamFooter", { ahead, behind })}
            </span>
          </>
        )}
      </StatusTile>

      <StatusTile
        label={t("dashboard.cards.openPrs")}
        value={
          prsUnavailable ? (
            <span className="text-sm font-normal text-muted-foreground">—</span>
          ) : prsLoading && !prs ? (
            <TileSkeleton />
          ) : (
            openPrs.length.toLocaleString(locale)
          )
        }
      >
        <span className="text-[10px] text-muted-foreground">
          {prsUnavailable
            ? t("dashboard.cards.prsUnavailable")
            : t("dashboard.cards.prsDrafts", { n: draftPrs })}
        </span>
      </StatusTile>

      <StatusTile
        label={t("dashboard.cards.branches")}
        value={branchesLoaded ? branchScopes.total.toLocaleString(locale) : <TileSkeleton />}
      >
        <SegmentBar
          segments={
            branchActivity
              ? [
                  { value: branchAges.active, className: "bg-foreground/80" },
                  { value: branchAges.stale, className: "bg-foreground/[0.18]" },
                ]
              : [
                  { value: branchScopes.local, className: "bg-foreground/80" },
                  { value: branchScopes.remote, className: "bg-foreground/[0.18]" },
                ]
          }
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {branchActivity ? (
            <span>
              {t("dashboard.cards.branchesActive", { n: branchAges.active })} ·{" "}
              {t("dashboard.cards.branchesStale", { n: branchAges.stale })}
            </span>
          ) : branchActivityLoading ? (
            <Skeleton className="h-2.5 w-24 rounded" />
          ) : null}
          <span>
            {t("dashboard.cards.branchesLocal", { n: branchScopes.local })} ·{" "}
            {t("dashboard.cards.branchesRemote", { n: branchScopes.remote })}
          </span>
        </div>
      </StatusTile>
    </div>
  );
}

function StatusTile({
  label,
  value,
  aside,
  children,
}: {
  label: string;
  value: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex h-full flex-col gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-xl font-semibold leading-none tracking-tight tabular-nums">
            {value}
          </span>
          {aside}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SegmentBar({
  segments,
}: {
  segments: { value: number; className: string }[];
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-foreground/[0.08]" />;
  }
  return (
    <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full">
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <div
            key={i}
            className={cn("h-full", s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

function TileSkeleton() {
  return <Skeleton className="h-5 w-12 rounded" />;
}
