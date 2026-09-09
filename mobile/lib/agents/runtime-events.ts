import {
  AGENT_EVENT_SCHEMA_VERSION,
  type AgentRuntimeEvent,
} from '@desktop/lib/agents/types';

const KNOWN_EVENT_TYPES: ReadonlySet<AgentRuntimeEvent['type']> = new Set([
  'session',
  'turn',
  'text',
  'tool',
  'task',
  'approval',
  'usage',
  'error',
]);

export interface RuntimeEventWarning {
  reason: 'unknownType' | 'unsupportedSchema';
  eventType: unknown;
  schemaVersion: unknown;
}

export function acceptRuntimeEvent(
  event: unknown,
  onWarn?: (warning: RuntimeEventWarning) => void
): AgentRuntimeEvent | null {
  if (typeof event !== 'object' || event === null) {
    onWarn?.({ reason: 'unknownType', eventType: undefined, schemaVersion: undefined });
    return null;
  }
  const candidate = event as { type?: unknown; schemaVersion?: unknown };
  if (candidate.schemaVersion !== AGENT_EVENT_SCHEMA_VERSION) {
    onWarn?.({
      reason: 'unsupportedSchema',
      eventType: candidate.type,
      schemaVersion: candidate.schemaVersion,
    });
    return null;
  }
  if (!KNOWN_EVENT_TYPES.has(candidate.type as AgentRuntimeEvent['type'])) {
    onWarn?.({
      reason: 'unknownType',
      eventType: candidate.type,
      schemaVersion: candidate.schemaVersion,
    });
    return null;
  }
  return event as AgentRuntimeEvent;
}
