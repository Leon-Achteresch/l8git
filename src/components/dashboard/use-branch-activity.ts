import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type { BranchActivityEntry } from "@/lib/dashboard-aggregations";

export type DashboardBranchActivity = {
  data: BranchActivityEntry[] | null;
  loading: boolean;
  error: string | null;
};

export function useBranchActivity(path: string | null): DashboardBranchActivity {
  const [data, setData] = useState<BranchActivityEntry[] | null>(null);
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
    invoke<BranchActivityEntry[]>("repo_branch_activity", { path })
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
  }, [path]);

  return { data, loading, error };
}
