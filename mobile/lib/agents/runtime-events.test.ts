import { describe, expect, it } from 'vitest';

import { AGENT_EVENT_SCHEMA_VERSION } from '@desktop/lib/agents/types';

import { acceptRuntimeEvent } from './runtime-events';

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    eventId: 'evt-1',
    sequence: 1,
    driver: 'codex',
    instance: 'instance-1',
    threadId: 'thread-1',
    nativeSessionId: 'native-1',
    type: 'text',
    text: 'hello',
    ...overrides,
  };
}

describe('acceptRuntimeEvent', () => {
  it('accepts a known event type at the current schema version', () => {
    const event = acceptRuntimeEvent(baseEvent());
    expect(event).not.toBeNull();
    expect(event?.type).toBe('text');
  });

  it('ignores an unknown event type with a warning instead of throwing', () => {
    const warnings: unknown[] = [];
    const event = acceptRuntimeEvent(baseEvent({ type: 'somethingNew' }), (warning) =>
      warnings.push(warning)
    );
    expect(event).toBeNull();
    expect(warnings).toEqual([
      { reason: 'unknownType', eventType: 'somethingNew', schemaVersion: AGENT_EVENT_SCHEMA_VERSION },
    ]);
  });

  it('rejects a mismatched schema version with a warning', () => {
    const warnings: unknown[] = [];
    const event = acceptRuntimeEvent(baseEvent({ schemaVersion: 99 }), (warning) =>
      warnings.push(warning)
    );
    expect(event).toBeNull();
    expect(warnings).toEqual([{ reason: 'unsupportedSchema', eventType: 'text', schemaVersion: 99 }]);
  });
});
