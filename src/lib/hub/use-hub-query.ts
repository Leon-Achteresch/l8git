import { useEffect, useState } from "react";

import { accountKey, adapterFor, hubCache, useHubStore } from "./store";
import type { HubAccount, HubAdapter } from "./types";

export type HubQuery<T> = { data: T | undefined; error: string | null; loading: boolean };

/**
 * Cached provider read keyed by account + `key`. Stale data stays visible
 * while a refetch runs so views never flash empty.
 */
export function useHubQuery<T>(
  account: HubAccount | null,
  key: string | null,
  read: (adapter: HubAdapter, a: HubAccount) => Promise<T>,
): HubQuery<T> {
  const version = useHubStore((s) => s.version);
  const markSynced = useHubStore((s) => s.markSynced);
  const [state, setState] = useState<HubQuery<T> & { for: string | null }>({ data: undefined, error: null, loading: false, for: null });
  const full = account && key ? `${accountKey(account)}|${key}` : null;

  useEffect(() => {
    if (!account || !full) return;
    const adapter = adapterFor(account);
    if (!adapter) {
      setState({ data: undefined, error: "unsupported", loading: false, for: full });
      return;
    }
    let live = true;
    setState((s) => ({ data: s.for === full ? s.data : undefined, error: null, loading: true, for: full }));
    (hubCache.get(full, () => read(adapter, account)) as Promise<T>).then(
      (data) => {
        if (!live) return;
        setState({ data, error: null, loading: false, for: full });
        markSynced();
      },
      (e) => live && setState((s) => ({ ...s, error: String(e), loading: false })),
    );
    return () => {
      live = false;
    };
    // `read` is an inline closure; `full` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, version]);

  return state.for === full ? state : { data: undefined, error: null, loading: !!full };
}
