import { describe, expect, it } from 'vitest';

import type {
  AgentConversation,
  AgentPendingRequest,
  AgentTurn,
} from '@desktop/lib/agents/types';

import { hiddenTurnCount, transcriptRows } from './transcript-rows';

function turn(id: string, itemIds: string[], status: AgentTurn['status'] = 'completed'): AgentTurn {
  return {
    id,
    status,
    items: itemIds.map((itemId) => ({ id: itemId, type: 'agentMessage', text: itemId })),
    error: null,
  };
}

function conversation(turns: AgentTurn[], activeTurnId: string | null = null): AgentConversation {
  return {
    threadId: 'thread-1',
    path: '/repo',
    title: 'Conversation',
    model: 'gpt-5',
    reasoningEffort: 'medium',
    approvalPolicy: 'on-request',
    sandboxMode: 'workspace-write',
    turns,
    activeTurnId,
    loading: false,
    error: null,
  };
}

function request(id: string): AgentPendingRequest {
  return {
    sessionId: 'session-1',
    requestId: id,
    method: 'item/commandExecution/requestApproval',
    kind: 'command',
    threadId: 'thread-1',
    raw: {},
  };
}

describe('transcriptRows', () => {
  it('flattens turns into item rows in order', () => {
    const rows = transcriptRows(conversation([turn('t1', ['a', 'b']), turn('t2', ['c'])]), [], 24);
    expect(rows.map((row) => row.key)).toEqual(['t1:a', 't1:b', 't2:c']);
  });

  it('appends a failure row for failed turns that carry an error', () => {
    const failed: AgentTurn = { ...turn('t1', ['a'], 'failed'), error: 'boom' };
    const rows = transcriptRows(conversation([failed]), [], 24);
    expect(rows[1]).toMatchObject({ kind: 'turn-error', message: 'boom' });
  });

  it('adds a working placeholder while an empty turn is in progress', () => {
    const running: AgentTurn = turn('t2', [], 'inProgress');
    const rows = transcriptRows(conversation([turn('t1', ['a']), running], 't2'), [], 24);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'working' });
  });

  it('omits the working placeholder once the active turn has items', () => {
    const running: AgentTurn = turn('t2', ['b'], 'inProgress');
    const rows = transcriptRows(conversation([running], 't2'), [], 24);
    expect(rows.some((row) => row.kind === 'working')).toBe(false);
  });

  it('places pending approvals last and keys them uniquely', () => {
    const rows = transcriptRows(conversation([turn('t1', ['a'])]), [request('1'), request('2')], 24);
    const tail = rows.slice(-2);
    expect(tail.every((row) => row.kind === 'request')).toBe(true);
    expect(new Set(tail.map((row) => row.key)).size).toBe(2);
  });

  it('windows to the newest turns and reports how many are hidden', () => {
    const turns = Array.from({ length: 6 }, (_, index) => turn(`t${index}`, [`i${index}`]));
    const rows = transcriptRows(conversation(turns), [], 2);
    expect(rows.map((row) => row.key)).toEqual(['t4:i4', 't5:i5']);
    expect(hiddenTurnCount(conversation(turns), 2)).toBe(4);
  });

  it('returns no rows without a conversation', () => {
    expect(transcriptRows(undefined, [], 24)).toEqual([]);
    expect(hiddenTurnCount(undefined, 24)).toBe(0);
  });
});
