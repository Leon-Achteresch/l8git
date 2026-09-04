import { GitCommit, GitPullRequest, Package } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { RecentActivityItem } from "@/lib/dashboard-aggregations";
import { formatRelativeTime } from "@/lib/dashboard-aggregations";

const ICONS: Record<RecentActivityItem["kind"], typeof GitCommit> = {
  commit: GitCommit,
  pr: GitPullRequest,
  stash: Package,
};

export function RecentActivityFeed({
  items,
  loading,
}: {
  items: RecentActivityItem[];
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (loading && items.length === 0) {
    return (
      <div role="status" aria-live="polite" aria-label={t("dashboard.activityFeed.loading", { defaultValue: "Loading activity" })} className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed border-border/70 bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground">
        {t("dashboard.activityFeed.empty")}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id} className="l8-row-transition flex items-start gap-2 rounded-lg px-1 py-0.5 text-xs hover:bg-muted/40">
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground ring-1 ring-border/40">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium" title={item.title}>{item.title}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {formatRelativeTime(item.date, i18n.resolvedLanguage)}
                </span>
              </div>
              {item.subtitle ? (
                <p className="truncate text-[11px] text-muted-foreground" title={item.subtitle}>{item.subtitle}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
