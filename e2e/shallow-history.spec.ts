import { expect, test, type Page } from '@playwright/test';

async function switchRepo(page: Page, repo: string) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill(repo);
  await page.getByRole('option', { name: `Switch to: ${repo}`, exact: true }).click();
}

test('shows the shallow boundary in history and recomputes it for full and legacy repositories', async ({ page }) => {
  await page.goto('/?scene=shallow-history');
  const notice = page.getByRole('status').filter({ hasText: 'Shallow history. Git stops at a local history boundary' });
  const history = page.locator('[data-commit-hash]').first();
  await expect(notice).toBeVisible();
  await expect(history).toBeVisible();

  await switchRepo(page, 'l8git-shallow-full');
  await expect(notice).toHaveCount(0);
  await expect(history).toBeVisible();
  await switchRepo(page, 'l8git-audit-fixture');
  await expect(notice).toBeVisible();
  await switchRepo(page, 'l8git-shallow-legacy');
  await expect(notice).toHaveCount(0);
  await expect(history).toBeVisible();
  await switchRepo(page, 'l8git-audit-fixture');
  await expect(notice).toBeVisible();

  await page.setViewportSize({ width: 640, height: 720 });
  await expect(notice).toBeVisible();
  await expect(history).toBeVisible();

  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!);
  expect(calls.filter(call => call.command === 'open_repo').map(call => call.args?.path)).toEqual(
    expect.arrayContaining(['/tmp/l8git-audit-fixture', '/tmp/l8git-shallow-full', '/tmp/l8git-shallow-legacy']),
  );
  expect(calls.filter(call => /fetch|deepen|clone/.test(call.command))).toEqual([]);
});
