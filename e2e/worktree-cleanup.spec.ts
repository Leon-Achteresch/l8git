import { expect, test, type Page } from '@playwright/test';

const parent = '/tmp/l8git-audit-fixture';
const linked = `${parent}-linked`;
const remove = (page: Page, name = 'Remove') => page.getByRole('button', { name, exact: true });
const calls = (page: Page) => page.evaluate(() => window.__L8GIT_TEST_CALLS__!
  .filter(call => call.command === 'git_worktree_remove').map(call => call.args));
const removal = (force: boolean) => ({ path: parent, worktreePath: linked, force });

test.describe.configure({ timeout: 75_000 });

async function openWorktrees(page: Page, lang: string) {
  await page.goto(`/?scene=worktree-cleanup&lang=${lang}`);
  const sidebar = page.getByTestId('repository-sidebar');
  await sidebar.getByRole('button', { name: 'More', exact: true }).click();
  await sidebar.getByRole('tab', { name: 'Worktrees', exact: true }).click();
}

test('regular confirmation keeps the path and cancellation sends no removal', async ({ page }) => {
  await openWorktrees(page, 'en');
  await page.getByRole('button', { name: /l8git-audit-fixture-linked/ }).click();
  const confirmation = page.waitForEvent('dialog').then(async dialog => {
    const message = dialog.message();
    await dialog.dismiss();
    return message;
  });
  await remove(page).click();
  expect(await confirmation).toContain(linked);
  expect(await confirmation).toContain('Ignored untracked files are left out.');
  expect(await confirmation).toContain('outside the worktree');
  expect(await calls(page)).toEqual([]);
  await expect(remove(page)).toBeEnabled();
});

test('force is offered only after a dirty error and uses a second confirmation', async ({ page }) => {
  await openWorktrees(page, 'en');
  await page.getByRole('button', { name: /l8git-audit-fixture-linked/ }).click();
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== 'git_worktree_remove') return base(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      if (!args?.force) throw new Error('worktree contains modified or untracked files');
    };
  });
  const messages: string[] = [];
  let allowForce = false;
  page.on('dialog', async dialog => {
    messages.push(dialog.message());
    if (dialog.message().includes('(force)') && !allowForce) await dialog.dismiss();
    else await dialog.accept();
  });
  await remove(page).click();
  await expect.poll(() => messages.length).toBe(2);
  expect(messages[1]).toContain('Ignored untracked files are left out.');
  expect(await calls(page)).toEqual([removal(false)]);
  await expect(remove(page)).toBeEnabled();
  allowForce = true;
  await remove(page).click();
  await expect.poll(() => calls(page)).toEqual([removal(false), removal(false), removal(true)]);
  await expect(page.getByText(/Worktree force-removed|Worktree forcibly removed|Worktree removed \(force\)/i)).toBeVisible();
});

test('finishing a removal keeps the newly selected worktree open', async ({ page }) => {
  await openWorktrees(page, 'en');
  const rows = page.locator('[data-worktree-path]');
  await rows.nth(1).click();
  await page.evaluate(() => {
    const base = window.__L8GIT_TEST_INVOKE__;
    if (!base) throw new Error('Worktree fixture unavailable');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'git_worktree_remove') {
        document.documentElement.dataset.removalPending = 'true';
        await new Promise<void>(resolve => window.addEventListener('finish-removal', () => resolve(), { once: true }));
      }
      if (command === 'reveal_repo_folder') throw new Error('Folder is unavailable');
      return base(command, args);
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await remove(page).click();
  await expect(page.locator('html')).toHaveAttribute('data-removal-pending', 'true');
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('finish-removal')));
  await expect(page.getByText('Worktree removed.', { exact: true })).toBeVisible();
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  await expect(page.getByText(/Folder is unavailable/)).toBeVisible();
  expect(await calls(page)).toEqual([removal(false)]);
});
