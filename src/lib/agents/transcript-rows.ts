import { hasImageContent, isRecord, redactSecrets } from "@/lib/agents/plugins/content";
import type { AgentItem, AgentTurn } from "@/lib/agents/types";

export type TranscriptRow =
  | { kind: "item"; key: string; turn: AgentTurn; item: AgentItem }
  | { kind: "error"; key: string; turn: AgentTurn; error: string };

export function flattenTurnRows(turns: AgentTurn[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  for (const turn of turns) {
    for (const item of turn.items) {
      rows.push({ kind: "item", key: `${turn.id}:${item.id}`, turn, item });
    }
    if (turn.status === "failed" && turn.error) {
      rows.push({ kind: "error", key: `${turn.id}:error`, turn, error: turn.error });
    }
  }
  return rows;
}

export type ToolResultLabel = {
  label: string;
  detail: string;
};

export function toolResultLabel(item: AgentItem): ToolResultLabel | null {
  if (item.type === "readTool") {
    return { label: "Lesen", detail: String(item.path ?? "") };
  }
  if (item.type === "searchTool") {
    const tool = item.tool === "Glob" ? "Datei-Suche" : "Textsuche";
    return { label: tool, detail: String(item.pattern ?? "") };
  }
  if (item.type === "webFetch") {
    return { label: "URL abrufen", detail: String(item.url ?? "") };
  }
  if (item.type === "webSearch") {
    return { label: "Web-Suche", detail: String(item.query ?? "") };
  }
  if (item.type === "commandExecution") {
    return { label: "Befehl", detail: String(item.command ?? "") };
  }
  return null;
}

export function shouldShowImagePreview(item: AgentItem): boolean {
  if (hasImageContent(item.result)) return true;
  if (item.type !== "readTool") return false;
  const path = String(item.path ?? "");
  if (!/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)) return false;
  return hasImageContent(item.result) || (isRecord(item.result) && (item.result as { type?: unknown }).type === "image");
}

export function exportableItemText(item: AgentItem): string | null {
  if (item.type === "reasoning") {
    if (item.redacted === true) return null;
    const summary = Array.isArray(item.summary) ? item.summary.join("\n") : "";
    const content = Array.isArray(item.content) ? item.content.join("") : "";
    return [summary, content].filter(Boolean).join("\n") || null;
  }
  if (item.type === "agentMessage") {
    return typeof item.text === "string" ? item.text : null;
  }
  return null;
}

export function exportableToolArguments(item: AgentItem): Record<string, unknown> | null {
  return isRecord(item.arguments) ? redactSecrets(item.arguments) : null;
}
