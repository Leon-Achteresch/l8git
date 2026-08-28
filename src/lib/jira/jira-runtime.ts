/**
 * Executes the Jira tool calls an agent makes. Every path here is read-only:
 * the three Tauri commands it can reach only ever issue HTTP GET.
 *
 * Results are rendered as compact text rather than JSON — an agent reads it
 * just as well and it costs noticeably fewer tokens than a pretty-printed
 * object graph.
 */

import { invoke } from "@/lib/platform/ipc";
import {
  JIRA_GET_COMMENTS,
  JIRA_GET_ISSUE,
  JIRA_SEARCH_ISSUES,
  isJiraToolName,
  resolveIssueKeyArg,
  resolveJqlArg,
  resolveLimitArg,
  type JiraToolContext,
} from "@/lib/jira/jira-tools";
import type { JiraComment, JiraIssue, JiraSearchResult } from "@/lib/jira/types";

export const DEFAULT_COMMENT_LIMIT = 10;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_LIMIT = 25;

export interface JiraToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function textResult(text: string, isError = false): JiraToolResult {
  return isError ? { content: [{ type: "text", text }], isError: true } : { content: [{ type: "text", text }] };
}

function line(label: string, value: string | string[]): string | null {
  const text = Array.isArray(value) ? value.join(", ") : value;
  return text ? `${label}: ${text}` : null;
}

export function formatIssue(issue: JiraIssue): string {
  const head = [
    `${issue.key}: ${issue.summary || "(ohne Titel)"}`,
    line("Status", issue.status),
    line("Typ", issue.issueType),
    line("Priorität", issue.priority),
    line("Zuweisung", issue.assignee),
    line("Melder", issue.reporter),
    line("Resolution", issue.resolution),
    line("Labels", issue.labels),
    line("Komponenten", issue.components),
    line("Fix-Versionen", issue.fixVersions),
    line("Parent", issue.parent),
    line("Subtasks", issue.subtasks),
    line("Fällig", issue.dueDate),
    line("Aktualisiert", issue.updated),
    line("URL", issue.url),
  ].filter((entry): entry is string => Boolean(entry));
  if (issue.description) {
    head.push("", "Beschreibung:", issue.description);
    if (issue.truncated) head.push("(Beschreibung gekürzt)");
  }
  return head.join("\n");
}

export function formatComments(key: string, comments: JiraComment[]): string {
  if (comments.length === 0) return `${key}: keine Kommentare.`;
  return [
    `${key} — ${comments.length} Kommentar(e), neueste zuerst:`,
    ...comments.map((comment) =>
      [
        `— ${comment.author || "Unbekannt"} (${comment.created || "?"})`,
        comment.body || "(leer)",
        comment.truncated ? "(gekürzt)" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

export function formatSearch(result: JiraSearchResult): string {
  if (result.issues.length === 0) return "Keine Treffer.";
  const rows = result.issues.map((issue) =>
    [
      issue.key,
      issue.summary || "(ohne Titel)",
      issue.status,
      issue.assignee,
    ]
      .filter(Boolean)
      .join(" | "),
  );
  const footer =
    result.truncated || result.total > result.issues.length
      ? `\n(${result.issues.length} von ${result.total} gezeigt — JQL verfeinern)`
      : "";
  return `Treffer (Key | Titel | Status | Zuweisung):\n${rows.join("\n")}${footer}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Dispatches one tool call. Returns an `isError` result rather than throwing,
 * so a misconfigured Jira never aborts the agent's turn.
 */
export async function callJiraTool(
  name: string,
  args: Record<string, unknown>,
  context: JiraToolContext,
): Promise<JiraToolResult> {
  if (!isJiraToolName(name)) return textResult(`Jira: Unbekanntes Tool "${name}".`, true);
  if (!context.enabled) return textResult("Jira: Die Integration ist deaktiviert.", true);
  if (!context.configured) {
    return textResult("Jira: Es sind keine Zugangsdaten hinterlegt (Einstellungen → Jira).", true);
  }
  if (name === JIRA_GET_COMMENTS && !context.allowComments) {
    return textResult("Jira: Das Lesen von Kommentaren ist deaktiviert.", true);
  }

  try {
    if (name === JIRA_GET_ISSUE) {
      const key = resolveIssueKeyArg(context, args.key);
      if (!key.ok) return textResult(key.error, true);
      const issue = await invoke<JiraIssue>("jira_fetch_issue", { key: key.value });
      return textResult(formatIssue(issue));
    }
    if (name === JIRA_GET_COMMENTS) {
      const key = resolveIssueKeyArg(context, args.key);
      if (!key.ok) return textResult(key.error, true);
      const limit = resolveLimitArg(args.limit, DEFAULT_COMMENT_LIMIT, MAX_LIMIT);
      const comments = await invoke<JiraComment[]>("jira_fetch_comments", { key: key.value, limit });
      return textResult(formatComments(key.value, comments));
    }
    if (name === JIRA_SEARCH_ISSUES) {
      const jql = resolveJqlArg(context, args.jql);
      if (!jql.ok) return textResult(jql.error, true);
      const limit = resolveLimitArg(args.limit, DEFAULT_SEARCH_LIMIT, MAX_LIMIT);
      const result = await invoke<JiraSearchResult>("jira_search_issues", { jql: jql.value, limit });
      return textResult(formatSearch(result));
    }
    return textResult(`Jira: Unbekanntes Tool "${name}".`, true);
  } catch (error) {
    return textResult(errorText(error), true);
  }
}
