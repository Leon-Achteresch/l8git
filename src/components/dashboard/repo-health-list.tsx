import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { HealthItem } from "@/lib/dashboard-aggregations";
import { cn } from "@/lib/utils";

export function RepoHealthList({ items, loading }: { items: HealthItem[]; loading?: boolean }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <Skeleton key={item.key} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const tone =
          item.severity === "ok"
            ? "bg-git-added"
            : item.severity === "warn"
              ? "bg-git-modified"
              : "bg-git-removed";
        return (
          <li
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", tone)} />
              <span className="font-medium">{t(`dashboard.health.${item.key}.label`)}</span>
            </div>
            <span className="tabular-nums text-muted-foreground">
              {item.detail !== undefined && item.detail !== ""
                ? String(item.detail)
                : t(`dashboard.health.${item.key}.${item.severity}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
