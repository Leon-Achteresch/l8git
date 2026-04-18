import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { toastError } from "@/lib/error-toast";

export type GitAccount = {
  id: string;
  name: string;
  host: string;
  username: string | null;
  signed_in: boolean;
  builtin: boolean;
};

type CustomHost = { id: string; name: string; host: string };

const CUSTOM_KEY = "gitit-custom-git-hosts";
const SESSION_CACHE_KEY = "gitit.git-accounts.v1";

type SessionCache = {
  accounts: GitAccount[];
  helper: string | null;
};

function loadCustomHosts(): CustomHost[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomHosts(hosts: CustomHost[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(hosts));
}

function readSessionCache(): SessionCache | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SessionCache;
    if (!Array.isArray(o.accounts)) return null;
    return { accounts: o.accounts, helper: o.helper ?? null };
  } catch {
    return null;
  }
}

function writeSessionCache(accounts: GitAccount[], helper: string | null) {
  try {
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ accounts, helper } satisfies SessionCache),
    );
  } catch {
    /* ignore */
  }
}

function sessionCachePrimed(): boolean {
  try {
    return !!sessionStorage.getItem(SESSION_CACHE_KEY);
  } catch {
    return false;
  }
}

export function useGitAccounts() {
  const boot = useMemo(() => readSessionCache(), []);
  const [accounts, setAccounts] = useState<GitAccount[]>(
    () => boot?.accounts ?? [],
  );
  const [helper, setHelper] = useState<string | null>(() => boot?.helper ?? null);
  const [loading, setLoading] = useState(() => !boot);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const customHosts = loadCustomHosts();
      const customInvokes = customHosts.map((c) =>
        invoke<GitAccount>("probe_git_account", {
          id: c.id,
          name: c.name,
          host: c.host,
        }),
      );
      const [builtin, h, ...customProbes] = await Promise.all([
        invoke<GitAccount[]>("list_git_accounts"),
        invoke<string | null>("git_credential_helper"),
        ...customInvokes,
      ]);
      const merged = [...builtin, ...customProbes];
      setAccounts(merged);
      setHelper(h);
      writeSessionCache(merged, h);
    } catch (e) {
      toastError(String(e));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh({ silent: sessionCachePrimed() });
  }, [refresh]);

  const signIn = useCallback(
    async (host: string, username: string, token: string) => {
      await invoke("git_sign_in", { host, username, token });
      void refresh({ silent: true });
    },
    [refresh],
  );

  const signInViaCredentialManager = useCallback(
    async (host: string) => {
      await invoke("git_sign_in_via_credential_manager", { host });
      void refresh({ silent: true });
    },
    [refresh],
  );

  const signOut = useCallback(
    async (host: string, username: string | null) => {
      await invoke("git_sign_out", { host, username });
      void refresh({ silent: true });
    },
    [refresh],
  );

  const addCustomHost = useCallback(
    (name: string, host: string) => {
      const trimmedHost = host.trim();
      const trimmedName = name.trim() || trimmedHost;
      if (!trimmedHost) return;
      const existing = loadCustomHosts();
      if (existing.some((h) => h.host === trimmedHost)) return;
      const next: CustomHost[] = [
        ...existing,
        { id: `custom-${trimmedHost}`, name: trimmedName, host: trimmedHost },
      ];
      saveCustomHosts(next);
      void refresh({ silent: true });
    },
    [refresh],
  );

  const removeCustomHost = useCallback(
    (host: string) => {
      const next = loadCustomHosts().filter((h) => h.host !== host);
      saveCustomHosts(next);
      void refresh({ silent: true });
    },
    [refresh],
  );

  return {
    accounts,
    helper,
    loading,
    refreshing,
    refresh,
    signIn,
    signInViaCredentialManager,
    signOut,
    addCustomHost,
    removeCustomHost,
  };
}
