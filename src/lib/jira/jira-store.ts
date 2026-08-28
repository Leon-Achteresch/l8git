import { create } from "zustand";

import { normalizeIssueKey } from "@/lib/jira/issue-key";
import type { JiraToolContext } from "@/lib/jira/jira-tools";
import {
  ticketLinkFromIssue,
  type JiraAccount,
  type JiraCredentialStatus,
  type JiraIssue,
  type JiraTicketLink,
} from "@/lib/jira/types";
import { invoke } from "@/lib/platform/ipc";
import { kvGet, kvSet } from "@/lib/platform/kv";

export const JIRA_PREFS_KEY = "l8git.jira.v1";

/** Ticket links are pinned per repository / worktree path. */
export type JiraLinksByPath = Record<string, JiraTicketLink[]>;

export interface JiraPrefs {
  enabled: boolean;
  allowSearch: boolean;
  allowComments: boolean;
  linksByPath: JiraLinksByPath;
}

/**
 * Off by default: an integration nobody asked for must not add tool schemas to
 * anybody's context window.
 */
export const DEFAULT_JIRA_PREFS: JiraPrefs = {
  enabled: false,
  allowSearch: false,
  allowComments: true,
  linksByPath: {},
};

const EMPTY_LINKS: JiraTicketLink[] = [];

function sanitizeLink(value: unknown): JiraTicketLink | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const key = typeof raw.key === "string" ? normalizeIssueKey(raw.key) : null;
  if (!key) return null;
  const text = (field: unknown) => (typeof field === "string" ? field : "");
  const syncedAt = typeof raw.syncedAt === "number" && Number.isFinite(raw.syncedAt) ? raw.syncedAt : 0;
  return {
    key,
    summary: text(raw.summary),
    status: text(raw.status),
    statusCategory: text(raw.statusCategory),
    issueType: text(raw.issueType),
    url: text(raw.url),
    syncedAt,
  };
}

/** Tolerates hand-edited or older payloads; anything unparsable falls back. */
export function parseJiraPrefs(raw: string | null): JiraPrefs {
  if (!raw) return DEFAULT_JIRA_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_JIRA_PREFS;
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_JIRA_PREFS;
  const value = parsed as Record<string, unknown>;
  const linksByPath: JiraLinksByPath = {};
  if (typeof value.linksByPath === "object" && value.linksByPath !== null) {
    for (const [path, links] of Object.entries(value.linksByPath as Record<string, unknown>)) {
      if (!path || !Array.isArray(links)) continue;
      const sanitized = links.map(sanitizeLink).filter((link): link is JiraTicketLink => link !== null);
      if (sanitized.length) linksByPath[path] = sanitized;
    }
  }
  return {
    enabled: value.enabled === true,
    allowSearch: value.allowSearch === true,
    allowComments: value.allowComments !== false,
    linksByPath,
  };
}

export function serializeJiraPrefs(prefs: JiraPrefs): string {
  return JSON.stringify(prefs);
}

export interface JiraState extends JiraPrefs {
  status: JiraCredentialStatus;
  statusLoaded: boolean;
  setEnabled: (enabled: boolean) => void;
  setAllowSearch: (allowSearch: boolean) => void;
  setAllowComments: (allowComments: boolean) => void;
  refreshStatus: () => Promise<JiraCredentialStatus>;
  saveCredentials: (baseUrl: string, email: string, apiToken: string) => Promise<JiraCredentialStatus>;
  deleteCredentials: () => Promise<void>;
  testConnection: () => Promise<JiraAccount>;
  linkTicket: (path: string, ref: string) => Promise<JiraTicketLink>;
  unlinkTicket: (path: string, key: string) => void;
  refreshLinks: (path: string) => Promise<void>;
}

const EMPTY_STATUS: JiraCredentialStatus = {
  configured: false,
  baseUrl: "",
  email: "",
  tokenHint: "",
};

function persist(prefs: JiraPrefs): void {
  kvSet(JIRA_PREFS_KEY, serializeJiraPrefs(prefs));
}

function prefsOf(state: JiraState): JiraPrefs {
  return {
    enabled: state.enabled,
    allowSearch: state.allowSearch,
    allowComments: state.allowComments,
    linksByPath: state.linksByPath,
  };
}

function withLinks(state: JiraState, path: string, links: JiraTicketLink[]): JiraPrefs {
  const linksByPath = { ...state.linksByPath };
  if (links.length) linksByPath[path] = links;
  else delete linksByPath[path];
  return { ...prefsOf(state), linksByPath };
}

