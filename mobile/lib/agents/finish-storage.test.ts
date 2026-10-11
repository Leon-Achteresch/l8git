import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentReviewFinishSnapshot, AgentReviewInvoke } from '@desktop/lib/agents/agent-review';
import type { PlatformIpc } from '@desktop/lib/platform';

import type { MobileFinishContext } from './finish-storage';

const context: MobileFinishContext = {
  hostId: 'host-a', basePath: '/repos/app', worktreePath: '/repos/app/agent',
  baseBranch: 'main', sessionBranch: 'agents/task', worktreeCreatedAt: 100,
};
const backing = new Map<string, string>();
let failWrites = false;
let helpers: typeof import('./finish-storage');
let review: typeof import('@desktop/lib/agents/agent-review');
let kv: typeof import('@desktop/lib/platform/kv');

function checkpoint(overrides: Partial<AgentReviewFinishSnapshot> = {}): AgentReviewFinishSnapshot {
  return {
    steps: [
      { id: 'commit', status: 'done', error: null },
      { id: 'merge', status: 'done', error: null },
      { id: 'cleanup', status: 'failed', error: 'Branch deletion interrupted.' },
    ],
    summary: null, sessionHead: 'b'.repeat(40), reviewedSignature: 'old-confirmation',
    worktreeRemoved: true, worktreeMetadataRemoved: true, branchDeleted: false,
    strategy: 'ff', checking: false, validated: true, checkError: null, message: 'Reviewed task',
    ...overrides,
  };
}

function seed(savedContext: MobileFinishContext, saved = checkpoint()) {
  const manifest = helpers.mobileFinishContextIndexKey(savedContext.hostId);
  const previous = JSON.parse(backing.get(manifest) ?? '{"version":1,"contexts":[]}');
  backing.set(manifest, JSON.stringify({ version: 1, contexts: [...previous.contexts, savedContext] }));
  backing.set(review.agentReviewFinishStorageKey(savedContext), JSON.stringify(saved));
  backing.set(review.agentReviewFinishContextIndexKey(savedContext.worktreePath, savedContext.basePath, savedContext.hostId), JSON.stringify(savedContext));
}

beforeEach(async () => {
  vi.resetModules();
  backing.clear();
  failWrites = false;
  const platform: PlatformIpc = {
    invoke: async () => { throw new Error('No host commands expected.'); },
    channel: () => ({}), listen: () => () => undefined,
    storage: {
      getItem: async key => backing.get(key) ?? null,
      setItem: async (key, value) => { if (failWrites) throw new Error('Storage unavailable.'); backing.set(key, value); },
      removeItem: async key => { backing.delete(key); },
    },
    secrets: { get: async () => null, set: async () => undefined, delete: async () => undefined },
  };
  (await import('@desktop/lib/platform')).setPlatform(platform);
  kv = await import('@desktop/lib/platform/kv');
  review = await import('@desktop/lib/agents/agent-review');
  helpers = await import('./finish-storage');
});

