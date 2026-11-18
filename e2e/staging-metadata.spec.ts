import { expect, test, type Page } from '@playwright/test';

const modePatch = 'diff --git a/example.txt b/example.txt\nold mode 100644\nnew mode 100755\n';
const mixedPatch = modePatch + 'index 1111111..2222222\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-before\n+text edit\n';
const modeLabel = 'File mode changed';
const selectFile = (page: Page, action: 'Stage' | 'Unstage') =>
  page.getByRole('button', { name: `${action} example.txt`, exact: true }).locator('..').click();

async function openStaging(page: Page) {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto('/?scene=staging-metadata', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('commit-split-container')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(({ modePatch, mixedPatch }) => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await invoke(command, args);
      if (command !== 'repo_file_diff' || args?.file !== 'example.txt') return result;
      const scenario = sessionStorage.getItem('l8git-test-staging-diff');
      if (scenario === 'error') throw new Error('Fixture diff failed');
      const patch = scenario === 'empty' ? null : scenario === 'mixed' ? mixedPatch : modePatch;
      const diff = result as { staged: string | null; unstaged: string | null };
      return {
        ...diff,
        staged: diff.staged ? patch : null,
        unstaged: diff.unstaged ? patch : null,
        is_binary: scenario === 'binary',
      };
    };
  }, { modePatch, mixedPatch });
  await selectFile(page, 'Stage');
  const diff = page.getByTestId('diff');
  await diff.getByRole('button', { name: 'Reload diff', exact: true }).click();
  await expect(diff.getByText(modeLabel, { exact: true })).toBeVisible();
  return diff;
}

test('reads native-shaped mode headers in both sectors and uses only whole-file actions', async ({ page }) => {
  const diff = await openStaging(page);
  const hunks = diff.getByRole('button', { name: /^(?:stage|unstage|discard|select line)(?: |$)/i });
  await expect(diff.getByText('old mode 100644', { exact: true })).toBeVisible();
  await expect(diff.getByText('new mode 100755', { exact: true })).toBeVisible();
  await expect(hunks).toHaveCount(0);
  await diff.getByRole('button', { name: 'Reload diff', exact: true }).focus();
  await page.keyboard.press(']');
  await page.keyboard.press('s');

  await selectFile(page, 'Unstage');
  await expect(diff.getByText(modeLabel, { exact: true })).toBeVisible();
  await expect(diff.getByText('old mode 100644', { exact: true })).toBeVisible();
  await expect(diff.getByText('new mode 100755', { exact: true })).toBeVisible();
  await expect(hunks).toHaveCount(0);
  await page.getByRole('button', { name: 'Unstage example.txt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stage example.txt', exact: true })).toBeVisible();

  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(({ command }) =>
    ['stage_files', 'unstage_files', 'git_apply_reviewed_hunks', 'stage_hunk', 'unstage_hunk', 'discard_hunk'].includes(command),
  ));
  expect(calls.map(({ command, args }) => [command, args?.files])).toEqual([
    ['stage_files', ['example.txt']], ['unstage_files', ['example.txt']],
  ]);
});

test('keeps mixed text, empty, binary and failed results in their existing views', async ({ page }) => {
  const diff = await openStaging(page);
  for (const [scenario, visibleText] of [
    ['mixed', 'text edit'], ['empty', 'No changes'], ['binary', 'Binary file'], ['error', 'Could not load diff'],
  ]) {
    await page.evaluate((value) => sessionStorage.setItem('l8git-test-staging-diff', value), scenario);
    await diff.getByRole('button', { name: 'Reload diff', exact: true }).click();
    await expect(diff.getByText(visibleText, { exact: true })).toBeVisible();
    await expect(diff.getByText(modeLabel, { exact: true })).toHaveCount(0);
    if (scenario === 'mixed') await expect(diff.getByRole('button', { name: 'stage', exact: true })).toBeVisible();
  }
});
