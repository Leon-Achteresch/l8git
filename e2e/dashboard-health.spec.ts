import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { TestInvoke } from '../ui-test/audit-fixtures';
import type { RebaseStatus, MergeState, CherryPickState, StashEntry, WorktreeEntry } from '../src/lib/repo-store';

const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const de = JSON.parse(readFileSync(new URL('../src/locales/de.json', import.meta.url), 'utf8'));
type HealthWindow = Window & { __HEALTH_TEST__: { failStatus: boolean; noUpstream: boolean } };
const healthCommands = ['repo_full_status', 'list_stashes', 'list_worktrees', 'git_bisect_status', 'cherry_pick_state', 'merge_state', 'rebase_status'];

async function healthFixture(page: Page, failStatus: boolean, noUpstream = false) {
  await page.addInitScript(({ failStatus, noUpstream }) => {
    const state = { failStatus, noUpstream };
    (window as HealthWindow).__HEALTH_TEST__ = state;
    let original: TestInvoke | undefined;
    const wrapped: TestInvoke = async (command, args) => {
      const value = await original!(command, args);
      if (command === 'repo_full_status') {
        if (state.failStatus) throw Error('Health status unavailable');
        const template = (value as { entries: Record<string, unknown>[] }).entries[0];
        return { entries: [{ ...template, path: 'shared.txt', index_status: 'U', worktree_status: 'U' },
          { ...template, path: 'added.txt', index_status: 'A', worktree_status: 'A' }],
        has_upstream: !state.noUpstream, upstream_sync: { ahead: 3, behind: 0 } };
      }
      if (command === 'merge_state') return { in_progress: true, merge_head: 'b'.repeat(40), conflicted_paths: ['shared.txt'] } satisfies MergeState;
      if (command === 'cherry_pick_state') return { in_progress: true, head: 'b'.repeat(40), conflicted_paths: ['shared.txt'] } satisfies CherryPickState;
      if (command === 'rebase_status') return { in_progress: true, kind: 'normal', step: 1, total: 2, head_name: 'main',
        onto: 'a'.repeat(40), onto_short: 'aaaaaaa', current_action: 'pick', stopped: { hash: 'b'.repeat(40), short_hash: 'bbbbbbb', subject: 'Paused fixture commit' },
        conflicted_paths: ['shared.txt', 'rebase-only.txt'], todo: [{ action: 'pick', hash: 'c'.repeat(40), short_hash: 'ccccccc', subject: 'Remaining fixture commit' }] } satisfies RebaseStatus;
      if (command === 'list_stashes') return [0, 1].map(index => ({ index, refname: `stash@{${index}}`, subject: `Saved ${index}`, hash: String(index).repeat(40), message: `Saved ${index}`, branch: 'main', date: '2026-10-01T12:00:00Z' } satisfies StashEntry));
      if (command === 'list_worktrees') return [{ path: '/tmp/base', is_main: true }, { path: '/tmp/session', is_main: false }].map(entry => ({ ...entry, branch: 'main', head: 'a'.repeat(40), is_locked: false, lock_reason: null, is_prunable: false, prunable_reason: null } satisfies WorktreeEntry));
      return value;
    };
    Object.defineProperty(window, '__L8GIT_TEST_INVOKE__', { configurable: true, get: () => wrapped, set: value => { original = value; } });
  }, { failStatus, noUpstream });
}

test('dashboard health retries failed reads, preserves last known values, and opens its guide by keyboard', async ({ page }) => {
  await healthFixture(page, true);
  await page.goto('/?scene=health');
  await page.getByRole('link', { name: en.header.dashboard, exact: true }).click();
  const health = page.getByRole('region', { name: en.dashboard.health.title, exact: true });
  const refresh = health.getByRole('button', { name: en.dashboard.health.states.refresh, exact: true });
  const working = health.getByTestId('repo-health-workingCopy');
  const upstream = health.getByTestId('repo-health-upstream');
  await expect(working).toContainText(en.dashboard.health.states.error);
  await expect(working).not.toContainText(en.dashboard.health.workingCopy.ok);
  await expect(upstream).not.toContainText(en.dashboard.health.upstream.ok);
  await expect(refresh).toBeEnabled();

  await page.evaluate(() => { (window as HealthWindow).__HEALTH_TEST__.failStatus = false; });
  const before = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.length);
  await refresh.click();
  await expect(working).toContainText('2 changed files');
  await expect(upstream).toContainText('3 unpushed commits');
  await expect(health.getByTestId('repo-health-conflicts')).toContainText('3 conflicted files');
  await expect(health.getByTestId('repo-health-stashes')).toContainText('2 saved stashes');
  await expect(health.getByTestId('repo-health-worktrees')).toContainText('1 additional worktree');
  await expect(refresh).toBeEnabled();
  const refreshCalls = await page.evaluate(start => window.__L8GIT_TEST_CALLS__!.slice(start).map(call => call.command), before);
  // The app may also reload stashes in the background; every call remains a health read.
  expect([...new Set(refreshCalls)].sort()).toEqual([...healthCommands].sort());
  expect(refreshCalls.filter(command => command === 'repo_full_status')).toHaveLength(1);

  await page.evaluate(() => { (window as HealthWindow).__HEALTH_TEST__.failStatus = true; });
  await refresh.click();
  await expect(upstream).toContainText(en.dashboard.health.states.lastKnown);
  await expect(upstream).toContainText('3 unpushed commits');
  await expect(upstream).toContainText('Health status unavailable');
  await expect(refresh).toBeEnabled();

  const guide = upstream.getByRole('link', { name: en.dashboard.health.upstream.action, exact: true });
  await guide.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Synchronize a branch with its remote', exact: true })).toBeVisible();
});

test('German dashboard health explains an unconfigured upstream and keeps its narrow layout and guide accessible', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await healthFixture(page, false, true);
  await page.goto('/?scene=health&lang=de');
  await page.getByRole('link', { name: de.header.dashboard, exact: true }).click();
  const health = page.getByRole('region', { name: de.dashboard.health.title, exact: true });
  const upstream = health.getByTestId('repo-health-upstream');
  await expect(upstream).toContainText(de.dashboard.health.upstream.noUpstream);
  await expect(upstream).not.toContainText(de.dashboard.health.upstream.warn);
  await expect(health.getByTestId('repo-health-conflicts')).toContainText('3 Dateien mit Konflikten');
  await expect(health.getByRole('button', { name: de.dashboard.health.states.refresh, exact: true })).toBeEnabled();
  await health.scrollIntoViewIfNeeded();
  const dimensions = await health.evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  const guide = health.getByTestId('repo-health-conflicts').getByRole('link', { name: de.dashboard.health.conflicts.action, exact: true });
  await guide.focus();
  await expect(guide).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: de.workflowGuides['resolve-conflicts'].title, exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.map(call => call.command));
  expect(calls.some(command => /^(stage_|commit_changes|git_(merge|rebase|fetch|pull|push|reset|save_resolved))/.test(command))).toBe(false);
});
