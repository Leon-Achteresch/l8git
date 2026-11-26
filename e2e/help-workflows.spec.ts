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

test('searching stashes keeps a duplicate entry selected when newer stashes shift its index', async ({ page }) => {
  await page.goto('/?scene=stash-help&lang=en');
  await page.getByRole('tab', { name: 'Stash', exact: true }).click();
  await expect(page.getByRole('button', { name: /Staging fixture/ })).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    const make = (index: number, branch: string, message: string, hash: string) => ({
      index, refname: `stash@{${index}}`, branch, subject: message, message, hash, date: '2026-09-05T12:00:00Z',
    });
    let shifted = false;
    window.addEventListener('insert-stash', () => { shifted = true; }, { once: true });
    window.__L8GIT_TEST_INVOKE__ = async (cmd, args) => {
      if (cmd === 'list_stashes') {
        const offset = Number(shifted);
        return [
          ...(shifted ? [make(0, 'main', 'new arrival', 'b'.repeat(40))] : []),
          make(offset, 'feature', 'same note', 'a'.repeat(40)),
          make(offset + 1, 'feature', 'same note', 'a'.repeat(40)),
          make(offset + 2, 'main', 'another note', 'c'.repeat(40)),
        ];
      }
      if (cmd === 'git_stash_show') {
        document.documentElement.dataset.openedStash = String(args?.index);
        return { header: 'Saved details', files: [] };
      }
      return invoke(cmd, args);
    };
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search stashes by branch, message or hash' });
  await search.fill('AAA FEATURE');
  await expect(page.getByText('2 of 3 stashes', { exact: true })).toBeVisible();
  await search.fill('unknown');
  await expect(page.getByText('No stashes match this search.')).toBeVisible();
  await search.fill('STASH@{1}');
  await search.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-opened-stash', '1');
  await expect(search).toHaveValue('STASH@{1}');
  await search.focus();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.getByRole('button', {name: /stash@\{1\} feature same note/})).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('insert-stash')));
  await page.getByRole('button', { name: 'Refresh', exact: true }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-opened-stash', '2');
  await expect(page.getByRole('button', {name: /stash@\{2\} feature same note/})).toHaveAttribute('aria-pressed', 'true');
});

test('stash images open from the pinned untracked tree or both sides of a tracked rename', async ({ page }) => {
  await page.goto('/?scene=stash-help&lang=en');
  await page.getByRole('tab', { name: 'Stash', exact: true }).click();
  const row = page.getByRole('button', { name: /Staging fixture/ });
  await expect(row).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (cmd, args) => {
      if (cmd === 'git_stash_show') return { header: 'Saved pictures', files: [
        { path: 'photo.png', additions: 0, deletions: 0, binary: true, untracked: true },
        ...Array.from({ length: 1000 }, (_, i) => ({ path: `files/notes-${i}.txt`, additions: 1, deletions: 0, binary: false })),
        { path: 'assets/current.png', previous_path: 'old/name.png', additions: 0, deletions: 0, binary: true },
      ] };
      if (cmd === 'git_stash_file_diff') return { is_binary: true, diff: null };
      if (cmd === 'repo_file_bytes_at') {
        window.__L8GIT_TEST_CALLS__!.push({ command: cmd, args });
        return { mime: 'image/png', size: 68, base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==' };
      }
      return invoke(cmd, args);
    };
  });
  await row.click();
  const photo = page.getByRole('button', { name: /photo\.png/ });
  await photo.focus();
  await page.keyboard.press('Enter');
  await expect(photo).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('In the stash', { exact: true }).first()).toBeVisible();
  const reads = () => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(c => c.command === 'repo_file_bytes_at').map(c => [c.args?.filePath, c.args?.treeish]));
  const commit = '9'.repeat(40);
  await expect.poll(reads).toEqual([['photo.png', commit + '^3']]);
  const filter = page.getByRole('searchbox', { name: 'Filter file paths…' });
  await filter.fill('does-not-exist');
  await expect(page.getByText('No matching files', { exact: true })).toBeVisible();
  await expect(page.getByText('In the stash', { exact: true }).first()).toBeVisible();
  await filter.fill('OLD/name');
  await expect(page.getByRole('status').filter({ hasText: '1/1002' })).toBeVisible();
  await expect(page.getByRole('button', { name: /current\.png/ })).toBeVisible();
  expect(await reads()).toHaveLength(1);
  await filter.press('Enter');
  await expect.poll(reads).toHaveLength(3);
  expect(await reads()).toEqual(expect.arrayContaining([['old/name.png', commit + '~1'], ['assets/current.png', commit]]));
  await filter.press('Escape');
  await expect(filter).toBeFocused();
  await expect(filter).toHaveValue('');
  await expect(page.getByText('In the stash', { exact: true }).first()).toBeVisible();
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
  await search.fill('git add -p');
  await expect(page.getByRole('article', { name: 'Create a focused commit', exact: true })).toBeVisible();
  await search.fill('git stash pop');
  await expect(page.getByRole('article', { name: 'Set work aside and return to it', exact: true })).toBeVisible();
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
