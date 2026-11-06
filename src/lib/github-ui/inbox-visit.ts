import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { HubAccount } from "@/lib/hub/types";
import { platformStorage } from "@/lib/platform/kv";

/** Account scope for the last inbox visit (provider + host + login; case-insensitive host/login). */
export const inboxVisitKey = (a: Pick<HubAccount, "provider" | "host" | "login">) => JSON.stringify([a.provider, a.host.toLowerCase(), a.login.toLowerCase()]);

/** 37: last time the inbox was viewed, per account scope. */
export const useInboxVisit = create<{ lastVisit: Record<string, number>; mark: (account: string, now?: number) => void }>()(
  persist(
    (set) => ({ lastVisit: {}, mark: (account, now = Date.now()) => set((s) => ({ lastVisit: { ...s.lastVisit, [account]: now } })) }),
    { name: "l8git-inbox-visit-v1", storage: createJSONStorage(() => platformStorage) },
  ),
);
