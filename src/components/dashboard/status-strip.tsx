import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import {
  selectBranchBuckets,
  selectOpenPrTrend,
  selectWorkingCopy,
} from "@/lib/dashboard-aggregations";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

export function StatusStrip({ path, className }: { path: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const repo = useRepoStore((s) => s.repos[path]);
  const status = useRepoStore((s) => s.status[path]);
  const upstreamSync = useRepoStore((s) => s.upstreamSync[path]);
  const hasUpstream = useRepoStore((s) => s.hasUpstream[path]);
  const prs = useRepoStore((s) => s.prs[path]);

  const workingCopy = useMemo(() => selectWorkingCopy(status), [status]);
  const branchBuckets = useMemo(
    () => selectBranchBuckets(repo?.branches, repo?.commits),
    [repo?.branches, repo?.commits],
  );
  const prTrend = useMemo(() => selectOpenPrTrend(prs, 8), [prs]);
  const openPrCount = prs?.filter((p) => p.state === "open").length ?? 0;

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

  return (
    <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>
      <StatusTile
        label={t("dashboard.cards.workingCopy")}
        value={workingCopy.total.toLocaleString(locale)}
        aside={
          <span className="text-[11px] tabular-nums">
            <span className="text-git-added">+{additions.toLocaleString(locale)}</span>{" "}
            <span className="text-git-removed">−{deletions.toLocaleString(locale)}</span>
          </span>
        }
      >
        <SegmentBar
          segments={[
            { value: workingCopy.staged, className: "bg-foreground/80" },
            { value: workingCopy.unstaged, className: "bg-foreground/45" },
            { value: workingCopy.untracked, className: "bg-foreground/[0.18]" },
          ]}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>{t("dashboard.cards.staged", { n: workingCopy.staged })}</span>
          <span>{t("dashboard.cards.unstaged", { n: workingCopy.unstaged })}</span>
          <span>{t("dashboard.cards.untracked", { n: workingCopy.untracked })}</span>
        </div>
      </StatusTile>

      <StatusTile
        label={t("dashboard.cards.upstream")}
        value={
          hasUpstream === false ? (
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
        {hasUpstream === false ? null : (
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
        value={openPrCount.toLocaleString(locale)}
        aside={<MiniBars data={prTrend.map((p) => p.count)} />}
      >
        <span className="text-[10px] text-muted-foreground">
          {t("dashboard.cards.openPrsFooter")}
        </span>
      </StatusTile>

      <StatusTile label={t("dashboard.cards.branches")} value={branchBuckets.total.toLocaleString(locale)}>
        <SegmentBar
          segments={[
            { value: branchBuckets.active, className: "bg-foreground/80" },
            { value: branchBuckets.stale, className: "bg-foreground/45" },
            { value: branchBuckets.remote, className: "bg-foreground/[0.18]" },
          ]}
        />
        <span className="text-[10px] text-muted-foreground">
          {t("dashboard.cards.branchesFooter", {
            active: branchBuckets.active,
            stale: branchBuckets.stale,
          })}{" "}
          · {t("dashboard.cards.branchesRemote", { n: branchBuckets.remote })}
        </span>
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

function MiniBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-6 items-end gap-0.5">
      {data.map((v, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 rounded-[2px]",
            i === data.length - 1 ? "bg-foreground/80" : "bg-foreground/25",
          )}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
