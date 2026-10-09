import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const labels = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const mutatingCommands = ['stage_files', 'commit_changes', 'agent_review_commit_checked', 'git_merge', 'git_worktree_remove_checked', 'agent_review_delete_branch_checked'];

type ReviewSample = {
  summary: Record<string, unknown>;
  fingerprint: string;
  rawFingerprint: unknown;
  bytes: number[];
};
type StaleReviewWindow = Window & {
  __STALE_REVIEW__: { changeContent: () => void; samples: ReviewSample[]; heads: string[] };
};

async function installChangingContent(page: Page, binary = false) {
  await page.addInitScript(({ binary }) => {
    let original: Window['__L8GIT_TEST_INVOKE__'];
    let changed = false;
    const samples: ReviewSample[] = [];
    const heads: string[] = [];
    Object.defineProperty(window, '__STALE_REVIEW__', {
      value: { changeContent: () => { changed = true; }, samples, heads },
    });
    Object.defineProperty(window, '__L8GIT_TEST_INVOKE__', {
      configurable: true,
      get: () => async (command: string, args?: Record<string, unknown>) => {
        // Translate only the currently reviewed synthetic token back to the
        // fixture's real token; the fixture still validates every commit guard.
        const latest = samples.at(-1);
        const invokeArgs = command === 'agent_review_commit_checked' && latest && args?.expectedFingerprint === latest.fingerprint
          ? { ...args, expectedFingerprint: latest.rawFingerprint } : args;
        const result = await original!(command, invokeArgs);
        if (command === 'repo_commit_inspect' && args?.path === '/tmp/l8git-audit-fixture' && args?.commit === 'HEAD') {
          heads.push((result as { header: string }).header.match(/^commit (\S+)/)![1]);
        }
        if (command === 'agent_review_file_diff' && binary) {
          return { ...(result as Record<string, unknown>), diff: null, untrackedPlain: null, isBinary: true };
        }
        // Ordinary summary rendering stays cheap; only the finish preflight requests content identity.
        if (command !== 'agent_review_summary' || args?.includeFingerprint !== true) return result;
        const { fingerprint: rawFingerprint, ...summary } = result as Record<string, unknown>;
        if (binary) {
          summary.files = (summary.files as Record<string, unknown>[]).map(file => ({ ...file, binary: true, additions: 0, deletions: 0 }));
          summary.additions = 0;
          summary.deletions = 0;
        }
        const bytes = binary
          ? new Uint8Array(changed ? [0, 9, 2, 3] : [0, 1, 2, 3])
          : new TextEncoder().encode(changed ? 'bravo\n' : 'alpha\n');
        const identity = new TextEncoder().encode(`${rawFingerprint}:${Array.from(bytes).join(',')}`);
        const digest = await crypto.subtle.digest('SHA-256', identity);
        const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        samples.push({ summary, fingerprint, rawFingerprint, bytes: Array.from(bytes) });
        return { ...summary, fingerprint };
      },
      set: value => { original = value; },
    });
  }, { binary });
}

async function openFinish(page: Page, binary = false) {
  await installChangingContent(page, binary);
  await page.goto('/?scene=review');
  const keep = page.getByRole('button', { name: 'Keep file', exact: true });
  await expect(keep).toBeEnabled({ timeout: 20_000 });
  if (binary) await expect(page.getByText('Binary file – no text diff available.', { exact: true })).toBeVisible();
  await keep.click();
  await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  const finish = page.getByRole('dialog', { name: 'Finish session', exact: true });
  await expect(finish.getByRole('checkbox')).toBeEnabled();
  await finish.getByPlaceholder('Commit message for the remaining changes').fill('Reviewed session');
  return finish;
}

async function observation(page: Page) {
  return page.evaluate(() => {
    const state = (window as StaleReviewWindow).__STALE_REVIEW__;
    return { sample: state.samples.at(-1), head: state.heads.at(-1) };
  });
}

async function mutations(page: Page) {
  return page.evaluate(commands => (window.__L8GIT_TEST_CALLS__ ?? [])
    .filter(call => commands.includes(call.command)).map(call => call.command), mutatingCommands);
}

async function changeContent(page: Page) {
  await page.evaluate(() => (window as StaleReviewWindow).__STALE_REVIEW__.changeContent());
}

function expectOnlyContentChanged(before: Awaited<ReturnType<typeof observation>>, after: Awaited<ReturnType<typeof observation>>) {
  expect(before.head).toMatch(/^[0-9a-f]{40}$/);
  expect(after.head).toBe(before.head);
  expect(before.sample?.rawFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(after.sample?.summary).toEqual(before.sample?.summary);
  expect(after.sample?.bytes).toHaveLength(before.sample!.bytes.length);
  expect(after.sample?.bytes).not.toEqual(before.sample?.bytes);
  expect(after.sample?.fingerprint).not.toBe(before.sample?.fingerprint);
}

for (const binary of [false, true]) {
  test(`${binary ? 'binary bytes with zero diff counts' : 'same-size text edits'} require a fresh confirmation before committing`, async ({ page }) => {
    const finish = await openFinish(page, binary);
    const reviewed = finish.getByRole('checkbox');
    await reviewed.check();
    const before = await observation(page);
    await changeContent(page);
    await finish.getByRole('button', { name: 'Commit', exact: true }).click();
    await expect(finish.getByText(labels.agentReviewFinish.errors.reviewChanged, { exact: true })).toBeVisible();
    await expect(reviewed).not.toBeChecked();
    const retry = finish.getByRole('button', { name: labels.agentReview.retry, exact: true });
    await expect(retry).toBeDisabled();
    expect(await mutations(page)).toEqual([]);
    expectOnlyContentChanged(before, await observation(page));
    if (binary) expect(before.sample?.summary).toMatchObject({ additions: 0, deletions: 0, files: [expect.objectContaining({ binary: true, additions: 0, deletions: 0 })] });

    await reviewed.check();
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(finish.getByText(labels.agentReviewFinish.reviewAfterCommit, { exact: true })).toBeVisible();
    await expect(reviewed).not.toBeChecked();
    await expect(reviewed).toBeEnabled();
    expect(await mutations(page)).toEqual(['agent_review_commit_checked']);
  });
}

test('merge rechecks reviewed content after the commit step without repeating the commit', async ({ page }) => {
  const finish = await openFinish(page);
  const reviewed = finish.getByRole('checkbox');
  await reviewed.check();
  await finish.getByRole('button', { name: 'Commit', exact: true }).click();
  await expect(finish.getByText(labels.agentReviewFinish.reviewAfterCommit, { exact: true })).toBeVisible();
  await expect(reviewed).not.toBeChecked();
  await reviewed.check();
  const before = await observation(page);
  await changeContent(page);
  await finish.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(finish.getByText(labels.agentReviewFinish.errors.reviewChanged, { exact: true })).toBeVisible();
  await expect(reviewed).not.toBeChecked();
  const retry = finish.getByRole('button', { name: labels.agentReview.retry, exact: true });
  await expect(retry).toBeDisabled();
  expect(await mutations(page)).toEqual(['agent_review_commit_checked']);
  expectOnlyContentChanged(before, await observation(page));

  await reviewed.check();
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(finish.getByRole('button', { name: 'Clean up', exact: true })).toBeEnabled();
  expect(await mutations(page)).toEqual(['agent_review_commit_checked', 'git_merge']);
});
