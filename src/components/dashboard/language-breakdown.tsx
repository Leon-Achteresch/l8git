import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";

type LanguageStat = {
  language: string;
  color: string;
  bytes: number;
  percent: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

export function LanguageBreakdown({ path }: { path: string | null }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<LanguageStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setStats([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<LanguageStat[]>("repo_language_stats", { path })
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {
        if (!cancelled) setStats([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full rounded" />
        ))}
      </div>
    );
  }
  if (stats.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("dashboard.languages.empty")}</p>;
  }

  const top = stats.slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {top.map((s) => (
          <div
            key={s.language}
            style={{ width: `${s.percent}%`, backgroundColor: s.color }}
            title={`${s.language} ${s.percent.toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="space-y-1.5">
        {top.map((s) => (
          <li key={s.language} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 truncate font-medium">{s.language}</span>
            <span className="tabular-nums text-muted-foreground">{s.percent.toFixed(1)}%</span>
            <span className="w-14 text-right tabular-nums text-[10px] text-muted-foreground">
              {formatBytes(s.bytes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
