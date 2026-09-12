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

export function buildTranscriptRowsMemo(turns: AgentTurn[], cache: Map<string, TranscriptRow>): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const seen = new Set<string>();

  const emit = (key: string, build: () => TranscriptRow, matches: (row: TranscriptRow) => boolean) => {
    const cached = cache.get(key);
    const row = cached && matches(cached) ? cached : build();
    if (row !== cached) cache.set(key, row);
    seen.add(key);
    rows.push(row);
  };

  for (const turn of turns) {
    for (const item of turn.items) {
      const key = `${turn.id}:${item.id}`;
      emit(
        key,
        () => ({ kind: "item", key, turn, item }),
        (row) => row.kind === "item" && row.turn.id === turn.id && row.item === item,
      );
    }
    if (turn.status === "failed" && turn.error) {
      const key = `${turn.id}:error`;
      const error = turn.error;
      emit(
        key,
        () => ({ kind: "error", key, turn, error }),
        (row) => row.kind === "error" && row.turn.id === turn.id && row.error === error,
      );
    }
  }

  for (const key of cache.keys()) {
    if (!seen.has(key)) cache.delete(key);
  }

  return rows;
}

export interface StreamDelta {
  id: string;
  text: string;
  t: number;
  final?: boolean;
}

export interface BatchStreamOptions {
  maxBatchMs: number;
  maxChars: number;
}

export function batchStreamDeltas(deltas: StreamDelta[], options: BatchStreamOptions): StreamDelta[][] {
  const batches: StreamDelta[][] = [];
  let current: StreamDelta[] = [];
  let batchStartT = 0;
  let currentChars = 0;

  const flush = () => {
    if (current.length > 0) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
  };

  for (const delta of deltas) {
    if (delta.final) {
      flush();
      batches.push([delta]);
      continue;
    }
    if (current.length === 0) {
      batchStartT = delta.t;
    }
    const exceedsTime = delta.t - batchStartT > options.maxBatchMs;
    const exceedsChars = currentChars + delta.text.length > options.maxChars;
    if (exceedsTime || exceedsChars) {
      flush();
      batchStartT = delta.t;
    }
    current.push(delta);
    currentChars += delta.text.length;
  }
  flush();

  return batches;
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
