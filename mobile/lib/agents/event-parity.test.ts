import { describe, expect, it } from 'vitest';

import {
  EVENT_PARITY_MATRIX,
  capabilitiesForEvent,
  eventTypesCoveringCapability,
} from './event-parity';

const CANONICAL_EVENT_TYPES = [
  'session',
  'turn',
  'text',
  'tool',
  'task',
  'approval',
  'usage',
  'error',
] as const;

describe('EVENT_PARITY_MATRIX', () => {
  it('covers every canonical runtime event type exactly once', () => {
    const covered = EVENT_PARITY_MATRIX.map((row) => row.eventType).sort();
    expect(covered).toEqual([...CANONICAL_EVENT_TYPES].sort());
  });

  it('maps approvals to the questions and plan-approval capabilities', () => {
    expect(capabilitiesForEvent('approval')).toEqual(
      expect.arrayContaining(['questions', 'planApproval']),
    );
  });

  it('maps usage and error events to rate-limit visibility', () => {
    expect(eventTypesCoveringCapability('rateLimit')).toEqual(
      expect.arrayContaining(['usage', 'error']),
    );
  });

  it('every event type maps to at least one mobile capability', () => {
    for (const row of EVENT_PARITY_MATRIX) {
      expect(row.capabilities.length).toBeGreaterThan(0);
    }
  });
});
