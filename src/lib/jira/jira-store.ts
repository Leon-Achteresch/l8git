import { create } from "zustand";

import type { NativeAgentProvider } from "@/lib/agents/provider-store";
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
export const POLICY_VERSION = 2;

/**
 * Tickets are pinned to a single conversation, not to the repository: two
 * chats in the same repo usually work on different tickets, and the whole
 * point of the gate is that an agent only sees what its own chat is about.
 *
 * Keyed by `provider:threadId` because thread ids are only unique per CLI.
 */
export function jiraThreadKey(provider: NativeAgentProvider, threadId: string): string {
  return `${provider}:${threadId}`;
}

export type JiraLinksByThread = Record<string, JiraTicketLink[]>;

export interface JiraPrefs {
  enabled: boolean;
  allowSearch: boolean;
  allowComments: boolean;
  /**
   * Register the stdio MCP server with Codex and Cursor. Both read it from
   * their own config files, so this writes outside l8git — hence its own
   * switch. OpenCode and Claude Code need no registration and ignore it.
   */
  registerExternal: boolean;
  linksByThread: JiraLinksByThread;
  /**
   * The conversation currently open per repository. The out-of-process MCP
   * server is spawned per repository — Codex and Cursor never tell it which
   * chat is asking — so this is how it resolves a repo to the right ticket
   * set. Claude Code answers in-process and uses the thread key directly.
   */
  activeThreadByPath: Record<string, string>;
}

/**
 * Off by default: an integration nobody asked for must not add tool schemas to
 * anybody's context window.
 */
export const DEFAULT_JIRA_PREFS: JiraPrefs = {
  enabled: false,
  allowSearch: false,
  allowComments: true,
  registerExternal: true,
  linksByThread: {},
  activeThreadByPath: {},
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

function sanitizeStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key && typeof entry === "string" && entry) out[key] = entry;
  }
  return out;
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
  const linksByThread: JiraLinksByThread = {};
  // `linksByPath` from the first iteration is deliberately not migrated: a
  // repository-wide pin has no single conversation to belong to, and guessing
  // one would hand an agent a ticket nobody linked to its chat.
  if (typeof value.linksByThread === "object" && value.linksByThread !== null) {
    for (const [key, links] of Object.entries(value.linksByThread as Record<string, unknown>)) {
      if (!key || !Array.isArray(links)) continue;
      const sanitized = links.map(sanitizeLink).filter((link): link is JiraTicketLink => link !== null);
      if (sanitized.length) linksByThread[key] = sanitized;
    }
  }
  return {
    enabled: value.enabled === true,
    allowSearch: value.allowSearch === true,
    allowComments: value.allowComments !== false,
    registerExternal: value.registerExternal !== false,
    linksByThread,
    activeThreadByPath: sanitizeStringMap(value.activeThreadByPath),
  };
}

export function serializeJiraPrefs(prefs: JiraPrefs): string {
  return JSON.stringify(prefs);
}

export interface JiraPolicyPayload {
  version: number;
  enabled: boolean;
  allowSearch: boolean;
  allowComments: boolean;
  activeThreadByPath: Record<string, string>;
  keysByThread: Record<string, string[]>;
}

/**
 * The subset the out-of-process MCP server needs, in its own wire shape. It
 * carries switches, the active conversation per repository and issue keys —
 * never the credential, which the child reads from the OS keychain itself.
 */
export function policyPayload(prefs: JiraPrefs): JiraPolicyPayload {
  const keysByThread: Record<string, string[]> = {};
  for (const [threadKey, links] of Object.entries(prefs.linksByThread)) {
    const keys = links
      .map((link) => normalizeIssueKey(link.key))
      .filter((key): key is string => key !== null);
    if (keys.length) keysByThread[threadKey] = keys;
  }
  return {
    version: POLICY_VERSION,
    enabled: prefs.enabled,
    allowSearch: prefs.allowSearch,
    allowComments: prefs.allowComments,
    activeThreadByPath: prefs.activeThreadByPath,
    keysByThread,
  };
}

export interface JiraState extends JiraPrefs {
  status: JiraCredentialStatus;
  statusLoaded: boolean;
  setEnabled: (enabled: boolean) => void;
  setAllowSearch: (allowSearch: boolean) => void;
  setAllowComments: (allowComments: boolean) => void;
  setRegisterExternal: (registerExternal: boolean) => void;
  refreshStatus: () => Promise<JiraCredentialStatus>;
  saveCredentials: (baseUrl: string, email: string, apiToken: string) => Promise<JiraCredentialStatus>;
  deleteCredentials: () => Promise<void>;
  testConnection: () => Promise<JiraAccount>;
  /** Remembers which conversation a repository is currently showing. */
  setActiveThread: (path: string, threadKey: string | null) => void;
  linkTicket: (threadKey: string, ref: string) => Promise<JiraTicketLink>;
  unlinkTicket: (threadKey: string, key: string) => void;
  refreshLinks: (threadKey: string) => Promise<void>;
}

