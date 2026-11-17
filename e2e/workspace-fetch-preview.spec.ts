import { expect, test, type Page } from '@playwright/test';

const parent = '/tmp/l8git-audit-fixture';
const inspect = 'Check selected repositories';
const confirm = 'Confirm targets';
const retry = 'Retry target check';
const mutations = ['git_fetch', 'git_pull', 'git_push', 'git_remote_cancel'];

test.describe.configure({ timeout: 65_000 });

async function openPreview(page: Page) {
  await page.goto('/?scene=workspace-fetch-preview');
  await page.getByRole('button', { name: 'Activity & recovery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Activity & recovery', exact: true });
  await dialog.getByText('Workspace fetch preview', { exact: true }).click();
  return dialog;
}

const calls = (page: Page) => page.evaluate(mutations => window.__L8GIT_TEST_CALLS__!.filter(
  ({ command }) => command === 'repo_fetch_scope' || mutations.includes(command),
), mutations);

test('preview checks only selected open workspace repositories and preserves partial results', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 700 });
  const dialog = await openPreview(page);
  await expect(dialog.getByText(/Last successful fetch this session:/)).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'outsider', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'not-open', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: inspect })).toBeDisabled();
  for (const name of ['primary', 'alias', 'broken']) {
    await dialog.getByRole('checkbox', { name, exact: true }).check();
  }
  expect(await calls(page)).toEqual([]);
  await dialog.getByRole('button', { name: inspect }).press('Enter');
  await expect(dialog.getByText('Configured remotes: origin', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText(/Shares a Git directory/)).toHaveCount(2);
  await expect(dialog.getByText('Repository no longer available', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: confirm })).toHaveCount(0);
  expect(await calls(page)).toEqual(['primary', 'alias', 'broken'].map(name => ({
    command: 'repo_fetch_scope', args: { path: `${parent}/${name}` },
  })));
});

test('confirmation and each retry re-read identity and target against the reviewed preview', async ({ page }) => {
  const dialog = await openPreview(page);
  await dialog.getByRole('checkbox', { name: 'primary', exact: true }).check();
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__!;
    let checks = 0;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const response = await base(command, args);
      if (command !== 'repo_fetch_scope') return response;
      checks++;
      const scope = response as { commonDir: string; target: { remote: string; fingerprint: string } };
      if (checks === 2) return { ...scope, target: { ...scope.target, fingerprint: 'changed' } };
      if (checks === 3) return { ...scope, commonDir: '/tmp/other/.git' };
      if (checks === 4) return { ...scope, target: null };
      return scope;
    };
  });
  await dialog.getByRole('button', { name: inspect }).click();
  await expect(dialog.getByText('Fetch target: origin')).toBeVisible();
  await dialog.getByRole('button', { name: confirm }).press('Enter');
  await expect(dialog.getByText('The fetch target has changed. Check the selection again.')).toBeVisible();
  await dialog.getByRole('button', { name: retry }).click();
  await expect(dialog.getByText('The repository has changed. Check the selection again.')).toBeVisible();
  await dialog.getByRole('button', { name: retry }).click();
  await expect(dialog.getByText('No unambiguous fetch target is configured.')).toBeVisible();
  await dialog.getByRole('button', { name: retry }).click();
  await expect(dialog.getByText('The targets match the preview. Workspace fetch is still unavailable.')).toBeVisible();
  expect(await calls(page)).toEqual(Array.from({ length: 5 }, () => ({
    command: 'repo_fetch_scope', args: { path: `${parent}/primary` },
  })));
});

test('membership loss during confirmation invalidates late results and removal hides retry', async ({ page }) => {
  const dialog = await openPreview(page);
  await dialog.getByRole('checkbox', { name: 'primary', exact: true }).check();
  await dialog.getByRole('button', { name: inspect }).click();
  await expect(dialog.getByRole('button', { name: confirm })).toBeEnabled();
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const response = await base(command, args);
      if (command === 'repo_fetch_scope') {
        await new Promise<void>(resolve => window.addEventListener('release-target-check', () => resolve(), { once: true }));
      }
      return response;
    };
  });
  await dialog.getByRole('button', { name: confirm }).click();
  await expect.poll(() => calls(page)).toHaveLength(2);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('reattach-fetch-preview-member'));
    window.dispatchEvent(new Event('release-target-check'));
  });
  await expect(dialog.getByText('Preview canceled.')).toBeVisible();
  await expect(dialog.getByText('The targets match the preview.', { exact: false })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: retry })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('remove-fetch-preview-member')));
  await expect(dialog.getByRole('checkbox', { name: 'primary', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: retry })).toHaveCount(0);
  expect(await calls(page)).toHaveLength(2);
});

test('cancel discards a late read and prevents checking the remaining repositories', async ({ page }) => {
  const dialog = await openPreview(page);
  for (const name of ['primary', 'alias']) await dialog.getByRole('checkbox', { name, exact: true }).check();
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const response = base(command, args);
      if (command === 'repo_fetch_scope') await new Promise<void>(resolve =>
        window.addEventListener('release-fetch-preview', () => resolve(), { once: true }));
      return response;
    };
  });
  await dialog.getByRole('button', { name: inspect }).click();
  await expect(dialog.getByRole('button', { name: inspect })).toBeDisabled();
  await expect.poll(() => calls(page)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Preview canceled.' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: inspect })).toBeDisabled();
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('release-fetch-preview'));
    await new Promise(requestAnimationFrame);
  });
  await expect(dialog.getByText(/Configured remotes:/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: inspect })).toBeEnabled();
  expect(await calls(page)).toEqual([{ command: 'repo_fetch_scope', args: { path: `${parent}/primary` } }]);
});
