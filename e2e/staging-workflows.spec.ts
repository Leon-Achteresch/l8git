import { test, expect, type Page } from '@playwright/test';

async function previewDiscard(page: Page, name = 'Stage first.txt') {
  await page.getByRole('button', { name, exact: true }).locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Discard changes?', exact: true });
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeEnabled();
  return dialog;
}

test('partially staged file actions follow the section that was clicked', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  await page.getByRole('button', { name: 'Unstage first.txt', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.filter(call => call.command === 'unstage_files').at(-1)?.args?.files)).toEqual(['first.txt']);
  await expect(page.getByRole('button', { name: 'Unstage first.txt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unstage second.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stage second.txt', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.filter(call => call.command === 'stage_files').at(-1)?.args?.files)).toEqual(['second.txt']);
  await expect(page.getByRole('button', { name: 'Stage second.txt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stage third.txt', exact: true })).toBeVisible();
});

test('discarding the unstaged version preserves the reviewed index snapshot', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  const dialog = await previewDiscard(page);
  await expect(dialog).toContainText('Discard working tree changes; keep staged changes');
  await dialog.getByRole('checkbox', { name: 'Include first.txt in discard', exact: true }).uncheck();
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Include first.txt in discard', exact: true }).check();
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unstage first.txt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stage first.txt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stage second.txt', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  const discard = calls.find(call => call.command === 'git_discard_worktree_changes');
  expect(discard?.args).toMatchObject({ files: ['first.txt'], untracked: [false] });
  expect(discard?.args?.expectedFingerprints).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
  expect(calls.some(call => call.command === 'git_discard_files')).toBe(false);
});

test('changed file contents require refreshing and reviewing the discard preview', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  const dialog = await previewDiscard(page);
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let changed = true;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await original(command, args);
      if (command === 'repo_file_diff' && args?.includeFingerprint && changed) {
        changed = false;
        return { ...(result as object), fingerprint: 'f'.repeat(64) };
      }
      return result;
    };
  });
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('These files changed since the preview: first.txt.');
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__L8GIT_TEST_CALLS__?.some(call => call.command.startsWith('git_discard')))).toBe(false);
  await dialog.getByRole('button', { name: 'Refresh preview', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('a backend file race is visible and keeps the discard dialog open', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  const dialog = await previewDiscard(page, 'Unstage first.txt');
  await expect(dialog).toContainText('Discard staged and working tree changes');
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = (command, args) => command === 'git_discard_files'
      ? Promise.reject(Error('__FILE_CHANGED__|first.txt')) : original(command, args);
  });
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('first.txt');
  await expect(dialog.getByRole('button', { name: 'Refresh preview', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unstage first.txt', exact: true })).toBeVisible();
});
