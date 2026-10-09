import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  createReviewProgressStore,
  reviewProgressContextKey,
  subscribeReviewProgressCache,
  type ReviewProgressAvailability,
  type ReviewProgressContext,
} from './review-progress';

const context: ReviewProgressContext = {
  hostId: 'host-a', worktreePath: '/repos/agent ', mergeBase: 'abc123',
};
const file = ' selected\\literal*file.txt ';
function available(overrides: Partial<ReviewProgressAvailability> = {}): ReviewProgressAvailability {
  return { ...context, file, fingerprint: 'displayed-v1', online: true, busy: false,
    focused: true, loading: false, fetching: false, error: null, ...overrides };
}
function setup() {
  const store = createReviewProgressStore();
  store.getState().begin(context, 100);
  return store;
}

describe('explicit mobile file review progress', () => {
  it('opening or displaying a file does not mark it reviewed without the user action', () => {
    const store = setup();
    expect(store.getState().marks).toEqual({});
    const displayed = store.getState().display(context, file, 'displayed-v1');
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(true);
    expect(store.getState().marks).toEqual({ [file]: 'displayed-v1' });
  });

  it('missing or empty preview fingerprints never enable a reviewed mark', () => {
    const store = setup();
    expect(store.getState().display(context, file, '')).toBeNull();
    expect(store.getState().mark(null, available())).toBe(false);
    const displayed = store.getState().display(context, file, 'displayed-v1');
    for (const fingerprint of [null, undefined, '']) {
      expect(store.getState().mark(displayed, available({ fingerprint }))).toBe(false);
    }
    expect(store.getState().marks).toEqual({});
  });

  it.each([
    ['preview error', { error: new Error('read failed') }],
    ['initial loading', { loading: true }],
    ['refetching', { fetching: true }],
    ['agent writing', { busy: true }],
    ['host offline', { online: false }],
    ['route closed', { focused: false }],
  ] as const)('blocks an explicit mark during %s', (_, blocked) => {
    const store = setup();
    const displayed = store.getState().display(context, file, 'displayed-v1');
    expect(store.getState().canMark(displayed, available(blocked))).toBe(false);
    expect(store.getState().mark(displayed, available(blocked))).toBe(false);
    expect(store.getState().marks).toEqual({});
  });

  it('rejects a late mark belonging to another host, route, file, base, or payload', () => {
    const store = setup();
    const displayed = store.getState().display(context, file, 'displayed-v1');
    for (const changed of [
      { hostId: 'host-b' }, { worktreePath: '/repos/agent' }, { mergeBase: 'def456' },
      { file: file.trim() }, { file: file.replace('\\', '/') }, { fingerprint: 'newer-v2' },
    ]) {
      expect(store.getState().mark(displayed, available(changed))).toBe(false);
    }
    expect(store.getState().marks).toEqual({});
  });

  it('does not restore old marks or old tickets when switching away and back', () => {
    const store = setup();
    const displayed = store.getState().display(context, file, 'displayed-v1');
    expect(store.getState().mark(displayed, available())).toBe(true);
    store.getState().begin({ ...context, hostId: 'host-b' }, 100);
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
    store.getState().begin(context, 100);
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
  });

  it('clears a reviewed mark when identical line counts have different content tokens', () => {
    const store = setup();
    const displayed = store.getState().display(context, file, 'displayed-v1');
    store.getState().mark(displayed, available());
    store.getState().observeFile(context, file, 'different-bytes-v2');
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
    const latest = store.getState().display(context, file, 'different-bytes-v2');
    expect(store.getState().mark(latest, available({ fingerprint: 'different-bytes-v2' }))).toBe(true);
  });

  it('expires displayed tickets on writes, discard, or disconnect until a new preview is displayed', () => {
    const store = setup();
    const displayed = store.getState().display(context, file, 'displayed-v1');
    store.getState().mark(displayed, available());
    store.getState().invalidate(context);
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
    const fresh = store.getState().display(context, file, 'displayed-v1');
    expect(store.getState().mark(fresh, available())).toBe(true);
  });

  it('binds copied context values and exact unusual filenames without key collisions', () => {
    const store = setup();
    const input = { ...context };
    const displayed = store.getState().display(input, '__proto__', 'displayed-v1');
    input.hostId = 'host-b';
    expect(store.getState().mark(displayed, available({ file: '__proto__' }))).toBe(true);
    expect(Object.hasOwn(store.getState().marks, '__proto__')).toBe(true);
    expect(reviewProgressContextKey(context)).not.toBe(reviewProgressContextKey({ ...context, worktreePath: context.worktreePath.trim() }));
    expect(reviewProgressContextKey({ ...context, worktreePath: '/a\u0000b', mergeBase: 'c' }))
      .not.toBe(reviewProgressContextKey({ ...context, worktreePath: '/a', mergeBase: 'b\u0000c' }));
  });
});

describe('review query cache invalidation', () => {
  it('expires marks on a fresh summary with unchanged counts without fetching every file', () => {
    const client = new QueryClient();
    const store = setup();
    const unsubscribe = subscribeReviewProgressCache(client.getQueryCache(), context, store);
    const displayed = store.getState().display(context, file, 'displayed-v1');
    store.getState().mark(displayed, available());
    const key = [context.hostId, context.worktreePath, 'agent-review', 'summary', '/repos/base'];
    client.setQueryData(key, { additions: 1, deletions: 1 }, { updatedAt: 101 });
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    unsubscribe();
    client.clear();
  });

  it('expires marks immediately on invalidation and ignores other hosts and worktrees', async () => {
    const client = new QueryClient();
    const store = setup();
    const unsubscribe = subscribeReviewProgressCache(client.getQueryCache(), context, store);
    const key = [context.hostId, context.worktreePath, 'agent-review', 'file', context.mergeBase, file];
    client.setQueryData(key, { fingerprint: 'displayed-v1' });
    const displayed = store.getState().display(context, file, 'displayed-v1');
    store.getState().mark(displayed, available());
    client.setQueryData(['host-b', context.worktreePath, 'agent-review', 'summary'], {});
    client.setQueryData([context.hostId, '/other', 'agent-review', 'summary'], {});
    expect(store.getState().marks[file]).toBe('displayed-v1');
    await client.invalidateQueries({ queryKey: key, refetchType: 'none' });
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
    unsubscribe();
    client.clear();
  });

  it('removes marks when the cached current file receives a different token', () => {
    const client = new QueryClient();
    const store = setup();
    const unsubscribe = subscribeReviewProgressCache(client.getQueryCache(), context, store);
    const displayed = store.getState().display(context, file, 'displayed-v1');
    store.getState().mark(displayed, available());
    client.setQueryData([context.hostId, context.worktreePath, 'agent-review', 'file', context.mergeBase, file],
      { fingerprint: 'different-bytes-v2', diff: '+same number of lines\n' });
    expect(store.getState().marks).toEqual({});
    expect(store.getState().mark(displayed, available())).toBe(false);
    unsubscribe();
    client.clear();
  });
});
