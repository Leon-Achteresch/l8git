/**
 * Jira tool surface for the in-process MCP server that l8git exposes to the
 * agent CLI (see `agent_transport.rs`, `--mcp-config … "type":"sdk"`).
 *
 * **The tool list is frozen for the lifetime of a session.** The CLI asks
 * `tools/list` once, right after it connects, and this channel gives the
 * server no way to push `notifications/tools/list_changed` back. So the list
 * may only depend on state that cannot change while a chat is open —
 * otherwise linking a ticket to a chat that is already running would never
 * reach the agent, which is exactly the bug this shape avoids.
 *
 * That splits the gate in two:
 *
 *  * **Listed** when the feature is on and credentials exist — plus the two
 *    capability switches, which live in the settings and change rarely. An
 *    unconfigured Jira still costs zero tokens.
 *  * **Reachable** is decided per call against the live link set, in
 *    `resolveIssueKeyArg`. That is the boundary that actually holds; the
 *    schema is only a hint to the model.
 *
 * For the same reason the `key` schema is a pattern rather than an `enum` of
 * the linked keys: an enum would bake in whatever was linked at connect time
 * and silently contradict the check below it.
 */

import { normalizeIssueKey } from "@/lib/jira/issue-key";
import type { JiraTicketLink } from "@/lib/jira/types";

export const JIRA_GET_ISSUE = "jira_get_issue";
export const JIRA_GET_COMMENTS = "jira_get_comments";
export const JIRA_SEARCH_ISSUES = "jira_search_issues";

export const JIRA_TOOL_NAMES = [JIRA_GET_ISSUE, JIRA_GET_COMMENTS, JIRA_SEARCH_ISSUES] as const;
export type JiraToolName = (typeof JIRA_TOOL_NAMES)[number];

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

/**
 * Never an `enum` of the linked keys: the schema outlives every change to that
 * set, so freezing it in would contradict the call-time check.
 */
function keySchema(): Record<string, unknown> {
  return {
    type: "string",
    pattern: "^[A-Za-z][A-Za-z0-9_]{0,49}-[0-9]{1,10}$",
    description:
      "Ticket-Schlüssel wie ABC-123. Ohne freigeschaltete Suche sind nur die mit dieser Unterhaltung verknüpften Tickets lesbar; das Tool nennt sie, wenn der Schlüssel nicht passt.",
  };
}

/**
 * The tools this session may see. Empty while Jira is off or unconfigured, so
 * an unused integration costs zero tokens — and stable for the whole session,
 * so a ticket linked later still works.
 */
export function jiraToolsFor(context: JiraToolContext): JiraToolDefinition[] {
  if (!context.enabled || !context.configured) return [];

  const tools: JiraToolDefinition[] = [
    {
      name: JIRA_GET_ISSUE,
      description:
        "Liest ein Jira-Ticket (Titel, Status, Typ, Priorität, Zuweisung, Labels, Beschreibung). Nur lesend. Lesbar sind die Tickets, die der Nutzer mit dieser Unterhaltung verknüpft hat.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["key"],
        properties: { key: keySchema() },
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
          key: keySchema(),
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
  if (keys.length === 0) {
    return {
      ok: false,
      error:
        "Jira: Mit dieser Unterhaltung ist kein Ticket verknüpft. Bitte den Nutzer, in der Seitenleiste per Rechtsklick auf diesen Chat ein Jira-Ticket zu verknüpfen — danach ist es sofort lesbar, ohne neuen Chat.",
    };
  }
  if (!keys.includes(key)) {
    return {
      ok: false,
      error:
        `Jira: ${key} ist mit dieser Unterhaltung nicht verknüpft. Verknüpft sind: ${keys.join(", ")}. ` +
        "Der Nutzer kann das Ticket am Chat verknüpfen oder die JQL-Suche in den Einstellungen freischalten.",
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
