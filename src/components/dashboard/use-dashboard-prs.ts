import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type { PullRequest } from "@/lib/repo-store";

export type DashboardPrs = {
  data: PullRequest[] | null;
  loading: boolean;
  unavailable: boolean;
};

export function useDashboardPrs(path: string | null): DashboardPrs {
  const [data, setData] = useState<PullRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!path) {
      setData(null);
      setUnavailable(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    invoke<PullRequest[]>("pr_list", { path })
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, loading, unavailable };
}
