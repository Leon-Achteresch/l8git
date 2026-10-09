import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentReviewFinishController,
  agentReviewFinishStorageKey,
  type AgentReviewFinishContext,
  type AgentReviewSummary,
} from '@desktop/lib/agents/agent-review';
import { installTestPlatform } from '@desktop/lib/agents/__tests__/platform-harness';
import { mobileFinishAvailable, mobileFinishDependencies, mobileFinishIsComplete, type ReviewFinishAvailability } from './review-finish';

const context: AgentReviewFinishContext & { hostId: string } = {
  hostId: 'host-a', basePath: '/repo', worktreePath: '/repo/agent', baseBranch: 'main', sessionBranch: 'agents/task',
};
const summary: AgentReviewSummary = {
  baseBranch: 'main', sessionBranch: 'agents/task', mergeBase: 'abc123',
  files: [], additions: 0, deletions: 0, commits: 1, uncommitted: 0, fingerprint: 'review-v1:original',
};
const mutations = ['agent_review_commit_checked', 'git_merge', 'git_worktree_remove_checked', 'agent_review_delete_branch_checked'];

beforeEach(() => { installTestPlatform(); });

function harness(dirty = false) {
  const hosts = new Map(['host-a', 'host-b'].map(hostId => [hostId, {
    removed: false, merged: false, deleted: false, dirty, fingerprint: summary.fingerprint,
    baseBranch: 'main', baseHead: 'abc123', sessionHead: 'def456', deleteFailure: false,
  }]));
  let availability: ReviewFinishAvailability = { hostId: 'host-a', worktreePath: context.worktreePath, available: true, busy: false };
  let held: Promise<void> | null = null;
  let refreshStarted: (() => void) | null = null;
  const hostInvoke = vi.fn(async (hostId: string, command: string, args?: Record<string, unknown>): Promise<unknown> => {
    const repo = hosts.get(hostId)!;
    if (command === 'list_worktrees' && held) { refreshStarted?.(); await held; }
    switch (command) {
      case 'list_worktrees': return [
        { path: context.basePath, branch: repo.baseBranch, head: repo.baseHead, is_main: true, is_locked: false, is_prunable: false },
        ...repo.removed ? [] : [{ path: context.worktreePath, branch: context.sessionBranch, head: repo.sessionHead, is_main: false, is_locked: false, is_prunable: false }],
      ];
      case 'agent_review_summary':
        if (repo.removed) throw Error('Worktree removed');
        return { ...summary, fingerprint: repo.fingerprint, uncommitted: repo.dirty ? 1 : 0 };
      case 'repo_status': return args?.path === context.worktreePath && repo.dirty ? [{ path: 'file.txt', index_status: ' ', worktree_status: 'M' }] : [];
      case 'merge_state': case 'rebase_status': case 'cherry_pick_state': return { in_progress: false };
      case 'repo_commit_inspect': return { header: `commit ${args?.path === context.basePath ? repo.baseHead : repo.sessionHead}\nAuthor: Agent <a@example.com>\n\n    Update\n` };
      case 'agent_review_commit_checked': repo.dirty = false; repo.sessionHead = 'aaa789'; return repo.sessionHead;
      case 'agent_review_branch_merged': return repo.merged;
      case 'git_merge': repo.merged = true; return 'merged';
      case 'git_worktree_remove_checked': repo.removed = true; return;
      case 'open_repo': return { branch: repo.baseBranch, branches: repo.deleted ? [] : [{ name: context.sessionBranch, is_remote: false }] };
      case 'agent_review_delete_branch_checked': if (repo.deleteFailure) throw Error('Deletion unavailable'); repo.deleted = true; return;
      default: throw Error(`Unexpected ${command}`);
    }
  });
  const flush = vi.fn(async () => undefined);
  const create = (hostId = 'host-a') => {
    const captured = { ...context, hostId };
    return new AgentReviewFinishController(captured, dirty, mobileFinishDependencies(captured, {
      hostInvoke: <T>(host: string, command: string, args?: Record<string, unknown>) => hostInvoke(host, command, args) as Promise<T>,
      current: () => availability,
      flushCheckpoint: flush,
      onChanged: async () => undefined,
    }));
  };
  return {
    hosts, hostInvoke, flush, create,
    availability: () => availability,
    setAvailability: (next: Partial<ReviewFinishAvailability>) => { availability = { ...availability, ...next }; },
    holdPreflight: () => {
      let release!: () => void;
      held = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { refreshStarted = resolve; });
      return { started, release: () => { held = null; release(); } };
    },
  };
}

