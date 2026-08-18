import { describe, expect, it } from 'vitest';

import {
  buildInboxSections,
  checkStateForRun,
  inboxBadgeCount,
  resolveDefaultBranch,
  type InboxPullRequest,
  type InboxRepoInput,
  type InboxWorkflowRun,
} from './inbox';

function pr(overrides: Partial<InboxPullRequest> & { number: number }): InboxPullRequest {
  return {
    title: `PR ${overrides.number}`,
    state: 'open',
    is_draft: false,
    author: 'someone',
    author_avatar: null,
    source_branch: 'feature',
    target_branch: 'main',
    html_url: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    labels: [],
    reviewers: [],
    provider: 'github',
    ...overrides,
  };
}

function run(overrides: Partial<InboxWorkflowRun> & { id: number }): InboxWorkflowRun {
  return {
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    workflow_id: 1,
    head_branch: 'main',
    head_sha: 'abc',
    run_number: overrides.id,
    event: 'push',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    html_url: '',
    ...overrides,
  };
}

function repo(overrides: Partial<InboxRepoInput> & { hostId: string }): InboxRepoInput {
  return {
    path: `/repos/${overrides.hostId}`,
    repoName: 'demo',
    viewerLogin: null,
    prs: [],
    runs: [],
    ...overrides,
  };
}

describe('inbox aggregation', () => {
  it('splits my pull requests from the review queue per viewer login', () => {
    const sections = buildInboxSections([
      repo({
        hostId: 'a',
        viewerLogin: 'Leon',
        prs: [
          pr({ number: 1, author: 'leon' }),
          pr({ number: 2, author: 'mara', reviewers: [{ login: 'leon', avatar: null }] }),
          pr({ number: 3, author: 'mara', reviewers: [{ login: 'kai', avatar: null }] }),
          pr({ number: 4, author: 'leon', state: 'closed' }),
        ],
      }),
    ]);

    expect(sections.myPrs.map((item) => item.number)).toEqual([1]);
    expect(sections.reviewRequested.map((item) => item.number)).toEqual([2]);
  });

  it('aggregates across hosts and keys items per host', () => {
    const sections = buildInboxSections([
      repo({ hostId: 'a', viewerLogin: 'leon', prs: [pr({ number: 7, author: 'leon' })] }),
      repo({ hostId: 'b', viewerLogin: 'leon', prs: [pr({ number: 7, author: 'leon' })] }),
    ]);

    expect(sections.myPrs).toHaveLength(2);
    expect(new Set(sections.myPrs.map((item) => item.key)).size).toBe(2);
  });

  it('reports only the newest failing run per workflow on the default branch', () => {
    const sections = buildInboxSections([
      repo({
        hostId: 'a',
        defaultBranch: 'refs/heads/main',
        runs: [
          run({ id: 1, conclusion: 'failure', updated_at: '2026-01-01T00:00:00Z' }),
          run({ id: 2, conclusion: 'success', updated_at: '2026-01-03T00:00:00Z' }),
          run({
            id: 3,
            workflow_id: 2,
            conclusion: 'timed_out',
            updated_at: '2026-01-04T00:00:00Z',
          }),
          run({ id: 4, conclusion: 'failure', head_branch: 'feature' }),
        ],
      }),
    ]);

    expect(sections.redRuns.map((item) => item.runId)).toEqual([3]);
    expect(inboxBadgeCount(sections)).toBe(1);
  });

  it('derives the pull request check state from the newest run on its source branch', () => {
    const sections = buildInboxSections([
      repo({
        hostId: 'a',
        prs: [pr({ number: 9, source_branch: 'feature' })],
        runs: [
          run({ id: 1, head_branch: 'feature', conclusion: 'success' }),
          run({
            id: 2,
            head_branch: 'feature',
            conclusion: 'failure',
            updated_at: '2026-01-05T00:00:00Z',
          }),
        ],
      }),
    ]);

    expect(sections.myPrs[0].checks).toBe('failure');
  });

  it('falls back to the most common pull request target as default branch', () => {
    expect(resolveDefaultBranch({ prTargets: ['develop', 'develop', 'main'] })).toBe('develop');
    expect(resolveDefaultBranch({ branches: ['origin/master', 'topic'] })).toBe('master');
    expect(resolveDefaultBranch({})).toBeNull();
  });

  it('treats queued runs without a conclusion as running', () => {
    expect(checkStateForRun(run({ id: 1, status: 'queued', conclusion: null }))).toBe('running');
    expect(checkStateForRun(null)).toBe('unknown');
  });
});