export const useJiraStore = create<JiraState>((set, get) => ({
  ...parseJiraPrefs(kvGet(JIRA_PREFS_KEY)),
  status: EMPTY_STATUS,
  statusLoaded: false,

  setEnabled: (enabled) => {
    const next = { ...prefsOf(get()), enabled };
    persist(next);
    set({ enabled });
  },
  setAllowSearch: (allowSearch) => {
    const next = { ...prefsOf(get()), allowSearch };
    persist(next);
    set({ allowSearch });
  },
  setAllowComments: (allowComments) => {
    const next = { ...prefsOf(get()), allowComments };
    persist(next);
    set({ allowComments });
  },

  refreshStatus: async () => {
    try {
      const status = await invoke<JiraCredentialStatus>("jira_credentials_status");
      set({ status, statusLoaded: true });
      return status;
    } catch {
      // A keychain that refuses to answer must read as "not configured" so the
      // tool surface stays closed rather than failing open.
      set({ status: EMPTY_STATUS, statusLoaded: true });
      return EMPTY_STATUS;
    }
  },

  saveCredentials: async (baseUrl, email, apiToken) => {
    const status = await invoke<JiraCredentialStatus>("jira_save_credentials", {
      baseUrl,
      email,
      apiToken,
    });
    set({ status, statusLoaded: true });
    return status;
  },

  deleteCredentials: async () => {
    await invoke("jira_delete_credentials");
    set({ status: EMPTY_STATUS, statusLoaded: true });
  },

  testConnection: () => invoke<JiraAccount>("jira_test_connection"),

  linkTicket: async (path, ref) => {
    const key = normalizeIssueKey(ref);
    if (!key) throw new Error("Ungültiger Ticket-Schlüssel. Erwartet wird die Form ABC-123.");
    const issue = await invoke<JiraIssue>("jira_fetch_issue", { key });
    const link = ticketLinkFromIssue(issue);
    set((state) => {
      const existing = state.linksByPath[path] ?? EMPTY_LINKS;
      const links = [...existing.filter((entry) => entry.key !== link.key), link].sort((a, b) =>
        a.key.localeCompare(b.key),
      );
      const next = withLinks(state, path, links);
      persist(next);
      return { linksByPath: next.linksByPath };
    });
    return link;
  },

  unlinkTicket: (path, key) => {
    set((state) => {
      const links = (state.linksByPath[path] ?? EMPTY_LINKS).filter((entry) => entry.key !== key);
      const next = withLinks(state, path, links);
      persist(next);
      return { linksByPath: next.linksByPath };
    });
  },

  refreshLinks: async (path) => {
    const current = get().linksByPath[path] ?? EMPTY_LINKS;
    if (!current.length || !get().status.configured) return;
    const refreshed = await Promise.all(
      current.map(async (link) => {
        try {
          return ticketLinkFromIssue(await invoke<JiraIssue>("jira_fetch_issue", { key: link.key }));
        } catch {
          // Keep the stale card rather than dropping a ticket on a network blip.
          return link;
        }
      }),
    );
    set((state) => {
      const next = withLinks(state, path, refreshed);
      persist(next);
      return { linksByPath: next.linksByPath };
    });
  },
}));

export function jiraLinksFor(path: string): JiraTicketLink[] {
  return useJiraStore.getState().linksByPath[path] ?? EMPTY_LINKS;
}

/** Snapshot handed to the tool layer when an agent asks what it can call. */
export function jiraToolContextFor(path: string): JiraToolContext {
  const state = useJiraStore.getState();
  return {
    enabled: state.enabled,
    configured: state.status.configured,
    allowSearch: state.allowSearch,
    allowComments: state.allowComments,
    links: state.linksByPath[path] ?? EMPTY_LINKS,
  };
}

export function useJiraLinks(path: string): JiraTicketLink[] {
  return useJiraStore((state) => state.linksByPath[path] ?? EMPTY_LINKS);
}

let pendingStatus: Promise<JiraCredentialStatus> | null = null;

/**
 * Loads the credential status once, lazily. The tool layer needs it before it
 * can decide whether to advertise anything, and it must not depend on a
 * settings screen having been opened first.
 */
export async function ensureJiraStatus(): Promise<void> {
  const state = useJiraStore.getState();
  if (state.statusLoaded) return;
  pendingStatus ??= state.refreshStatus().finally(() => {
    pendingStatus = null;
  });
  await pendingStatus;
}