describe('mobile finish with the real shared controller', () => {
  it('permits Git finishing on a bound online host when its selected CLI is unavailable', () => {
    const connection = { bound: true, provider: 'codex', status: 'error', error: 'Codex is not installed on this Claude host.' };
    expect(mobileFinishAvailable(true, connection)).toBe(true);
    expect(mobileFinishAvailable(false, connection)).toBe(false);
    expect(mobileFinishAvailable(true, { ...connection, bound: false })).toBe(false);
  });
  it('keeps commands and checkpoints separate for two hosts with identical worktree paths', async () => {
    const h = harness();
    const a = h.create();
    const b = h.create('host-b');
    await Promise.all([a.refresh(), b.refresh()]);
    a.markReviewed(true); b.markReviewed(true);
    h.setAvailability({ hostId: 'host-b' });
    expect(await a.run('merge')).toBe(false);
    expect(await b.run('merge')).toBe(true);
    expect(h.hosts.get('host-a')!.merged).toBe(false);
    expect(h.hosts.get('host-b')!.merged).toBe(true);
    expect(h.hostInvoke.mock.calls.filter(([, command]) => command === 'git_merge').map(([hostId]) => hostId)).toEqual(['host-b']);
    expect(agentReviewFinishStorageKey(a.context)).not.toBe(agentReviewFinishStorageKey(b.context));
  });

  for (const unavailable of [{ available: false }, { busy: true }, { worktreePath: '/other/worktree' }, { hostId: 'host-b' }]) {
    it(`blocks mutations when availability changes during preflight: ${JSON.stringify(unavailable)}`, async () => {
      const h = harness();
      const controller = h.create();
      await controller.refresh(); controller.markReviewed(true);
      const held = h.holdPreflight();
      const run = controller.run('merge');
      await held.started;
      h.setAvailability(unavailable);
      held.release();
      expect(await run).toBe(false);
      expect(h.hostInvoke.mock.calls.some(([, command]) => mutations.includes(command))).toBe(false);
    });
  }

  it('requires new content consent before a single checked commit and again before merging', async () => {
    const h = harness(true);
    const controller = h.create();
    await controller.refresh(); controller.setMessage('feat: complete task'); controller.markReviewed(true);
    h.hosts.get('host-a')!.fingerprint = 'review-v1:same-count-new-content';
    expect(await controller.run('commit')).toBe(false);
    expect(h.hostInvoke.mock.calls.some(([, command]) => mutations.includes(command))).toBe(false);
    controller.markReviewed(true);
    expect(await controller.run('commit', true)).toBe(true);
    expect(controller.getSnapshot().reviewedSignature).toBeNull();
    expect(await controller.run('merge')).toBe(false);
    controller.markReviewed(true);
    expect(await controller.run('merge', true)).toBe(true);
    const commit = h.hostInvoke.mock.calls.find(([, command]) => command === 'agent_review_commit_checked');
    expect(commit).toEqual(['host-a', 'agent_review_commit_checked', {
      basePath: context.basePath, worktreePath: context.worktreePath, message: 'feat: complete task',
      expectedBaseBranch: 'main', expectedSessionBranch: 'agents/task', expectedBaseHead: 'abc123', expectedSessionHead: 'def456',
      expectedFingerprint: 'review-v1:same-count-new-content',
    }]);
    expect(h.hostInvoke.mock.calls.filter(([, command]) => command === 'agent_review_commit_checked')).toHaveLength(1);
    expect(h.hostInvoke.mock.calls.some(([, command]) => ['stage_files', 'commit_changes'].includes(command))).toBe(false);
  });

  it('skips a clean commit and resumes branch deletion after removal without removing twice', async () => {
    const h = harness();
    const first = h.create();
    await first.refresh(); first.markReviewed(true);
    expect(first.getSnapshot().steps[0].status).toBe('skipped');
    expect(await first.run('merge')).toBe(true);
    h.hosts.get('host-a')!.deleteFailure = true;
    expect(await first.run('cleanup')).toBe(false);
    expect(first.getSnapshot().worktreeRemoved).toBe(true);
    expect(h.flush).toHaveBeenCalled();
    const restored = h.create();
    await restored.refresh();
    h.hosts.get('host-a')!.deleteFailure = false;
    expect(await restored.run('cleanup', true)).toBe(true);
    expect(restored.getSnapshot().branchDeleted).toBe(true);
    const completed = restored.getSnapshot();
    expect(mobileFinishIsComplete(restored.context, completed, h.availability())).toBe(true);
    for (const changed of [
      { available: false }, // Also covers an unfocused or unmounted review screen.
      { busy: true }, { hostId: 'host-b' }, { worktreePath: '/other/worktree' },
    ]) {
      expect(mobileFinishIsComplete(restored.context, completed, { ...h.availability(), ...changed })).toBe(false);
    }
    expect(mobileFinishIsComplete(restored.context, { ...completed, checking: true }, h.availability())).toBe(false);
    expect(mobileFinishIsComplete(restored.context, { ...completed, validated: false }, h.availability())).toBe(false);
    expect(mobileFinishIsComplete(restored.context, { ...completed, checkError: 'Refresh failed' }, h.availability())).toBe(false);
    expect(h.hostInvoke.mock.calls.filter(([, command]) => command === 'git_worktree_remove_checked')).toHaveLength(1);
    expect(h.hostInvoke.mock.calls.find(([, command]) => command === 'git_worktree_remove_checked')?.[2]).toEqual({
      path: context.basePath, worktreePath: context.worktreePath, expectedBranch: 'agents/task', expectedHead: 'def456', mergedInto: 'main',
    });
    const deletions = h.hostInvoke.mock.calls.filter(([, command]) => command === 'agent_review_delete_branch_checked');
    expect(deletions).toHaveLength(2);
    expect(deletions.map(([, , args]) => args)).toEqual([0, 1].map(() => ({
      path: context.basePath, branch: 'agents/task', expectedHead: 'def456', expectedBaseBranch: 'main',
    })));
    expect(h.hostInvoke.mock.calls.some(([, command]) => command === 'delete_branch')).toBe(false);
  });
});
