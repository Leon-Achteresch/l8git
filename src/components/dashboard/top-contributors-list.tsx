import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

type ContributorStat = {
  name: string;
  email: string;
  commits: number;
  insertions: number;
  deletions: number;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function TopContributorsList({ path }: { path: string | null }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ContributorStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setData([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<ContributorStat[]>("repo_contributor_stats", {
      path,
      sinceDays: 90,
      limit: 8,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const max = data.reduce((acc, c) => Math.max(acc, c.commits), 0);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("dashboard.contributors.empty")}</p>
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((c) => {
        const pct = max > 0 ? (c.commits / max) * 100 : 0;
        return (
          <li key={`${c.email}-${c.name}`} className="flex items-center gap-3">
            <Avatar className="size-7">
              <AvatarFallback className="text-[10px]">{initials(c.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium">{c.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {t("dashboard.contributors.commits", { count: c.commits })}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground tabular-nums">
                <span className="text-emerald-500">+{c.insertions.toLocaleString()}</span>
                <span className="text-rose-500">-{c.deletions.toLocaleString()}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
