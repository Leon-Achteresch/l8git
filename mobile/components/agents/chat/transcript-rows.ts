import type {
  AgentConversation,
  AgentItem,
  AgentPendingRequest,
  AgentTurn,
} from '@desktop/lib/agents/types';

import { requestKey } from '~/components/agents/approval-card/request-model';

export type TranscriptRow =
  | { kind: 'item'; key: string; turn: AgentTurn; item: AgentItem }
  | { kind: 'turn-error'; key: string; turn: AgentTurn; message: string }
  | { kind: 'working'; key: string }
  | { kind: 'request'; key: string; request: AgentPendingRequest };

export function transcriptRows(
  conversation: AgentConversation | undefined,
  requests: readonly AgentPendingRequest[],
  visibleTurns: number
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const turns = conversation?.turns ?? [];
  const scoped = turns.length > visibleTurns ? turns.slice(-visibleTurns) : turns;

  for (const turn of scoped) {
    for (const item of turn.items) {
      rows.push({ kind: 'item', key: `${turn.id}:${item.id}`, turn, item });
    }
    if (turn.status === 'failed' && turn.error) {
      rows.push({ kind: 'turn-error', key: `${turn.id}:error`, turn, message: turn.error });
    }
  }

  const active = conversation?.activeTurnId
    ? scoped.find((turn) => turn.id === conversation.activeTurnId)
    : undefined;
  if (conversation?.activeTurnId && (!active || active.items.length === 0)) {
    rows.push({ kind: 'working', key: `${conversation.activeTurnId}:working` });
  }

  for (const request of requests) {
    rows.push({ kind: 'request', key: `request:${requestKey(request)}`, request });
  }

  return rows;
}

export function hiddenTurnCount(
  conversation: AgentConversation | undefined,
  visibleTurns: number
): number {
  return Math.max(0, (conversation?.turns.length ?? 0) - visibleTurns);
}
