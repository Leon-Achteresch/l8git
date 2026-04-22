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

type StoredAccount = {
  id: string;
  name: string;
  host: string;
  username: string | null;
  builtin: boolean;
};

type BuiltinProvider = { id: string; name: string; host: string };

const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  { id: "github", name: "GitHub", host: "github.com" },
  { id: "gitlab", name: "GitLab", host: "gitlab.com" },
  { id: "bitbucket", name: "Bitbucket", host: "bitbucket.org" },
  { id: "azure", name: "Azure DevOps", host: "dev.azure.com" },
];

const ACCOUNTS_KEY = "l8git.git-accounts.v2";
const HELPER_CACHE_KEY = "l8git.git-credential-helper.v1";

function loadStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredAccount =>
        typeof a === "object" &&
        a !== null &&
        typeof a.host === "string" &&
        typeof a.name === "string" &&
        typeof a.id === "string" &&
        typeof a.builtin === "boolean",
    );
  } catch {
    return [];
  }
}

function saveStoredAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function upsertAccount(
  accounts: StoredAccount[],
  entry: StoredAccount,
): StoredAccount[] {
  const filtered = accounts.filter((a) => a.host !== entry.host);
  return [...filtered, entry];
}

function builtinFor(host: string): BuiltinProvider | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.host === host);
}

function toGitAccount(stored: StoredAccount): GitAccount {
  return {
    id: stored.id,
    name: stored.name,
    host: stored.host,
    username: stored.username,
    signed_in: true,
    builtin: stored.builtin,
  };
}

function readHelperCache(): string | null {
  try {
    const raw = sessionStorage.getItem(HELPER_CACHE_KEY);
    return raw ?? null;
  } catch {
    return null;
  }
}

function writeHelperCache(helper: string | null) {
  try {
    if (helper === null) sessionStorage.removeItem(HELPER_CACHE_KEY);
    else sessionStorage.setItem(HELPER_CACHE_KEY, helper);
  } catch {
    /* ignore */
  }
}

export function useGitAccounts() {
  const initial = useMemo(() => loadStoredAccounts(), []);
  const [accounts, setAccounts] = useState<GitAccount[]>(() =>
    initial.map(toGitAccount),
  );
  const [helper, setHelper] = useState<string | null>(() => readHelperCache());
  const [loading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshHelper = useCallback(async () => {
    setRefreshing(true);
    try {
      const h = await invoke<string | null>("git_credential_helper");
      setHelper(h);
      writeHelperCache(h);
    } catch (e) {
      toastError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(
    async (_options?: { silent?: boolean }) => {
      setAccounts(loadStoredAccounts().map(toGitAccount));
      await refreshHelper();
    },
    [refreshHelper],
  );

  useEffect(() => {
    if (readHelperCache() === null) {
      void refreshHelper();
    }
  }, [refreshHelper]);

  const persistAndSet = useCallback((next: StoredAccount[]) => {
    saveStoredAccounts(next);
    setAccounts(next.map(toGitAccount));
  }, []);

  const signIn = useCallback(
    async (host: string, username: string, token: string) => {
      await invoke("git_sign_in", { host, username, token });
      const trimmedHost = host.trim();
      const trimmedUser = username.trim();
      const builtin = builtinFor(trimmedHost);
      const current = loadStoredAccounts();
      const existing = current.find((a) => a.host === trimmedHost);
      const entry: StoredAccount = {
        id:
          existing?.id ??
          builtin?.id ??
          `custom-${trimmedHost}`,
        name: existing?.name ?? builtin?.name ?? trimmedHost,
        host: trimmedHost,
        username: trimmedUser || null,
        builtin: existing?.builtin ?? !!builtin,
      };
      persistAndSet(upsertAccount(current, entry));
    },
    [persistAndSet],
  );

  const signInViaCredentialManager = useCallback(
    async (host: string) => {
      const result = await invoke<{ username: string | null }>(
        "git_sign_in_via_credential_manager",
        { host },
      );
      const trimmedHost = host.trim();
      const builtin = builtinFor(trimmedHost);
      const current = loadStoredAccounts();
      const existing = current.find((a) => a.host === trimmedHost);
      const entry: StoredAccount = {
        id:
          existing?.id ??
          builtin?.id ??
          `custom-${trimmedHost}`,
        name: existing?.name ?? builtin?.name ?? trimmedHost,
        host: trimmedHost,
        username: result.username ?? existing?.username ?? null,
        builtin: existing?.builtin ?? !!builtin,
      };
      persistAndSet(upsertAccount(current, entry));
    },
    [persistAndSet],
  );

  const signOut = useCallback(
    async (host: string, username: string | null) => {
      await invoke("git_sign_out", { host, username });
      const current = loadStoredAccounts();
      persistAndSet(current.filter((a) => a.host !== host));
    },
    [persistAndSet],
  );

  const addCustomHost = useCallback(
    (name: string, host: string) => {
      const trimmedHost = host.trim();
      const trimmedName = name.trim() || trimmedHost;
      if (!trimmedHost) return;
      const current = loadStoredAccounts();
      if (current.some((a) => a.host === trimmedHost)) return;
      const entry: StoredAccount = {
        id: `custom-${trimmedHost}`,
        name: trimmedName,
        host: trimmedHost,
        username: null,
        builtin: false,
      };
      persistAndSet([...current, entry]);
    },
    [persistAndSet],
  );

  const removeCustomHost = useCallback(
    (host: string) => {
      const current = loadStoredAccounts();
      persistAndSet(current.filter((a) => a.host !== host));
    },
    [persistAndSet],
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
