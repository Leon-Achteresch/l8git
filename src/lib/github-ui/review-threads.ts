import { useCallback, useEffect, useState } from "react";

import { listReviewThreads, type ReviewThread } from "@/lib/github-expansion/api";

import { isTarget, useGithubTarget } from "./target";

const MAX_PAGES = 20;

/**
 * All GitHub review threads of a PR (side, start line, outdated flag), keyed by thread node id, which equals
 * the `pr_review_threads` id. Non-GitHub targets yield `null` (no range metadata; callers stay single-line).
 */
export function useReviewThreadIndex(path: string, number: number) {
  const target = useGithubTarget(path);
  const gh = isTarget(target) ? target : null;
  const [state, setState] = useState<{ key: string; threads: Map<string, ReviewThread>; truncated: boolean; error: string | null } | null>(null);
  const [epoch, setEpoch] = useState(0);
  const key = gh ? JSON.stringify([gh.account.host, gh.account.login, gh.fullName, number]) : null;

  useEffect(() => {
    if (!gh || !key) return;
    let live = true;
    void (async () => {
      const threads = new Map<string, ReviewThread>();
      let cursor: string | null = null, pages = 0, more = true;
      try {
        while (more && pages < MAX_PAGES) {
          const page = await listReviewThreads(gh.account, gh.fullName, number, cursor);
          if (!live) return;
          for (const t of page.items) threads.set(t.id, t);
          more = page.hasMore; cursor = page.cursor; pages++;
        }
        setState({ key, threads, truncated: more, error: null });
      } catch (e) {
        if (live) setState({ key, threads, truncated: true, error: String(e) });
      }
    })();
    return () => { live = false; };
  }, [key, epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setEpoch((n) => n + 1), []);
  // Results of another PR/account never leak into this one.
  const current = state && state.key === key ? state : null;
  return { supported: !!gh, threads: current?.threads ?? null, truncated: current?.truncated ?? false, error: current?.error ?? null, reload };
}
