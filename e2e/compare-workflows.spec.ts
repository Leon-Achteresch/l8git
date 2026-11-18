import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openComparison(page: import('@playwright/test').Page, scene = 'git-workflow') {
  await page.goto(`/?scene=${scene}`);
  return showComparison(page);
}

async function showComparison(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('compare');
  await page.getByRole('option', { name: 'Compare commits and branches', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare commits and branches', exact: true });
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test('qualified compare picks separate display names from refs and discards a late result from another repo', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  const dialog = await openComparison(page, 'compare-qualified');
  const base = dialog.getByRole('combobox', { name: 'Base', exact: true });
  const head = dialog.getByRole('combobox', { name: 'Head', exact: true });
  const calls = () => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => call.command === 'repo_compare_commits'));
  const apply = () => dialog.getByRole('button', { name: 'Compare', exact: true }).click();
  const choose = async (side: string, name: string) => {
    await dialog.getByRole('button', { name: `Choose reference for ${side}`, exact: true }).press('Enter');
    await page.getByRole('menuitemradio', { name, exact: true }).click();
  };
  expect((await calls()).at(-1)?.args?.base).toBe('refs/remotes/origin/main');
  await expect(base).toHaveValue('origin/main');
  const count = (await calls()).length;
  await choose('Base', 'release Local branch');
  await choose('Head', 'release Tag');
  expect(await calls()).toHaveLength(count);
  await expect(base).toHaveValue('release');
  await expect(head).toHaveValue('release');
  await expect(base).toHaveAttribute('title', 'refs/heads/release');
  await expect(head).toHaveAttribute('title', 'refs/tags/release');
  await apply();
  await expect.poll(async () => (await calls()).at(-1)?.args).toMatchObject({
    base: 'refs/heads/release', head: 'refs/tags/release',
  });
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export review', exact: true }).click();
  const report = await readFile((await (await download).path())!, 'utf8');
  expect(report).toContain('Base reference: "refs/heads/release"');
  expect(report).toContain('Head reference: "refs/tags/release"');
  const swap = dialog.getByRole('button', { name: 'Swap base and head', exact: true });
  await swap.click();
  await expect.poll(async () => (await calls()).at(-1)?.args).toMatchObject({
    base: 'refs/tags/release', head: 'refs/heads/release',
  });
  await swap.click();
  await expect.poll(async () => (await calls()).at(-1)?.args?.base).toBe('refs/heads/release');

  await choose('Head', 'origin/release Remote branch');
  await expect(head).toHaveValue('origin/release');
  await apply();
  await expect.poll(async () => (await calls()).at(-1)?.args?.head).toBe('refs/remotes/origin/release');
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let held = false;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== 'repo_compare_commits' || args?.base !== 'refs/heads/release') return original(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      if (!held) {
        held = true;
        throw Error('Fixture reference disappeared');
      }
      const data = document.documentElement.dataset;
      await new Promise<void>(resolve => {
        window.addEventListener('release-old-compare', () => resolve(), { once: true });
        data.oldCompareHeld = 'yes';
      });
      data.oldCompareReleased = 'yes';
      throw Error('Late result from the old repository');
    };
  });
  await dialog.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
  await expect(dialog.getByText(/Fixture reference disappeared/)).toBeVisible();
  await expect(base).toHaveAttribute('title', 'refs/heads/release');

  await base.fill('release~1');
  await head.fill('f'.repeat(40));
  await apply();
  await expect.poll(async () => (await calls()).at(-1)?.args).toMatchObject({ base: 'release~1', head: 'f'.repeat(40) });
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible();
  await choose('Base', 'release Local branch');
  await apply();
  await expect(page.locator('html')).toHaveAttribute('data-old-compare-held', 'yes');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('l8git-compare-other');
  await page.getByRole('option', { name: 'Switch to: l8git-compare-other', exact: true }).click();
  await showComparison(page);
  await page.evaluate(() => window.dispatchEvent(new Event('release-old-compare')));
  await expect(page.locator('html')).toHaveAttribute('data-old-compare-released', 'yes');
  await expect(dialog.getByText('2 changed files', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Late result from the old repository/)).toHaveCount(0);
  await expect(base).toHaveValue('HEAD~1');
  expect((await calls()).at(-1)?.args).toMatchObject({ path: '/tmp/l8git-compare-other', base: 'HEAD~1' });
  await dialog.getByRole('button', { name: 'Choose reference for Base', exact: true }).press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'main Local branch', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: /release/ })).toHaveCount(0);
});

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
