import { expect, test, type Page } from '@playwright/test';

async function openBlame(page: Page) {
  await page.goto('/?scene=blame-previous');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('blame');
  await page.getByRole('option', { name: 'Open blame editor', exact: true }).click();
  await page.getByRole('button', { name: 'example.txt', exact: true }).click();
  await page.getByRole('button', { name: /Changed Author/ }).click();
  return page.getByRole('button', { name: 'Open previous revision' });
}

test('opens the Git predecessor in blame and returns to the preserved working view', async ({ page }) => {
  const previous = await openBlame(page);
  await previous.press('Enter');
  await expect(page.getByText('Previous revision · bbbbbbbb')).toBeVisible();
  await expect(page.getByText('This revision opens without a mapped line.')).toBeVisible();
  await expect(page.locator('.monaco-editor').getByText('old revision content')).toBeVisible();
  await page.getByRole('button', { name: 'Back to original blame' }).click();
  await expect(page.locator('.monaco-editor').getByText('new revision content')).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => call.command === 'repo_blame'));
  expect(calls).toHaveLength(2);
  expect(calls[1].args).toMatchObject({ commit: 'b'.repeat(40), file: 'old example.txt' });
});

test('drops a delayed predecessor across an A–B–A file change and explains a root line', async ({ page }) => {
  const previous = await openBlame(page);
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const response = await base(command, args);
      if (command === 'repo_blame' && args?.commit) {
        await new Promise<void>(resolve => window.addEventListener('release-blame-previous', () => resolve(), { once: true }));
      }
      return response;
    };
  });
  await previous.click();
  await expect(page.getByRole('button', { name: 'Loading blame…' })).toBeDisabled();
  await page.getByRole('button', { name: 'other.txt', exact: true }).click();
  await page.getByRole('button', { name: /Root Author/ }).click();
  await expect(page.getByText('Git did not identify a previous file version for this line.')).toBeVisible();
  await page.getByRole('button', { name: 'example.txt', exact: true }).click();
  await expect(page.getByRole('button', { name: /Changed Author/ })).toBeVisible();
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('release-blame-previous'));
    await new Promise(requestAnimationFrame);
  });
  await expect(page.getByRole('button', { name: 'Back to original blame' })).toHaveCount(0);
  await expect(page.locator('.monaco-editor').getByText('new revision content')).toBeVisible();
});

test('keeps the current file when the predecessor cannot be read locally', async ({ page }) => {
  const previous = await openBlame(page);
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_blame' && args?.commit) throw Error('missing fixture object');
      return base(command, args);
    };
  });
  await previous.click();
  await expect(page.getByText('The previous file version could not be read locally.')).toBeVisible();
  await expect(page.locator('.monaco-editor').getByText('new revision content')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to original blame' })).toHaveCount(0);
});
