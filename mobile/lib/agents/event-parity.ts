import type { AgentRuntimeEvent } from '@desktop/lib/agents/types';

export type MobileCapability =
  | 'send'
  | 'steer'
  | 'stop'
  | 'attachments'
  | 'questions'
  | 'planApproval'
  | 'tools'
  | 'subagents'
  | 'usage'
  | 'history'
  | 'rateLimit';

export interface EventParityRow {
  eventType: AgentRuntimeEvent['type'];
  capabilities: readonly MobileCapability[];
}

export const EVENT_PARITY_MATRIX: readonly EventParityRow[] = [
  { eventType: 'session', capabilities: ['history'] },
  { eventType: 'turn', capabilities: ['send', 'steer', 'stop', 'history'] },
  { eventType: 'text', capabilities: ['send', 'attachments', 'history'] },
  { eventType: 'tool', capabilities: ['tools', 'subagents', 'history'] },
  { eventType: 'task', capabilities: ['subagents', 'planApproval', 'history'] },
  { eventType: 'approval', capabilities: ['questions', 'planApproval'] },
  { eventType: 'usage', capabilities: ['usage', 'rateLimit'] },
  { eventType: 'error', capabilities: ['rateLimit', 'history'] },
] as const;

export function capabilitiesForEvent(
  eventType: AgentRuntimeEvent['type'],
): readonly MobileCapability[] {
  return EVENT_PARITY_MATRIX.find((row) => row.eventType === eventType)?.capabilities ?? [];
}

export function eventTypesCoveringCapability(
  capability: MobileCapability,
): readonly AgentRuntimeEvent['type'][] {
  return EVENT_PARITY_MATRIX.filter((row) => row.capabilities.includes(capability)).map(
    (row) => row.eventType,
  );
}
