import { useCallback, useEffect, useRef, useState } from "react";

import { getBranchRules, getIssue, getMergeReadiness, getPullMeta, type GithubIssue, type MergeReadiness, type PullMeta } from "@/lib/github-expansion/api";

import type { BranchRule } from "./readiness";
import { isTarget, useGithubTarget, type GithubTarget, type GithubTargetMiss } from "./target";

export type PrGithubState = {
  target: GithubTarget | null;
  miss: GithubTargetMiss["reason"] | null;
  readiness: MergeReadiness | null;
  issue: GithubIssue | null;
  /** Reviewer requests incl. teams, latest reviews and pinned base/head OIDs. */
  meta: PullMeta | null;
  /** null = could not be read (permission/plan), not "no rules". */
  rules: BranchRule[] | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

type Loaded = Pick<PrGithubState, "readiness" | "issue" | "meta" | "rules" | "error" | "loading">;
const EMPTY: Loaded = { readiness: null, issue: null, meta: null, rules: null, error: null, loading: false };

/** Live GitHub state for one PR: readiness, issue-side metadata and effective branch rules. */
export function usePrGithub(path: string, number: number, refreshKey: unknown): PrGithubState {
  const res = useGithubTarget(path);
  const target = isTarget(res) ? res : null;
  const account = target?.account;
  const fullName = target?.fullName;
  // Every loaded value is tagged with the account/repo/PR it was read for; a mismatch renders as empty,
  // so a mounted detail switching A→B never shows (or acts on) A's node ID, even before effects run.
  const scope = account && fullName ? `${account.login}@${account.host}/${fullName}#${number}` : null;
  const [state, setState] = useState<Loaded & { scope: string | null }>({ ...EMPTY, scope: null });
  const gen = useRef(0);
  const live = useRef(scope);

  const reload = useCallback(async () => {
    // A reload captured by an older render (e.g. after a slow mutation) must not cancel or overwrite the live PR.
    if (!account || !fullName || !scope || live.current !== scope) return;
    const my = ++gen.current;
    const put = (patch: Partial<Loaded>) => {
      if (gen.current === my && live.current === scope) setState((s) => (s.scope === scope ? { ...s, ...patch } : { ...EMPTY, ...patch, scope }));
    };
    put({ loading: true });
    try {
      const [r, i, m] = await Promise.all([
        getMergeReadiness(account, fullName, number),
        getIssue(account, fullName, number),
        getPullMeta(account, fullName, number).catch(() => null),
      ]);
      put({ readiness: r, issue: i, meta: m, error: null });
      const rules = await getBranchRules(account, fullName, r.baseRefName).then((x) => x as BranchRule[], () => null);
      put({ rules });
    } catch (e) {
      put({ error: String(e) });
    } finally {
      put({ loading: false });
    }
  }, [account, fullName, number, scope]);

  useEffect(() => {
    live.current = scope;
    gen.current++; // drop any in-flight read for the previous scope
    setState({ ...EMPTY, scope });
    void reload();
  }, [reload, refreshKey, scope]);

  const shown = state.scope === scope ? state : EMPTY;
  return { target, miss: isTarget(res) ? null : res.reason, ...shown, reload };
}
