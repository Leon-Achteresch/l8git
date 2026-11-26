import { expect, test } from '@playwright/test';

test('change map opens a filtered untracked preview and protects the new file from a late diff', async ({ page }) => {
  await page.goto('/?scene=history-workflow&lang=en');
  const sidebar = page.getByTestId('repository-sidebar');
  await expect(sidebar).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_list_files') return ['a-old.txt', 'b-new.txt'];
      if (command === 'repo_status_paths') return [
        { path: 'b-new.txt', previous_path: 'old-name.txt', staged: true, unstaged: true, index_status: 'R', worktree_status: 'M' },
        { path: 'new/notes.tar.gz', untracked: true },
        { path: 'nested/', untracked: true, embedded_repo: true },
      ];
      if (command === 'repo_untracked_file_preview') return { text: 'preview of local notes\n', truncated: true, is_binary: false };
      if (command === 'repo_diff_preview') {
        window.__L8GIT_TEST_CALLS__!.push({ command, args });
        const req = args?.request as { file: string; kind: string };
        if (req.file === 'a-old.txt') {
          await new Promise(resolve => window.addEventListener('release-old-map', resolve, { once: true }));
          document.documentElement.dataset.oldMapReturned = 'true';
        }
        return { patch: req.kind === 'staged' ? `@@ -0,0 +1 @@\n+changed ${req.file}\n` : '', movedLines: [], binary: false, truncated: false, baseSha: null, headSha: null };
      }
      return original(command, args);
    };
  });
  const tools = sidebar.getByRole('tab', { name: 'Tools', exact: true });
  if (!await tools.isVisible()) await sidebar.getByRole('button', { name: 'More', exact: true }).click();
  await tools.click();
  const map = page.getByRole('region', { name: 'Change workflows', exact: true });
  const file = (name: string) => map.locator('button[data-row]').filter({ hasText: name });
  await file('a-old.txt').click();
  const working = map.getByRole('button', { name: 'Working-copy diff', exact: true });
  await working.click();
  const reads = () => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(c => c.command === 'repo_diff_preview').map(c => c.args?.request));
  await expect.poll(reads).toHaveLength(2);
  await file('b-new.txt').click();
  await working.click();
  await expect(map.getByText('changed b-new.txt', { exact: true })).toBeVisible();
  const paths = await reads();
  expect(paths).toContainEqual(expect.objectContaining({ kind: 'staged', file: 'b-new.txt', previousFile: 'old-name.txt' }));
  const unstaged = paths.find(r => (r as { file?: string; kind?: string }).file === 'b-new.txt' && (r as { kind?: string }).kind === 'unstaged');
  expect((unstaged as { previousFile?: string }).previousFile).toBeUndefined();
  await page.evaluate(() => window.dispatchEvent(new Event('release-old-map')));
  await expect(page.locator('html')).toHaveAttribute('data-old-map-returned', 'true');
  await expect(map.getByText('changed b-new.txt', { exact: true })).toBeVisible();
  const filter = map.getByRole('textbox', { name: /Filter.*path/i });
  await filter.fill('*.TAR.GZ');
  await file('new/notes.tar.gz').click();
  await working.click();
  await expect(map.getByText('preview of local notes', { exact: true })).toBeVisible();
  await expect(map.getByText(/up to 2,000 lines or 256 KiB/)).toBeVisible();
  expect(await reads()).toHaveLength(4);
});

test('switching PR overlays reuses working paths and refresh updates both sources', async ({ page }) => {
  await page.goto('/?scene=history-workflow&lang=en');
  const sidebar = page.getByTestId('repository-sidebar');
  await expect(sidebar).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let refreshed = false;
    window.addEventListener('change-map-files', () => { refreshed = true; });
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (!['repo_list_files', 'repo_status_paths', 'pr_list', 'pr_files', 'pr_file_patch'].includes(command)) return original(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      if (command === 'repo_list_files') return refreshed ? ['main.ts', 'later.ts'] : ['main.ts'];
      if (command === 'repo_status_paths') return [{ path: 'main.ts', previous_path: 'early.txt', index_status: 'R', worktree_status: ' ', untracked: false }];
      if (command === 'pr_list') return [{ number: 14, title: 'Update API', state: 'open' }];
      if (command === 'pr_files') return [{ path: refreshed ? 'later.ts' : 'api.ts' }];
      return null;
    };
  });
  const tools = sidebar.getByRole('tab', { name: 'Tools', exact: true });
  if (!await tools.isVisible()) await sidebar.getByRole('button', { name: 'More', exact: true }).click();
  await tools.click();
  const map = page.getByRole('region', { name: 'Change workflows', exact: true });
  const filter = map.getByRole('textbox', { name: /Filter.*path/i });
  const readCount = () => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(c => c.command === 'repo_status_paths').length);
  await expect(map.locator('button[data-row]').filter({ hasText: 'main.ts' })).toBeVisible();
  const count = await readCount();
  await filter.fill('*.TXT');
  await expect(map.getByTitle('Previously early.txt')).toHaveText('main.ts');
  await filter.fill('');
  const overlay = map.getByRole('checkbox', { name: /Update API/ });
  await overlay.check();
  await map.locator('button[data-row]').filter({ hasText: 'api.ts' }).click();
  await map.getByRole('button', { name: /Diff in .*14/ }).click();
  await expect(map.getByText('No diff available (may be binary or too large).')).toBeVisible();
  await overlay.uncheck();
  await expect(map.locator('button[data-row]').filter({ hasText: 'api.ts' })).toHaveCount(0);
  await overlay.check();
  await expect(map.locator('button[data-row]').filter({ hasText: 'api.ts' })).toBeVisible();
  expect(await readCount()).toBe(count);
  await page.evaluate(() => window.dispatchEvent(new Event('change-map-files')));
  await map.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(map.locator('button[data-row]').filter({ hasText: 'later.ts' })).toContainText('#14');
  await expect(map.locator('button[data-row]').filter({ hasText: 'api.ts' })).toHaveCount(0);
  expect(await readCount()).toBe(count + 1);
});

test('all siblings in a large change map are reachable with keyboard navigation', async ({ page }) => {
  await page.goto('/?scene=history-workflow&lang=en');
  const sidebar = page.getByTestId('repository-sidebar');
  await expect(sidebar).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_list_files') return Array.from({ length: 8000 }, (_, n) => `large/part-${String(n).padStart(4, '0')}.txt`);
      if (command === 'repo_status_paths') return [];
      return original(command, args);
    };
  });
  const tools = sidebar.getByRole('tab', { name: 'Tools', exact: true });
  if (!await tools.isVisible()) await sidebar.getByRole('button', { name: 'More', exact: true }).click();
  await tools.click();
  const map = page.getByRole('region', { name: 'Change workflows', exact: true });
  const list = map.getByRole('list', { name: 'Files and directories' });
  const directory = list.getByRole('button', { name: /large.*8000/ });
  await directory.press('Enter');
  const first = list.getByRole('button', { name: 'part-0000.txt', exact: true });
  await expect(first).toBeFocused();
  expect(await list.getByRole('button').count()).toBeLessThan(60);
  await first.press('End');
  const last = list.getByRole('button', { name: 'part-7999.txt', exact: true });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(last.locator('..')).toHaveAttribute('aria-posinset', '8000');
  await last.press('Enter');
  await expect(map.getByRole('heading', { name: 'large/part-7999.txt', exact: true })).toBeVisible();
  await last.press('PageUp');
  await expect(last).not.toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await first.press('Backspace');
  await expect(directory).toBeFocused();
});
