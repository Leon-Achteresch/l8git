import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('~/lib/connections', () => ({
  getClient: () => ({ request: harness.request }),
  useConnections: vi.fn(),
  useHostMeta: vi.fn(),
  useOnlineHostIds: vi.fn(),
}));
vi.mock('~/lib/repo/registry', () => ({ useRepoRegistry: vi.fn() }));
vi.mock('./stores', () => ({ useChatStore: vi.fn() }));
vi.mock('@desktop/lib/agents/agent-review', () => ({
  canRunStep: vi.fn(),
  createFinishSteps: vi.fn(),
  finishFlowStatus: vi.fn(),
  isAgentSessionBranch: vi.fn(),
  nextPendingStep: vi.fn(),
  retryStep: vi.fn(),
  setStepStatus: vi.fn(),
  getAgentReviewFinishController: vi.fn(),
  releaseAgentReviewFinishController: vi.fn(),
  reviewSnapshotSignature: vi.fn(),
}));
vi.mock('./finish-storage', () => ({
  flushFinishCheckpoint: vi.fn(),
  listUnfinishedFinishContexts: vi.fn(),
  prepareFinishControllerContext: vi.fn(),
  recoverFinishContext: vi.fn(),
}));

import {
  discardReviewFile,
  discardReviewFileWithPreview,
  reviewDiscardPreviewMessage,
  sessionFromWorktrees,
  type AgentReviewFile,
  type AgentReviewFileDiff,
  type AgentReviewSession,
  type ReviewFileDiscardPreview,
} from './review';

const session: AgentReviewSession = {
  hostId: 'host-a',
  worktreePath: '/repos/app/agent',
  basePath: '/repos/app',
  branch: 'agents/demo',
};
const file: AgentReviewFile = {
  path: ' selected*file.txt ',
  additions: 1,
  deletions: 0,
  binary: false,
  untracked: false,
};
const snapshot: AgentReviewFileDiff = {
  diff: '+reviewed content\n',
  untrackedPlain: null,
  isBinary: false,
  fingerprint: 'review-v1:displayed',
};

beforeEach(() => {
  harness.request.mockReset();
  harness.request.mockImplementation(async (command: string) =>
    command === 'agent_review_file_diff' ? { ...snapshot } : undefined
  );
});

describe('mobile session identity', () => {
  const main = { path: session.basePath, head: 'abc123', branch: 'main', is_main: true, is_locked: false, lock_reason: null, is_prunable: false, prunable_reason: null };
  const worktree = { ...main, path: session.worktreePath, branch: session.branch, is_main: false };

  it('never substitutes another worktree for a missing review route', () => {
    expect(sessionFromWorktrees(session.hostId, '/removed-session', [main, worktree])).toBeNull();
    expect(sessionFromWorktrees(session.hostId, main.path, [main, worktree])).toBeNull();
    expect(sessionFromWorktrees(session.hostId, worktree.path, [main, worktree])).toEqual(session);
  });

  it('keeps trailing spaces and literal Unix backslashes in worktree identities', () => {
    const spaced = { ...worktree, path: `${worktree.path} `, branch: 'agents/space' };
    const backslash = { ...worktree, path: '/repos/app/agent\\nested', branch: 'agents/backslash' };
    const nested = { ...worktree, path: '/repos/app/agent/nested', branch: 'agents/nested' };
    const entries = [main, worktree, spaced, backslash, nested];
    for (const entry of [worktree, spaced, backslash, nested]) {
      expect(sessionFromWorktrees(session.hostId, entry.path, entries)).toEqual({
        hostId: session.hostId, worktreePath: entry.path, basePath: main.path, branch: entry.branch,
      });
    }
    expect(sessionFromWorktrees(session.hostId, `${worktree.path}  `, entries)).toBeNull();
    expect(sessionFromWorktrees(session.hostId, `${nested.path}/`, entries)).toBeNull();
  });
});

