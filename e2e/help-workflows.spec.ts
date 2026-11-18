import { test, expect } from '@playwright/test';

test('stash help explains saved staging from the real Stash tab without changing Apply or Pop', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?scene=stash-help&lang=en');
  await page.getByRole('tab', { name: 'Stash', exact: true }).click();
  const help = page.getByRole('link', { name: 'Help: Set work aside and return to it', exact: true });
  await help.click();
  const guide = page.getByRole('article', { name: 'Set work aside and return to it', exact: true });
  await expect(guide.getByText(/Keep index leaves staged changes staged when you create/)).toBeVisible();
  await expect(guide.getByText(/Git 2\.52 or later and stash\.index=true .* Apply and Pop try to restore/)).toBeVisible();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');
  const operations = () => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(
    ({ command }) => ['git_stash_apply', 'git_stash_pop', 'git_stash_push'].includes(command),
  ));
  expect(await operations()).toEqual([]);
  await guide.getByRole('button', { name: 'Open stashes', exact: true }).click();

  const row = page.getByRole('button', { name: /Staging fixture/ });
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Apply', exact: true }).click();
  const request = { path: '/tmp/l8git-audit-fixture', index: 0, expectedHash: '9'.repeat(40) };
  await expect.poll(operations).toEqual([{ command: 'git_stash_apply', args: request }]);
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  page.once('dialog', dialog => void dialog.dismiss());
  await page.getByRole('menuitem', { name: 'Pop', exact: true }).click();
  await expect(row).toBeVisible();
  expect(await operations()).toEqual([{ command: 'git_stash_apply', args: request }]);
  await row.click({ button: 'right' });
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('menuitem', { name: 'Pop', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await operations()).toEqual([
    { command: 'git_stash_apply', args: request },
    { command: 'git_stash_pop', args: request },
  ]);
});

test('help searches German workflows and checklists do not execute Git mutations', async ({ page }) => {
  await page.goto('/?scene=git-workflow&lang=de');
  await page.getByRole('link', { name: 'Hilfe & Arbeitsabläufe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hilfe & Arbeitsabläufe', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Hilfe durchsuchen', exact: true }).fill('verloren');
  const guide = page.getByRole('article', { name: 'Verlorene Commits oder Branch-Spitzen finden', exact: true });
  await expect(guide).toBeVisible();
  const before = await page.evaluate(() => window.__L8GIT_TEST_CALLS__?.length ?? 0);
  await guide.getByRole('checkbox').first().click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(guide.getByText('1 von 4 Schritten abgehakt')).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__?.slice(0) ?? []);
  expect(calls.slice(before).some(call => ['git_reset', 'commit_changes', 'commit_amend', 'git_rebase'].includes(call.command))).toBe(false);
  await guide.getByRole('button', { name: 'Checkliste zurücksetzen', exact: true }).click();
  await expect(guide.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await guide.getByRole('button', { name: 'Reflog öffnen', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hilfe & Arbeitsabläufe/ })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.some(call => call.command === 'reflog_list'))).toBe(true);
});

test('help remains usable on narrow windows and recovers from an empty search', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/?scene=app');
  await page.getByRole('link', { name: 'Help & workflows', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search help', exact: true });
  await search.fill('doesnotexist');
  await expect(page.getByText('No matching guides', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show all guides', exact: true }).click();
  await page.getByRole('combobox', { name: 'Workflow guides', exact: true }).selectOption('resolve-conflicts');
  await expect(page.getByRole('article', { name: 'Resolve a conflict and continue', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('command palette opens a workflow and returns to repository history', async ({ page }) => {
  await page.goto('/?scene=git-workflow');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('lost commit');
  await page.getByRole('option', { name: 'Find a lost commit or branch tip', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Find a lost commit or branch tip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('history');
  await page.getByRole('option', { name: 'Go to: History', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute('aria-selected', 'true');
});