describe('mobile finish recovery storage', () => {
  it('hydrates a removed-worktree checkpoint before constructing its controller after restart', async () => {
    seed(context);
    expect(kv.kvGet(review.agentReviewFinishStorageKey(context))).toBeNull();
    const recovered = await helpers.recoverFinishContext(context.hostId, context.worktreePath);
    expect(recovered).toEqual(context);
    const invoke = vi.fn() as AgentReviewInvoke;
    const controller = review.getAgentReviewFinishController(recovered!, false, { invoke });
    expect(controller.getSnapshot()).toMatchObject({ worktreeRemoved: true, branchDeleted: false, message: 'Reviewed task', validated: false, reviewedSignature: null });
    expect(controller.getSnapshot().steps).toMatchObject([{ status: 'done' }, { status: 'done' }, { status: 'failed' }]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('isolates equal repository paths on different hosts and requires an exact worktree path', async () => {
    const other = { ...context, hostId: 'host-b' };
    seed(context);
    seed(other, checkpoint({ message: 'Other host', sessionHead: 'c'.repeat(40) }));
    expect(await helpers.recoverFinishContext('host-a', '/repos/app/agen')).toBeNull();
    expect(await helpers.recoverFinishContext('host-c', context.worktreePath)).toBeNull();
    const first = await helpers.listUnfinishedFinishContexts('host-a');
    const second = await helpers.listUnfinishedFinishContexts('host-b');
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toMatchObject({ context, checkpoint: { message: 'Reviewed task', sessionHead: 'b'.repeat(40) } });
    expect(second[0]).toMatchObject({ context: other, checkpoint: { message: 'Other host', sessionHead: 'c'.repeat(40) } });
  });

  it('does not list completed, malformed, missing, or foreign-host checkpoints', async () => {
    seed(context);
    const completed = { ...context, worktreePath: '/repos/app/completed' };
    seed(completed, checkpoint({ branchDeleted: true, steps: checkpoint().steps.map(step => ({ ...step, status: 'done' })) }));
    const malformed = { ...context, worktreePath: '/repos/app/malformed' };
    seed(malformed, checkpoint({ sessionHead: '' }));
    const missing = { ...context, worktreePath: '/repos/app/missing' };
    seed(missing);
    backing.delete(review.agentReviewFinishStorageKey(missing));
    const manifest = helpers.mobileFinishContextIndexKey(context.hostId);
    const saved = JSON.parse(backing.get(manifest)!);
    saved.contexts.push({ ...context, hostId: 'foreign-host', worktreePath: '/repos/app/foreign' });
    backing.set(manifest, JSON.stringify(saved));
    expect((await helpers.listUnfinishedFinishContexts(context.hostId)).map(entry => entry.context.worktreePath)).toEqual([context.worktreePath]);
    const retained = JSON.parse(backing.get(manifest)!).contexts as MobileFinishContext[];
    expect(retained.some(entry => entry.worktreePath === completed.worktreePath)).toBe(false);
    expect(retained.some(entry => entry.worktreePath === context.worktreePath)).toBe(true);
    expect(await helpers.recoverFinishContext(context.hostId, completed.worktreePath)).toBeNull();
    expect(await helpers.recoverFinishContext(context.hostId, malformed.worktreePath)).toBeNull();
  });

  it('preserves concurrent context registration and the newer worktree generation', async () => {
    const next = { ...context, worktreePath: '/repos/app/next', sessionBranch: 'agents/next' };
    await Promise.all([helpers.prepareFinishControllerContext(context), helpers.prepareFinishControllerContext(next)]);
    const newer = { ...context, worktreeCreatedAt: 200, sessionBranch: 'agents/recreated' };
    await helpers.rememberFinishContext(newer);
    await helpers.rememberFinishContext(context);
    const saved = JSON.parse(backing.get(helpers.mobileFinishContextIndexKey(context.hostId))!);
    expect(saved.contexts).toHaveLength(2);
    expect(saved.contexts.find((entry: MobileFinishContext) => entry.worktreePath === context.worktreePath)).toEqual(newer);
    expect(JSON.parse(backing.get(review.agentReviewFinishContextIndexKey(context.worktreePath, context.basePath, context.hostId))!)).toEqual(newer);
  });

  it('retries the latest removed-worktree state after an async durability failure', async () => {
    seed(context);
    await helpers.prepareFinishControllerContext(context);
    failWrites = true;
    kv.kvSet(review.agentReviewFinishStorageKey(context), JSON.stringify(checkpoint({ message: 'Latest checkpoint' })));
    let branchDeletionAllowed = false;
    await expect(helpers.flushFinishCheckpoint(context).then(() => { branchDeletionAllowed = true; })).rejects.toThrow('Storage unavailable.');
    expect(branchDeletionAllowed).toBe(false);
    expect(kv.kvGet(review.agentReviewFinishStorageKey(context))).toContain('Latest checkpoint');
    failWrites = false;
    await helpers.flushFinishCheckpoint(context);
    const durable = JSON.parse(backing.get(review.agentReviewFinishStorageKey(context))!);
    expect(durable).toMatchObject({ worktreeRemoved: true, branchDeleted: false, message: 'Latest checkpoint' });
    kv.resetKvCache();
    expect(await helpers.recoverFinishContext(context.hostId, context.worktreePath)).toEqual(context);
  });

  it('refuses to flush a missing or malformed checkpoint', async () => {
    await helpers.prepareFinishControllerContext(context);
    await expect(helpers.flushFinishCheckpoint(context)).rejects.toThrow('checkpoint is unavailable');
    kv.kvSet(review.agentReviewFinishStorageKey(context), '{malformed');
    await expect(helpers.flushFinishCheckpoint(context)).rejects.toThrow('checkpoint is unavailable');
  });
});
