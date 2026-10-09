import { test, expect } from '@playwright/test';

test('undo requires a fresh preview after the last operation changes', async ({ page }) => {
  await page.goto('/?scene=recovery');
  await page.getByRole('button', { name: 'Activity & recovery', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Undo last operation', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Undo the last operation?', exact: true });
  await expect(dialog.getByText('main: bbbbbbb → aaaaaaa', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let rejectOnce = true;
    window.__L8GIT_TEST_INVOKE__ = (command, args) => {
      if (command === 'undo_last_operation' && rejectOnce) { rejectOnce = false; return Promise.reject(Error('__UNDO_CHANGED__')); }
      return original(command, args);
    };
  });
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The last operation changed after this preview.');
  await expect(dialog.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  expect(calls.find(call => call.command === 'undo_last_operation')?.args).toMatchObject({ expectedSnapshot: `fixture-${'b'.repeat(40)}-0` });
  await expect(page.getByTestId('files').getByText('Staged', { exact: true })).toBeVisible();
});

test('a rescued commit gets a branch without switching or resetting HEAD', async ({ page }) => {
  await page.goto('/?scene=recovery');
  await page.getByRole('button', { name: 'Activity & recovery', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open reflog', exact: true }).click();
  await page.getByRole('button', { name: 'Create rescue branch', exact: true }).nth(1).click();
  const dialog = page.getByRole('dialog', { name: 'Save this commit on a new branch', exact: true });
  await expect(dialog).toContainText('a'.repeat(40));
  await expect(dialog.getByRole('textbox', { name: 'New branch name', exact: true })).toHaveValue('rescue/aaaaaaa');
  await dialog.getByRole('textbox', { name: 'New branch name', exact: true }).fill('rescue/important-work');
  await dialog.getByRole('button', { name: 'Create rescue branch', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  expect(calls.find(call => call.command === 'branch_restore')?.args).toMatchObject({ name: 'rescue/important-work', hash: 'a'.repeat(40) });
  expect(calls.some(call => ['checkout_branch', 'git_reset', 'reset_to_reflog_entry', 'undo_last_operation'].includes(call.command))).toBe(false);
  await page.getByRole('button', { name: 'Actions for this reflog entry', exact: true }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Reset to this entry (keep changes)', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText(`Current HEAD: ${'b'.repeat(40)}`);
});

test('reflog confirmation pins both the displayed target and current HEAD', async ({ page }) => {
  await page.goto('/?scene=recovery');
  await page.getByRole('button', { name: 'Activity & recovery', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open reflog', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for this reflog entry', exact: true }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Reset to this entry (keep changes)', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Reset keeping local changes?', exact: true });
  await expect(dialog).toContainText(`Current HEAD: ${'b'.repeat(40)}`);
  await expect(dialog).toContainText(`Target commit: ${'a'.repeat(40)}`);
  await dialog.getByRole('button', { name: 'Reset (keep)', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  expect(calls.find(call => call.command === 'reset_to_reflog_entry')?.args).toMatchObject({ selector: 'HEAD@{1}', mode: 'keep', expectedHash: 'a'.repeat(40), expectedHead: 'b'.repeat(40) });
});

test('recovery shows the exact local paths protected from a hard reset', async ({ page }) => {
  await page.goto('/?scene=recovery');
  await page.getByRole('button', { name: 'Activity & recovery', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open reflog', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for this reflog entry', exact: true }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Reset to this entry (hard)', exact: true }).click();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = (command, args) => command === 'reset_to_reflog_entry'
      ? Promise.reject(Error('__RECOVERY_PATHS_BLOCK__|' + JSON.stringify(['local,name\n.txt', 'ignored/cache.bin'])))
      : original(command, args);
  });
  const dialog = page.getByRole('alertdialog', { name: 'Reset hard?', exact: true });
  await dialog.getByRole('button', { name: 'Reset hard', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Reset stopped to protect local or ignored files');
  await expect(dialog.getByRole('alert').locator('code').first()).toHaveText('local,name\n.txt');
  await expect(dialog.getByRole('alert').locator('code').nth(1)).toHaveText('ignored/cache.bin');
  await expect(dialog).toBeVisible();
});
