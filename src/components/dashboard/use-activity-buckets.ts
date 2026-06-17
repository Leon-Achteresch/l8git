import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type { RawActivityBucket } from "@/lib/dashboard-aggregations";

export function useActivityBuckets(
  path: string | null,
  sinceDays: number,
  bucket: "day" | "week" | "month",
) {
  const [data, setData] = useState<RawActivityBucket[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<RawActivityBucket[]>("repo_activity_buckets", { path, sinceDays, bucket })
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
  }, [path, sinceDays, bucket]);

  return { data, loading };
}

export function formatCompact(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
