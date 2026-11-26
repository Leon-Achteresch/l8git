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
      if (command === 'undo_last_operation' && rejectOnce) { rejectOnce = false; return Promise.reject(Error('\u001fThe last operation changed after this preview.\u001fl8e:{"code":"undo.changed"}\u001f')); }
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
      ? Promise.reject(Error('\u001fLocal or ignored files would be overwritten.\u001fl8e:' + JSON.stringify({ code: 'undo.pathsBlocked', params: { files: ['local,name\n.txt', 'ignored/cache.bin'] } }) + '\u001f'))
      : original(command, args);
  });
  const dialog = page.getByRole('alertdialog', { name: 'Reset hard?', exact: true });
  await dialog.getByRole('button', { name: 'Reset hard', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Reset stopped to protect local or ignored files');
  await expect(dialog.getByRole('alert').locator('code').first()).toHaveText('local,name\n.txt');
  await expect(dialog.getByRole('alert').locator('code').nth(1)).toHaveText('ignored/cache.bin');
  await expect(dialog).toBeVisible();
});

test('reflog search keeps matched entries across a failed older page and inspects the selected hash', async ({ page }) => {
  await page.goto('/?scene=recovery&lang=en');
  await page.getByRole('button', { name: 'Activity & recovery', exact: true }).click();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let failPage = true;
    const log = Array.from({ length: 68 }, (_, index) => {
      const hash = index.toString(16).padStart(40, 'f');
      const message = index === 10 || index === 64 ? `Recovered release ${index}` : `Commit ${index}`;
      return { selector: `HEAD@{${index}}`, hash, short_hash: hash.slice(-7), action: 'commit', subject: `commit: ${message}`, message, date: '2026-11-01T08:00:00Z' };
    });
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== 'reflog_list') return original(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      const skip = Number(args?.skip);
      if (skip && failPage) { failPage = false; throw Error('Older entries temporarily unavailable'); }
      return log.slice(skip, skip + Number(args?.limit));
    };
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Open reflog', exact: true }).click();
  const input = page.getByRole('searchbox', { name: 'Search loaded reflog entries' });
  await input.fill('RELEASE commit');
  const first = page.getByRole('button', { name: 'Recovered release 10', exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '1/60' })).toBeVisible();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  const error = page.getByRole('alert').filter({ hasText: 'Older entries temporarily unavailable' });
  await expect(error).toBeVisible();
  await expect(first).toBeVisible();
  await error.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2/68' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
  await input.fill('HEAD@{64}');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(c => c.command === 'repo_commit_inspect').at(-1)?.args?.commit))
    .toBe((64).toString(16).padStart(40, 'f'));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(first).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!);
  expect(calls.filter(c => c.command === 'reflog_list').map(c => c.args?.skip)).toEqual([0, 59, 59, 0]);
  expect(calls.some(c => c.command === 'reset_to_reflog_entry')).toBe(false);
});
