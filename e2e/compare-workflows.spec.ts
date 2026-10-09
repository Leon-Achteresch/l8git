import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openComparison(page: import('@playwright/test').Page) {
  await page.goto('/?scene=git-workflow');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('compare');
  await page.getByRole('option', { name: 'Compare commits and branches', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare commits and branches', exact: true });
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test('comparison preserves rename paths and reviews files against pinned snapshots', async ({ page }) => {
  const dialog = await openComparison(page);
  await expect(dialog.getByText('Only file metadata changed. Review the rename, permissions or type changes below.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('← docs/old name.txt', { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.find(call => call.command === 'repo_compare_file_diff')?.args)).toMatchObject({ base: 'a'.repeat(40), head: 'd'.repeat(40), file: 'docs/new name.txt', previousFile: 'docs/old name.txt' });
  await dialog.getByRole('checkbox', { name: 'Mark docs/new name.txt as reviewed', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Hide reviewed', exact: true }).check();
  await expect(dialog.getByRole('button', { name: /docs\/new name\.txt/ })).toHaveCount(0);
  await expect(dialog.getByText('1/2 files reviewed', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export review', exact: true }).click();
  const download = await downloadPromise;
  const report = await readFile((await download.path())!, 'utf8');
  expect(report).toContain(`Base commit: ${'a'.repeat(40)}`);
  expect(report).toContain('| [x] | R | "docs/new name.txt" | "docs/old name.txt" |');
  expect(report).toContain('| [ ] | M | "src/example.txt" |');
  await dialog.getByRole('searchbox', { name: 'Filter file paths…', exact: true }).fill('nothing');
  await expect(dialog.getByText('No files match these filters. Clear the path or status filter, or show reviewed files.', { exact: true })).toBeVisible();
  await dialog.getByRole('searchbox', { name: 'Filter file paths…', exact: true }).fill('');
  await expect(dialog.getByRole('button', { name: /src\/example\.txt/ })).toBeVisible();
});

test('comparison help opens the matching workflow and closes the comparison', async ({ page }) => {
  const dialog = await openComparison(page);
  await dialog.getByRole('link', { name: 'Help: Compare branches, tags or commits', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Compare commits and branches', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Compare branches, tags or commits', exact: true })).toBeVisible();
});

test('comparison applies refs explicitly and remains usable in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  const dialog = await openComparison(page);
  await dialog.getByRole('combobox', { name: 'Base', exact: true }).fill('main');
  await dialog.getByRole('radio', { name: 'Changes since common ancestor', exact: true }).check();
  await expect(dialog.getByText('Select Compare to apply the edited references or mode.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(dialog.getByText(/Changes compared from common ancestor/)).toBeVisible();
  await expect(dialog.getByText('0/2 files reviewed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  expect(calls.filter(call => call.command === 'repo_compare_commits').at(-1)?.args).toMatchObject({ base: 'main', head: 'HEAD', mode: 'merge-base' });
});

test('comparison cancellation ignores a late summary and can retry', async ({ page }) => {
  const dialog = await openComparison(page);
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let hold = true;
    (window as Window & { __RELEASE_COMPARE__?: () => void }).__RELEASE_COMPARE__ = () => { hold = false; };
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_compare_commits' && hold) {
        await new Promise<void>(resolve => {
          const poll = () => hold ? setTimeout(poll, 20) : resolve();
          poll();
        });
      }
      return original(command, args);
    };
  });
  await dialog.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => (window as Window & { __RELEASE_COMPARE__?: () => void }).__RELEASE_COMPARE__?.());
  await expect(dialog.getByText('Comparison cancelled', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2 changed files', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible();
});
