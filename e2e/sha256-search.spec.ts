import { expect, test } from '@playwright/test';

const fullId = `${'a'.repeat(40)}1${'0'.repeat(23)}`;
const otherId = 'f'.repeat(40);
const missing = 'b'.repeat(64);

test('regular commit search focuses the full SHA-256 row and isolates delayed results by repository', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue()
    : route.abort());
  await page.goto('/?scene=sha256-search&lang=en');
  const search = page.getByRole('textbox', { name: 'Commit search', exact: true });
  const next = page.getByRole('button', { name: 'Next search match', exact: true });
  const row = page.locator(`[data-commit-hash="${fullId}"]`);
  await expect(row).toBeVisible();
  await search.fill(fullId.toUpperCase());
  await expect(page.getByTitle('1 matches', { exact: true })).toBeVisible();
  await next.click();
  await expect(row).toBeFocused();
  await row.click();
  await expect.poll(() => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.findLast(
    call => call.command === 'repo_commit_inspect',
  )?.args?.commit)).toBe(fullId);
  await search.fill('g'.repeat(64));
  await expect(page.getByTitle('0 matches', { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();

  await page.evaluate(missing => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_search_commits' && args?.query === missing) {
        const data = document.documentElement.dataset;
        await new Promise<void>(resolve => {
          window.addEventListener('release-f51', () => resolve(), { once: true });
          data.f51Held = 'yes';
        });
        data.f51Released = 'yes';
      }
      return original(command, args);
    };
  }, missing);
  await search.fill(missing);
  await expect(page.locator('html')).toHaveAttribute('data-f51-held', 'yes');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Search', exact: true });
  await palette.getByRole('combobox').fill('l8git-history-secondary');
  await palette.getByRole('option', { name: 'Switch to: l8git-history-secondary', exact: true }).click();
  await expect(search).toHaveValue('');
  const other = page.locator(`[data-commit-hash="${otherId}"]`);
  await expect(other).toBeVisible();
  await search.fill(otherId);
  await expect(page.getByTitle('1 matches', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('release-f51')));
  await expect(page.locator('html')).toHaveAttribute('data-f51-released', 'yes');
  await expect(page.getByTitle('1 matches', { exact: true })).toBeVisible();
  await next.click();
  await expect(other).toBeFocused();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => call.command === 'repo_search_commits'));
  expect(calls.some(call => call.args?.path === '/tmp/l8git-history-fixture' && call.args?.query === fullId.toUpperCase())).toBe(true);
  expect(calls.some(call => call.args?.path === '/tmp/l8git-history-secondary' && call.args?.query === otherId)).toBe(true);
});
