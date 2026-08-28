/**
 * Jira tool surface for the in-process MCP server that l8git exposes to the
 * agent CLI (see `agent_transport.rs`, `--mcp-config … "type":"sdk"`).
 *
 * Every tool schema is paid for in input tokens on *every* turn of *every*
 * thread, so the surface is assembled per call rather than declared once:
 *
 *  * feature off, or no credentials  → no tools at all
 *  * no linked ticket and no search  → no tools at all (nothing to look at)
 *  * linked tickets, search off      → `key` is an enum of exactly the linked
 *                                      keys, so the schema stays tiny and
 *                                      doubles as an allow-list
 *  * search on                       → `key` becomes a free string and
 *                                      `jira_search_issues` is added
 *
 * `resolveIssueKeyArg` re-checks the key at call time. The schema is a hint to
 * the model; the check is what actually holds.
 */

import { normalizeIssueKey } from "@/lib/jira/issue-key";
import type { JiraTicketLink } from "@/lib/jira/types";

export const JIRA_GET_ISSUE = "jira_get_issue";
export const JIRA_GET_COMMENTS = "jira_get_comments";
export const JIRA_SEARCH_ISSUES = "jira_search_issues";

export const JIRA_TOOL_NAMES = [JIRA_GET_ISSUE, JIRA_GET_COMMENTS, JIRA_SEARCH_ISSUES] as const;
export type JiraToolName = (typeof JIRA_TOOL_NAMES)[number];

/** How many linked keys still fit into an `enum` before it costs more than it saves. */
const MAX_ENUM_KEYS = 20;

export interface JiraToolContext {
  /** Master switch from the settings page. */
  enabled: boolean;
  /** Whether credentials are stored in the OS keychain. */
  configured: boolean;
  /** Allow free JQL search beyond the linked tickets. */
  allowSearch: boolean;
  /** Allow reading the comment thread of a ticket. */
  allowComments: boolean;
  /** Tickets the user pinned to the active repository. */
  links: JiraTicketLink[];
}

export interface JiraToolDefinition {
  name: JiraToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function isJiraToolName(name: string): name is JiraToolName {
  return (JIRA_TOOL_NAMES as readonly string[]).includes(name);
}

export function linkedKeys(context: JiraToolContext): string[] {
  const seen = new Set<string>();
  for (const link of context.links) {
    const key = normalizeIssueKey(link.key);
    if (key) seen.add(key);
  }
  return [...seen];
}

/** True when the agent may look at *any* ticket instead of only the linked ones. */
export function allowsArbitraryKeys(context: JiraToolContext): boolean {
  return context.allowSearch;
}

function ticketRoster(context: JiraToolContext): string {
  const roster = context.links
    .slice(0, MAX_ENUM_KEYS)
    .map((link) => (link.summary ? `${link.key} (${link.summary})` : link.key))
    .join("; ");
  return roster ? ` Verknüpfte Tickets: ${roster}.` : "";
}

function keySchema(context: JiraToolContext, keys: string[]): Record<string, unknown> {
  if (!allowsArbitraryKeys(context) && keys.length > 0 && keys.length <= MAX_ENUM_KEYS) {
    return { type: "string", enum: keys, description: "Schlüssel eines verknüpften Tickets." };
  }
  return {
    type: "string",
    pattern: "^[A-Za-z][A-Za-z0-9_]{0,49}-[0-9]{1,10}$",
    description: "Ticket-Schlüssel wie ABC-123.",
  };
}

/**
 * The tools the agent should see right now. Returns `[]` whenever Jira cannot
 * possibly help, so an unused integration costs zero tokens.
 */
export function jiraToolsFor(context: JiraToolContext): JiraToolDefinition[] {
  if (!context.enabled || !context.configured) return [];
  const keys = linkedKeys(context);
  if (keys.length === 0 && !context.allowSearch) return [];

  const tools: JiraToolDefinition[] = [
    {
      name: JIRA_GET_ISSUE,
      description:
        `Liest ein Jira-Ticket (Titel, Status, Typ, Priorität, Zuweisung, Labels, Beschreibung). Nur lesend.${ticketRoster(context)}`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["key"],
        properties: { key: keySchema(context, keys) },
      },
    },
  ];

  if (context.allowComments) {
    tools.push({
      name: JIRA_GET_COMMENTS,
      description:
        "Liest die neuesten Kommentare eines Jira-Tickets. Nur nutzen, wenn die Ticket-Beschreibung die Frage nicht beantwortet.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["key"],
        properties: {
          key: keySchema(context, keys),
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Anzahl Kommentare (Standard 10)." },
        },
      },
    });
  }

  if (context.allowSearch) {
    tools.push({
      name: JIRA_SEARCH_ISSUES,
      description:
        "Sucht Jira-Tickets per JQL und liefert eine kompakte Trefferliste ohne Beschreibungen. Nur lesend.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["jql"],
        properties: {
          jql: { type: "string", maxLength: 2000, description: 'JQL, z. B. project = ABC AND status = "In Progress".' },
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Anzahl Treffer (Standard 10)." },
        },
      },
    });
  }

  return tools;
}

export type JiraArgCheck<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validates the key an agent asked for. Without search permission the key must
 * be one the user actually linked — the model cannot widen its own access by
 * ignoring the schema.
 */
export function resolveIssueKeyArg(context: JiraToolContext, raw: unknown): JiraArgCheck<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "Jira: Es fehlt der Parameter \"key\"." };
  }
  const key = normalizeIssueKey(raw);
  if (!key) {
    return { ok: false, error: "Jira: Ungültiger Ticket-Schlüssel. Erwartet wird die Form ABC-123." };
  }
  if (allowsArbitraryKeys(context)) return { ok: true, value: key };
  const keys = linkedKeys(context);
  if (!keys.includes(key)) {
    return {
      ok: false,
      error:
        `Jira: ${key} ist mit diesem Repository nicht verknüpft. Verfügbar: ${keys.join(", ") || "keine"}. ` +
        "Der Nutzer kann das Ticket im Agents-Fenster verknüpfen oder die JQL-Suche in den Einstellungen freischalten.",
    };
  }
  return { ok: true, value: key };
}

export function resolveJqlArg(context: JiraToolContext, raw: unknown): JiraArgCheck<string> {
  if (!context.allowSearch) {
    return { ok: false, error: "Jira: Die JQL-Suche ist deaktiviert." };
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Jira: Es fehlt der Parameter \"jql\"." };
  }
  if (raw.length > 2000) {
    return { ok: false, error: "Jira: Die JQL-Abfrage ist zu lang." };
  }
  return { ok: true, value: raw.trim() };
}

export function resolveLimitArg(raw: unknown, fallback: number, max: number): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  return Math.min(Math.max(value, 1), max);
}
