import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createReadCache } from "@/lib/async-cache";

import { bitbucket } from "./bitbucket";
import { github } from "./github";
import { gitlab } from "./gitlab";
import type { HubAccount, HubAdapter } from "./types";

export type ConnectMethod = "token" | "gh" | "git";

export const accountKey = (a: Pick<HubAccount, "host" | "login">) => `${a.login}@${a.host}`;

export function adapterFor(a: HubAccount): HubAdapter | null {
  switch (a.provider) {
    case "github":
      return github;
    case "gitlab":
      return gitlab;
    case "bitbucket":
      return bitbucket;
    default:
      return null;
  }
}

type HubState = {
  accounts: HubAccount[];
  activeKey: string | null;
  pinned: Record<string, string[]>;
  /** Bumped by "refresh" so every hub query refetches. */
  version: number;
  syncedAt: number | null;
  connect: (host: string, method: ConnectMethod, token?: string, username?: string) => Promise<HubAccount[]>;
  addAccounts: (list: HubAccount[]) => void;
  remove: (a: HubAccount) => Promise<void>;
  activate: (key: string, useForGit: boolean) => Promise<void>;
  togglePin: (fullName: string) => void;
  refresh: () => void;
  markSynced: () => void;
};

export const hubCache = createReadCache<unknown>(60_000, 200);

export const useHubStore = create<HubState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeKey: null,
      pinned: {},
      version: 0,
      syncedAt: null,

      async connect(host, method, token, username) {
        const list = await invoke<HubAccount[]>("hub_connect", { host, method, token: token ?? null, username: username ?? null });
        get().addAccounts(list);
        return list;
      },

      addAccounts(list) {
        if (list.length === 0) return;
        const keys = new Set(list.map(accountKey));
        set((s) => ({
          accounts: [...s.accounts.filter((a) => !keys.has(accountKey(a))), ...list],
          activeKey: accountKey(list[0]),
        }));
      },

      async remove(a) {
        await invoke("hub_disconnect", { host: a.host, login: a.login });
        const key = accountKey(a);
        set((s) => {
          const accounts = s.accounts.filter((x) => accountKey(x) !== key);
          const pinned = { ...s.pinned };
          delete pinned[key];
          return {
            accounts,
            pinned,
            activeKey: s.activeKey === key ? (accounts[0] ? accountKey(accounts[0]) : null) : s.activeKey,
          };
        });
      },

      async activate(key, useForGit) {
        const a = get().accounts.find((x) => accountKey(x) === key);
        if (!a) return;
        set({ activeKey: key });
        if (useForGit) await invoke("hub_use_for_git", { host: a.host, login: a.login });
      },

      togglePin(fullName) {
        const key = get().activeKey;
        if (!key) return;
        set((s) => {
          const cur = s.pinned[key] ?? [];
          const next = cur.includes(fullName) ? cur.filter((n) => n !== fullName) : [...cur, fullName];
          return { pinned: { ...s.pinned, [key]: next } };
        });
      },

      refresh() {
        hubCache.clear();
        set((s) => ({ version: s.version + 1 }));
      },

      markSynced() {
        set({ syncedAt: Date.now() });
      },
    }),
    {
      name: "l8git.hub.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accounts: s.accounts, activeKey: s.activeKey, pinned: s.pinned }),
    },
  ),
);

export function useActiveAccount(): HubAccount | null {
  return useHubStore((s) => s.accounts.find((a) => accountKey(a) === s.activeKey) ?? s.accounts[0] ?? null);
}
