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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<RawActivityBucket[]>("repo_activity_buckets", { path, sinceDays, bucket })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, sinceDays, bucket]);

  return { data, loading, error };
}

export function formatCompact(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
