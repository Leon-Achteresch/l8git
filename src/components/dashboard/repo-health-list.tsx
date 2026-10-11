import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { HealthItem } from "@/lib/dashboard-aggregations";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function RepoHealthList({ items, refreshing, onRefresh }: {
  items: HealthItem[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const failed = items.some(item => item.error);
  return <section aria-label={t("dashboard.health.title")} aria-busy={refreshing} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground" role="status">
        {refreshing ? t("dashboard.health.states.refreshing") : failed ? t("dashboard.health.states.refreshFailed") : null}
      </p>
      <Button type="button" size="xs" variant="outline" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw aria-hidden className={cn("size-3", refreshing && "animate-spin")} />
        {t("dashboard.health.states.refresh")}
      </Button>
    </div>
    <ul className="space-y-2">
      {items.map(item => {
        const tone = item.severity === "error" ? "bg-git-removed" : item.availability !== "ready" || item.severity === "unknown"
          ? "bg-muted-foreground/50" : item.severity === "ok" ? "bg-git-added" : "bg-git-modified";
        const hasValue = item.availability === "ready" || item.availability === "lastKnown" || item.severity === "error" && (item.values?.count ?? 0) > 0;
        const value = hasValue ? t(item.messageKey, item.values) : t(`dashboard.health.states.${item.availability}`);
        return <li key={item.key} data-testid={`repo-health-${item.key}`} className="space-y-1.5 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs [overflow-wrap:anywhere]">
          <div className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone)} />
            <span className="font-medium">{t(`dashboard.health.${item.key}.label`)}</span>
          </div>
          <p className="tabular-nums text-muted-foreground">{value}</p>
          {hasValue && item.availability !== "ready" ? <p className="text-[0.6875rem] text-muted-foreground">
            {t(`dashboard.health.states.${item.availability}`)}{item.refreshing ? ` · ${t("dashboard.health.states.refreshing")}` : null}
          </p> : null}
          {item.error ? <p className="text-[0.6875rem] text-git-modified">{item.error}</p> : null}
          {item.guide ? <Link to="/info" hash={item.guide} className="inline-block rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t(`dashboard.health.${item.key}.action`)}
          </Link> : item.view ? <Link to="/" onClick={() => { const ui = useUiStore.getState(); ui.setSidebarTab("history"); ui.setBisectVisible(true); }} className="inline-block rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t(`dashboard.health.${item.key}.action`)}
          </Link> : null}
        </li>;
      })}
    </ul>
  </section>;
}