describe('mobile review discard', () => {
  it('fetches and displays a snapshot before a single guarded whole-file mutation', async () => {
    const confirm = vi.fn(async (preview: ReviewFileDiscardPreview) => {
      expect(harness.request.mock.calls).toEqual([
        [
          'agent_review_file_diff',
          {
            worktreePath: session.worktreePath,
            mergeBase: 'base-commit',
            file: file.path,
          },
        ],
      ]);
      expect(preview.snapshot).toEqual(snapshot);
      return true;
    });
    await expect(
      discardReviewFileWithPreview(session, 'base-commit', file, confirm)
    ).resolves.toBe(true);
    expect(harness.request.mock.calls[1]).toEqual([
      'agent_review_discard_change',
      {
        worktreePath: session.worktreePath,
        mergeBase: 'base-commit',
        file: file.path,
        expectedFingerprint: snapshot.fingerprint,
        patch: null,
      },
    ]);
    expect(harness.request).toHaveBeenCalledTimes(2);
  });

  it('performs no mutation when confirmation is canceled', async () => {
    await expect(
      discardReviewFileWithPreview(session, 'base', file, async () => false)
    ).resolves.toBe(false);
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(harness.request.mock.calls[0][0]).toBe('agent_review_file_diff');
  });

  it('keeps the displayed token and target across delayed confirmation', async () => {
    const selectedSession = { ...session };
    const selectedFile = { ...file };
    const shown = { ...snapshot };
    harness.request.mockResolvedValueOnce(shown);
    let approve: (approved: boolean) => void = () => undefined;
    const confirmation = new Promise<boolean>((resolve) => {
      approve = resolve;
    });
    const confirm = vi.fn(() => confirmation);
    const pending = discardReviewFileWithPreview(
      selectedSession,
      'original-base',
      selectedFile,
      confirm
    );
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    selectedSession.worktreePath = '/different/worktree';
    selectedSession.hostId = 'host-b';
    selectedFile.path = 'different.txt';
    shown.fingerprint = 'review-v1:newer-unreviewed-state';
    approve(true);
    await expect(pending).resolves.toBe(true);
    expect(harness.request.mock.calls[1]).toEqual([
      'agent_review_discard_change',
      {
        worktreePath: session.worktreePath,
        mergeBase: 'original-base',
        file: file.path,
        expectedFingerprint: snapshot.fingerprint,
        patch: null,
      },
    ]);
    expect(harness.request).toHaveBeenCalledTimes(2);
  });

  it('does not show a confirmation after the review scope changed during preview loading', async () => {
    const confirm = vi.fn(async () => true);
    await expect(
      discardReviewFileWithPreview(session, 'base', file, confirm, () => false)
    ).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(harness.request).toHaveBeenCalledTimes(1);
  });

  it('does not mutate if the review becomes unavailable during confirmation', async () => {
    let current = true;
    const confirm = async () => {
      current = false;
      return true;
    };
    await expect(
      discardReviewFileWithPreview(
        session,
        'base',
        file,
        confirm,
        () => current
      )
    ).resolves.toBe(false);
    expect(harness.request).toHaveBeenCalledTimes(1);
  });

  it('rejects unverifiable snapshots before confirmation and never invokes a legacy fallback', async () => {
    harness.request.mockResolvedValueOnce({
      ...snapshot,
      fingerprint: undefined,
    });
    const confirm = vi.fn(async () => true);
    await expect(
      discardReviewFileWithPreview(session, 'base', file, confirm)
    ).rejects.toThrow('__FILE_CHANGED__');
    expect(confirm).not.toHaveBeenCalled();
    expect(harness.request).toHaveBeenCalledTimes(1);
    await expect(discardReviewFile(session, 'base', file, '')).rejects.toThrow(
      '__FILE_CHANGED__'
    );
    expect(harness.request).toHaveBeenCalledTimes(1);
  });

  it('propagates stale rejection for untracked and committed additions without an unguarded retry', async () => {
    for (const untracked of [true, false]) {
      harness.request.mockReset();
      harness.request
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValueOnce(new Error(`__FILE_CHANGED__|${file.path}`));
      await expect(
        discardReviewFileWithPreview(
          session,
          'base',
          { ...file, untracked },
          async () => true
        )
      ).rejects.toThrow('__FILE_CHANGED__');
      expect(harness.request.mock.calls.map(([command]) => command)).toEqual([
        'agent_review_file_diff',
        'agent_review_discard_change',
      ]);
    }
  });

  it('does not prompt or mutate after a failed preview read', async () => {
    harness.request.mockRejectedValueOnce(new Error('Host offline'));
    const confirm = vi.fn(async () => true);
    await expect(
      discardReviewFileWithPreview(session, 'base', file, confirm)
    ).rejects.toThrow('Host offline');
    expect(confirm).not.toHaveBeenCalled();
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
});

describe('review discard confirmation preview', () => {
  const preview: ReviewFileDiscardPreview = {
    session,
    file,
    mergeBase: 'base',
    snapshot,
  };

  it('shows exact path and text from the captured snapshot', () => {
    const message = reviewDiscardPreviewMessage(preview);
    expect(message).toContain(file.path);
    expect(message).toContain('+reviewed content');
    expect(message).toContain('Files added during the session will be removed');
    expect(message).not.toContain('review-v1:');
  });

  it('bounds long previews and identifies truncation', () => {
    const message = reviewDiscardPreviewMessage({
      ...preview,
      snapshot: {
        ...snapshot,
        diff: Array.from({ length: 100 }, (_, i) => `+line ${i}`).join('\n'),
      },
    });
    expect(message).toContain('+line 15');
    expect(message).not.toContain('+line 16');
    expect(message).toContain('Preview shortened');
    expect(message.length).toBeLessThan(1600);
  });

  it('identifies binary previews without exposing their content or fingerprint', () => {
    const message = reviewDiscardPreviewMessage({
      ...preview,
      snapshot: {
        ...snapshot,
        isBinary: true,
        diff: 'binary secret',
      },
    });
    expect(message).toContain('Binary change');
    expect(message).not.toContain('binary secret');
    expect(message).not.toContain('review-v1:');
  });
});
