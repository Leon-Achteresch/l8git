import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import {
  buildInboxSections,
  emptyInboxSections,
  GIT_ACCOUNTS_STORAGE_KEY,
  parseStoredGitAccounts,
  repoNameFromPath,
  viewerLoginForHost,
  type InboxRepoInput,
  type InboxSections,
  type InboxWorkflowRun,
} from "@/lib/inbox";
import type { ProviderCapabilities } from "@/lib/pr-provider";
import type { PullRequest } from "@/lib/repo-store";

export const INBOX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export type InboxRepoError = {
  path: string;
  repoName: string;
  message: string;
};

type InboxState = {
  loading: boolean;
  lastLoadedAt: number | null;
  sections: InboxSections;
  errors: InboxRepoError[];
  /** Keys of notifications the user has explicitly marked as read. */
  readKeys: string[];
  refresh: (paths: string[]) => Promise<void>;
  ensureFresh: (paths: string[]) => void;
  markRead: (key: string) => void;
  markAllRead: (keys: string[]) => void;
};

function withReadKey(readKeys: string[], key: string): string[] {
  return readKeys.includes(key) ? readKeys : [...readKeys, key];
}

export function isInboxKeyRead(readKeys: string[], key: string): boolean {
  return readKeys.includes(key);
}

async function loadRepo(
  path: string,
): Promise<{ input: InboxRepoInput | null; error: InboxRepoError | null }> {
  const repoName = repoNameFromPath(path);
  let caps: ProviderCapabilities | null = null;
  try {
    caps = await invoke<ProviderCapabilities>("pr_provider_capabilities", { path });
  } catch {
    return { input: null, error: null };
  }

  const accounts = parseStoredGitAccounts(
    typeof localStorage === "undefined" ? null : localStorage.getItem(GIT_ACCOUNTS_STORAGE_KEY),
  );
  const viewerLogin = viewerLoginForHost(accounts, caps.host);

  let prs: PullRequest[] = [];
  let error: InboxRepoError | null = null;
  try {
    prs = await invoke<PullRequest[]>("pr_list", { path });
  } catch (e) {
    error = { path, repoName, message: String(e) };
  }

  let defaultBranch: string | null = null;
  try {
    defaultBranch = await invoke<string | null>("pr_default_branch", { path });
  } catch {
    defaultBranch = null;
  }

  let runs: InboxWorkflowRun[] = [];
  if (caps.can_workflows) {
    try {
      runs = await invoke<InboxWorkflowRun[]>("list_workflow_runs", { path });
    } catch {
      runs = [];
    }
  }

  if (error && prs.length === 0 && runs.length === 0) {
    return { input: null, error };
  }
  return { input: { path, repoName, viewerLogin, prs, runs, defaultBranch }, error };
}

export const useInboxStore = create<InboxState>((set, get) => ({
  loading: false,
  lastLoadedAt: null,
  sections: emptyInboxSections(),
  errors: [],
  readKeys: [],
  markRead: (key) => set((state) => ({ readKeys: withReadKey(state.readKeys, key) })),
  markAllRead: (keys) =>
    set((state) => ({ readKeys: Array.from(new Set([...state.readKeys, ...keys])) })),

  refresh: async (paths) => {
    if (get().loading) return;
    if (paths.length === 0) {
      set({ sections: emptyInboxSections(), errors: [], lastLoadedAt: Date.now() });
      return;
    }
    set({ loading: true });
    try {
      const results = await Promise.all(paths.map((path) => loadRepo(path)));
      const inputs = results.map((r) => r.input).filter((r): r is InboxRepoInput => r !== null);
      const errors = results.map((r) => r.error).filter((r): r is InboxRepoError => r !== null);
      const sections = buildInboxSections(inputs);
      const live = new Set([
        ...sections.myPrs.map((item) => item.key),
        ...sections.reviewRequested.map((item) => item.key),
        ...sections.redRuns.map((item) => item.key),
      ]);
      set((state) => ({
        sections,
        errors,
        lastLoadedAt: Date.now(),
        // Drop read markers for notifications that no longer exist, keep
        // agent keys (they are not part of the polled sections).
        readKeys: state.readKeys.filter((key) => key.startsWith("agent:") || live.has(key)),
      }));
    } finally {
      set({ loading: false });
    }
  },

  ensureFresh: (paths) => {
    const { loading, lastLoadedAt, refresh } = get();
    if (loading) return;
    if (lastLoadedAt !== null && Date.now() - lastLoadedAt < INBOX_REFRESH_INTERVAL_MS) return;
    void refresh(paths);
  },
}));
