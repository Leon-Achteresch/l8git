import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const labels = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const hint = labels.branch.upstreamMissingLocally;

async function switchRepo(page: Page, repo: string) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill(repo);
  await page.getByRole('option', { name: `Switch to: ${repo}`, exact: true }).click();
}

test('marks only confirmed local absence and clears the marker when switching to an older payload', async ({ page }) => {
  await page.goto('/?scene=upstream-missing');
  const sidebar = page.getByTestId('repository-sidebar');
  await expect(sidebar.getByText(hint, { exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole('listitem').filter({ hasText: hint })).toContainText('main');
  await expect(sidebar.getByRole('listitem').filter({ hasText: /^2resolved$/ })).toBeVisible();
  for (const name of ['unconfigured', 'unknown']) {
    await expect(sidebar.getByRole('listitem').filter({ hasText: name })).not.toContainText(hint);
  }
  await switchRepo(page, 'l8git-upstream-legacy');
  await expect(sidebar.getByRole('listitem').filter({ hasText: /^main$/ })).toBeVisible();
  await expect(sidebar.getByText(hint, { exact: true })).toHaveCount(0);
  await switchRepo(page, 'l8git-audit-fixture');
  await expect(sidebar.getByText(hint, { exact: true })).toBeVisible();
  const writes = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(
    ({ command }) => /fetch|prune|publish|delete|set_upstream|git_push/.test(command),
  ));
  expect(writes).toEqual([]);
});

test('keeps local missing-upstream text inside the compact branch list', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('l8git-workspace-prefs', JSON.stringify({ state: { shellLayout: 'classic' }, version: 0 }));
  });
  await page.goto('/?scene=upstream-missing');
  const sidebar = page.getByTestId('repository-sidebar');
  await sidebar.getByRole('button', { name: labels.sidebar.branchPopoverTitle, exact: true }).click();
  const badge = page.getByText(hint, { exact: true });
  await expect(badge).toBeVisible();
  expect(await badge.evaluate(node => {
    const row = node.closest('li')!;
    const child = node.getBoundingClientRect();
    const parent = row.getBoundingClientRect();
    return child.right <= parent.right && child.left >= parent.left && node.scrollWidth <= node.clientWidth;
  })).toBe(true);
});
