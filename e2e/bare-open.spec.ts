import { expect, test, type Page } from '@playwright/test';

async function switchRepo(page: Page, repo: string) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill(repo);
  await page.getByRole('option', { name: `Switch to: ${repo}`, exact: true }).click();
}

test('opens bare history through the existing repository view and preserves the older open contract', async ({ page }) => {
  await page.goto('/?scene=bare-open');
  const notice = page.getByText('This bare repository has no working copy. History and refs are available.', { exact: true });
  const sidebar = page.getByTestId('repository-sidebar');
  const history = sidebar.getByRole('tab', { name: 'History', exact: true });
  const commit = sidebar.getByRole('tab', { name: 'Commit' });
  await expect(notice).toBeVisible();
  await expect(page.getByTestId('commit-split-container')).toHaveCount(0);
  await expect(sidebar.getByRole('listitem', { name: 'main' })).toBeVisible();
  await page.getByRole('button', { name: 'Open history', exact: true }).press('Enter');
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Initial fixture', { exact: true }).first()).toBeVisible();
  await expect(notice).toBeVisible();
  await commit.click();
  await expect(page.getByRole('button', { name: 'Open history', exact: true })).toBeVisible();
  await expect(page.getByTestId('commit-split-container')).toHaveCount(0);

  await switchRepo(page, 'l8git-bare-legacy');
  await expect(notice).toHaveCount(0);
  await commit.click();
  await expect(page.getByTestId('commit-split-container')).toBeVisible();
  await switchRepo(page, 'l8git-audit-fixture');
  await expect(notice).toBeVisible();
  await expect(page.getByTestId('commit-split-container')).toHaveCount(0);
  const opens = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => call.command === 'open_repo').map(call => call.args?.path));
  expect(opens).toEqual(expect.arrayContaining(['/tmp/l8git-audit-fixture', '/tmp/l8git-bare-legacy']));
});
