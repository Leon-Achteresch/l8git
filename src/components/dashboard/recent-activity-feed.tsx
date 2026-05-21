import { GitBranch, GitCommit, GitPullRequest, Package } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RecentActivityItem } from "@/lib/dashboard-aggregations";
import { formatRelativeTime } from "@/lib/dashboard-aggregations";

const ICONS: Record<RecentActivityItem["kind"], typeof GitCommit> = {
  commit: GitCommit,
  branch: GitBranch,
  pr: GitPullRequest,
  stash: Package,
};

export function RecentActivityFeed({ items }: { items: RecentActivityItem[] }) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("dashboard.activityFeed.empty")}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{item.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatRelativeTime(item.date, i18n.resolvedLanguage)}
                </span>
              </div>
              {item.subtitle ? (
                <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
