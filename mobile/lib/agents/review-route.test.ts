import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ useGlobalSearchParams: vi.fn(), useLocalSearchParams: vi.fn() }));
vi.mock('~/lib/connections', () => ({ getClient: vi.fn(), useConnections: vi.fn(), useHostMeta: vi.fn(), useOnlineHostIds: vi.fn() }));
vi.mock('~/lib/repo/registry', () => ({ useRepoRegistry: vi.fn() }));
vi.mock('./stores', () => ({ AGENT_PROVIDERS: [], tryChatStore: vi.fn(), useChatStore: vi.fn() }));

import { decodeRouteValue } from '~/lib/repo/route';
import { agentReviewFileHref, agentReviewHref } from './review';

describe('review navigation preserves exact remote path names', () => {
  for (const name of ['literal%20name', 'literal name', 'literal%2Fname', 'literal/name', 'back\\slash', 'trailing ', 'trailing\n']) {
    it(`round-trips ${JSON.stringify(name)} in worktree and file routes`, () => {
      const worktreePath = `/repos/${name}`;
      const review = agentReviewHref('host-a', worktreePath) as { params: Record<string, string> };
      const file = agentReviewFileHref('host-a', worktreePath, 'a'.repeat(40), name) as { params: Record<string, string> };
      expect(review.params.path).toBe(worktreePath);
      expect(file.params.file).toBe(name);
      for (const href of [review, file]) {
        const decoded = new URLSearchParams(new URLSearchParams(href.params).toString());
        expect(decodeRouteValue(decoded.get('path')!)).toBe(worktreePath);
        if (decoded.has('file')) expect(decodeRouteValue(decoded.get('file')!)).toBe(name);
      }
    });
  }
});