const EMPTY_STATUS: JiraCredentialStatus = {
  configured: false,
  baseUrl: "",
  email: "",
  tokenHint: "",
};

function persist(prefs: JiraPrefs): void {
  kvSet(JIRA_PREFS_KEY, serializeJiraPrefs(prefs));
  // Mirror the gate to disk so a running out-of-process MCP server picks the
  // change up on its next call instead of at the next session.
  // Wrapped: a platform whose `invoke` is synchronous must not throw here —
  // the policy mirror is best effort, the switch itself already took effect.
  void Promise.resolve(invoke("jira_write_policy", { policy: policyPayload(prefs) })).catch(
    () => undefined,
  );
}

function prefsOf(state: JiraState): JiraPrefs {
  return {
    enabled: state.enabled,
    allowSearch: state.allowSearch,
    allowComments: state.allowComments,
    registerExternal: state.registerExternal,
    linksByThread: state.linksByThread,
    activeThreadByPath: state.activeThreadByPath,
  };
}

function withLinks(state: JiraState, threadKey: string, links: JiraTicketLink[]): JiraPrefs {
  const linksByThread = { ...state.linksByThread };
  if (links.length) linksByThread[threadKey] = links;
  else delete linksByThread[threadKey];
  return { ...prefsOf(state), linksByThread };
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
  setRegisterExternal: (registerExternal) => {
    const next = { ...prefsOf(get()), registerExternal };
    persist(next);
    set({ registerExternal });
  },

  setActiveThread: (path, threadKey) => {
    if (!path) return;
    const current = get().activeThreadByPath;
    if ((current[path] ?? "") === (threadKey ?? "")) return;
    const activeThreadByPath = { ...current };
    if (threadKey) activeThreadByPath[path] = threadKey;
    else delete activeThreadByPath[path];
    const next = { ...prefsOf(get()), activeThreadByPath };
    persist(next);
    set({ activeThreadByPath });
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

  linkTicket: async (threadKey, ref) => {
    const key = normalizeIssueKey(ref);
    if (!key) throw new Error("Ungültiger Ticket-Schlüssel. Erwartet wird die Form ABC-123.");
    if (!threadKey) throw new Error("Es ist keine Unterhaltung ausgewählt.");
    const issue = await invoke<JiraIssue>("jira_fetch_issue", { key });
    const link = ticketLinkFromIssue(issue);
    set((state) => {
      const existing = state.linksByThread[threadKey] ?? EMPTY_LINKS;
      const links = [...existing.filter((entry) => entry.key !== link.key), link].sort((a, b) =>
        a.key.localeCompare(b.key),
      );
      const next = withLinks(state, threadKey, links);
      persist(next);
      return { linksByThread: next.linksByThread };
    });
    return link;
  },

  unlinkTicket: (threadKey, key) => {
    set((state) => {
      const links = (state.linksByThread[threadKey] ?? EMPTY_LINKS).filter(
        (entry) => entry.key !== key,
      );
      const next = withLinks(state, threadKey, links);
      persist(next);
      return { linksByThread: next.linksByThread };
    });
  },

  refreshLinks: async (threadKey) => {
    const current = get().linksByThread[threadKey] ?? EMPTY_LINKS;
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
      const next = withLinks(state, threadKey, refreshed);
      persist(next);
      return { linksByThread: next.linksByThread };
    });
  },
}));

export function jiraLinksFor(threadKey: string): JiraTicketLink[] {
  return useJiraStore.getState().linksByThread[threadKey] ?? EMPTY_LINKS;
}

/** Snapshot handed to the tool layer when an agent asks what it can call. */
export function jiraToolContextFor(threadKey: string): JiraToolContext {
  const state = useJiraStore.getState();
  return {
    enabled: state.enabled,
    configured: state.status.configured,
    allowSearch: state.allowSearch,
    allowComments: state.allowComments,
    links: state.linksByThread[threadKey] ?? EMPTY_LINKS,
  };
}

export function useJiraLinks(threadKey: string): JiraTicketLink[] {
  return useJiraStore((state) => state.linksByThread[threadKey] ?? EMPTY_LINKS);
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
