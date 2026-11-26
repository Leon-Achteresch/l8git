import { expect, test, type Page } from '@playwright/test';

test('palette file search finds deep suffix matches and pages a wide explorer without another Git read', async ({ page }) => {
  await page.goto('/?scene=blame-previous&lang=en');
  const jump = page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true });
  await expect(jump).toBeVisible();
  const target = 'artifacts/old/nested/Archiv.TAR.GZ';
  await page.evaluate(target => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_list_files') {
        const state = document.documentElement.dataset;
        state.fileIndexReads = String(Number(state.fileIndexReads ?? 0) + 1);
        return [target, target, ...Array.from({ length: 8000 }, (_, i) => `file-${String(i).padStart(4, '0')}.txt`)];
      }
      return invoke(command, args);
    };
  }, target);
  await jump.click();
  await page.getByRole('combobox').fill('*.tar.gz');
  const findFiles = page.getByRole('option', { name: 'Find tracked files matching “*.tar.gz”', exact: true });
  await expect(findFiles).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-file-index-reads', /.+/);
  await findFiles.click();
  const filter = page.getByRole('textbox', { name: 'Filter files…', exact: true });
  await expect(filter).toHaveValue('*.tar.gz');
  const hit = page.getByRole('button', { name: target, exact: true });
  await expect(hit).toHaveCount(1);
  await hit.click();
  await expect(page.locator('.monaco-editor').getByText('other file content')).toBeVisible();
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  const more = page.getByRole('button', { name: 'Show more entries', exact: true });
  await expect(more).toBeVisible();
  const later = page.getByRole('button', { name: 'file-0200.txt', exact: true });
  await expect(later).toHaveCount(0);
  await more.click();
  await expect(page.getByRole('button', { name: 'file-0147.txt', exact: true })).toBeFocused();
  await expect(later).toBeVisible();
  expect(await page.getByRole('button', { name: /^file-\d+\.txt$/ }).count()).toBeLessThanOrEqual(300);
  await filter.fill('7999');
  await expect(page.getByRole('button', { name: 'file-7999.txt', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-file-index-reads', '1');
});

async function openBlame(page: Page) {
  await page.goto('/?scene=blame-previous');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('blame');
  await page.getByRole('option', { name: 'Open blame editor', exact: true }).click();
  await page.getByRole('button', { name: 'example.txt', exact: true }).click();
  await page.getByRole('button', { name: /Changed Author/ }).click();
  return page.getByRole('button', { name: 'Open previous revision' });
}

test('large blame gutters keep visible authors aligned with the editor during keyboard navigation', async ({ page }) => {
  await page.goto('/?scene=blame-previous&lang=en');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== 'repo_blame') return invoke(command, args);
      const now = Math.floor(Date.now() / 1000);
      return Array.from({ length: 5000 }, (_, index) => ({
        commit_hash: index.toString(16).padStart(40, '0'), short_hash: index.toString(16),
        author: `Author ${index + 1}`, timestamp: now - 7200, summary: `Change ${index + 1}`,
        date: '', previous: null, line_no: index + 1, content: `line ${index + 1}`,
      }));
    };
  });
  await page.getByRole('combobox').fill('blame');
  await page.getByRole('option', { name: 'Open blame editor', exact: true }).click();
  await page.getByRole('button', { name: 'example.txt', exact: true }).click();
  const editorLines = page.locator('.monaco-editor .view-lines');
  await expect(editorLines).toContainText('line 1');
  const first = page.locator('[data-blame-group="0"]');
  const last = page.locator('[data-blame-group="4999"]');
  await expect(first).toContainText('Author 1');
  expect(await page.locator('[data-blame-group]').count()).toBeLessThan(100);
  await first.press('End');
  await expect(last).toBeFocused();
  await expect(editorLines).toContainText('line 5000');
  await expect(first).toHaveCount(0);
  await last.press('ArrowUp');
  const previous = page.locator('[data-blame-group="4998"]');
  await expect(previous).toBeFocused();
  await previous.press('Tab');
  await expect(last).toBeFocused();
  await last.press('Home');
  await expect(first).toBeFocused();
  await expect(editorLines).toContainText('line 1');
  await expect(last).toHaveCount(0);
});

test('the explorer retries a failed file listing and a failed annotation without losing the filter', async ({ page }) => {
  await page.goto('/?scene=blame-previous&lang=en');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    const failures = new Set(['repo_list_files', 'repo_blame']);
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (failures.delete(command)) throw Error(`Fixture read failed (${command})`);
      return invoke(command, args);
    };
  });
  await page.getByRole('combobox').fill('example.txt');
  await page.getByRole('option', { name: 'Find tracked files matching “example.txt”', exact: true }).click();
  const indexError = page.getByRole('alert').filter({ hasText: 'Fixture read failed (repo_list_files)' });
  await expect(page.getByText('No files found.', { exact: true })).toHaveCount(0);
  await indexError.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'example.txt', exact: true }).click();
  const blameError = page.getByRole('alert').filter({ hasText: 'Fixture read failed (repo_blame)' });
  await expect(blameError).toBeVisible();
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  await blameError.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.monaco-editor').getByText('new revision content')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Filter files…', exact: true })).toHaveValue('example.txt');
});

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
