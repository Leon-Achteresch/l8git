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
