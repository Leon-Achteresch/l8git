import { expect, test } from '@playwright/test';

test('command log filters failures and restores all entries without clearing the log', async ({ page }) => {
  await page.goto('/?scene=performance-app&lang=en');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('command log');
  await page.getByRole('option', { name: 'Open git command log', exact: true }).click();
  await expect(page.getByText('500 commands · newest first', { exact: true })).toBeVisible();
  const filter = page.getByRole('textbox', { name: 'Command, path or status:failed', exact: true });
  await filter.fill('status:failed git status');
  await expect(page.getByText('20 commands · newest first', { exact: true })).toBeVisible();
  await expect(page.locator('code')).toHaveCount(20);
  await filter.fill('status:failed missing-command');
  await expect(page.getByText('No matches', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
  await expect(page.getByText('500 commands · newest first', { exact: true })).toBeVisible();
});

test('command log copies literal filenames and catches up after pausing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?scene=performance-app&lang=en');
  const jump = page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true });
  await jump.click();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__;
    if (!original) throw new Error('Command log fixture unavailable');
    const first = { seq: 1, repoPath: '/demo', args: ['diff', '--', "Mia's plan [v2].txt"], exitOk: true, durationMs: 4, startedAt: '2026-01-01T12:00:00Z' };
    let snapshots = 0;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'git_command_log') {
        snapshots++;
        return snapshots === 1 ? [first] : [{ ...first, seq: 2, args: ['branch', '--list'] }, first];
      }
      return original(command, args);
    };
  });
  await page.getByRole('combobox').fill('command log');
  await page.getByRole('option', { name: 'Open git command log', exact: true }).click();
  const filter = page.getByRole('textbox', { name: 'Command, path or status:failed' });
  await filter.fill("Mia's plan");
  const command = "git diff -- 'Mia'\\''s plan [v2].txt'";
  await expect(page.locator('code')).toHaveText(command);
  await page.getByRole('button', { name: 'Copy command for Bash or Zsh' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await page.getByRole('button', { name: 'Pause live updates' }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('l8git-test:git-command', {
    detail: { seq: 2, repoPath: '/demo', args: ['branch', '--list'], exitOk: true, durationMs: 2, startedAt: '' },
  })));
  await expect(page.locator('code')).toHaveCount(1);
  await page.getByRole('button', { name: 'Resume live updates' }).click();
  await expect(page.locator('code')).toHaveText(['git branch --list', command]);
  await filter.press('Escape');
  await expect(filter).toHaveCount(0);
});
