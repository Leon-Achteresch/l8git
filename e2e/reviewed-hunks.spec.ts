import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const labels = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));

const batches = async (page: Page) => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => call.command === 'git_apply_reviewed_hunks'));
async function openHunks(page: Page) {
  await page.goto('/?scene=hunk-batch', { waitUntil: 'domcontentloaded' });
  // The actual app loads lazily; separate initial module readiness from action assertions.
  await expect(page.getByTestId('commit-split-container')).toBeVisible({ timeout: 15_000 });
  return page.getByTestId('diff');
}
async function selectFirstTwoHunks(diff: Locator) {
  for (const text of ['old change 0', 'new change 0', 'old change 1', 'new change 1']) {
    await diff.getByText(text, { exact: true }).locator('..').getByRole('button', { name: 'Select line', exact: true }).click();
  }
}

test('two selected hunks apply as one checked batch, reject a late file edit, and succeed after fresh review', async ({ page }) => {
  const diff = await openHunks(page);
  await expect(diff.getByText('new change 1', { exact: true })).toBeVisible();
  await selectFirstTwoHunks(diff);
  await expect(diff.getByRole('button', { name: 'Stage 4 lines', exact: true })).toBeVisible();
  await diff.getByRole('button', { name: 'Reload diff', exact: true }).click();
  // An unchanged snapshot preserves selected line identity across a reload.
  await expect(diff.getByRole('button', { name: 'Stage 4 lines', exact: true })).toBeVisible();
  await page.evaluate(() => { window.__L8GIT_HUNK_FIXTURE__!.revision += 1; });
  await diff.getByRole('button', { name: 'Reload diff', exact: true }).click();
  // Same text with a changed snapshot also invalidates the old line selection.
  await expect(diff.getByText('new change 1', { exact: true })).toBeVisible();
  await expect(diff.getByRole('button', { name: 'Stage 4 lines', exact: true })).toHaveCount(0);
  await selectFirstTwoHunks(diff);
  await page.evaluate(() => { window.__L8GIT_HUNK_FIXTURE__!.changeBeforeApply = true; });
  await diff.getByRole('button', { name: 'Stage 4 lines', exact: true }).click();
  await expect(page.getByText(/example\.txt.*changed after/)).toBeVisible();
  await expect(diff.getByText('new change 1', { exact: true })).toBeVisible();
  await expect(diff.getByRole('button', { name: 'Stage 4 lines', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unstage example.txt', exact: true })).toHaveCount(0);
  const rejected = await batches(page);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].args).toMatchObject({ action: 'stage', file: 'example.txt', patches: [expect.stringContaining('new change 0'), expect.stringContaining('new change 1')] });

  await selectFirstTwoHunks(diff);
  await diff.getByRole('button', { name: 'Stage 4 lines', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unstage example.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stage example.txt', exact: true }).locator('..').click();
  await expect(diff.getByText('new change 2', { exact: true })).toBeVisible();
  await expect(diff.getByText('new change 0', { exact: true })).toHaveCount(0);
  const applied = await batches(page);
  expect(applied).toHaveLength(2);
  expect(applied[1].args?.expectedFingerprint).not.toBe(applied[0].args?.expectedFingerprint);
  expect(applied[1].args?.patches).toHaveLength(2);
  const legacy = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => ['stage_hunk', 'unstage_hunk', 'discard_hunk'].includes(call.command)));
  expect(legacy).toEqual([]);
});

test('keyboard hunk staging and unstaging use the same checked batch command', async ({ page }) => {
  const diff = await openHunks(page);
  await expect(diff.getByText('new change 0', { exact: true })).toBeVisible();
  await diff.getByRole('button', { name: 'Reload diff', exact: true }).focus();
  await page.keyboard.press(']'); await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Unstage example.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unstage example.txt', exact: true }).locator('..').click();
  await expect(diff.getByRole('button', { name: 'unstage', exact: true })).toBeVisible();
  await diff.getByRole('button', { name: 'Reload diff', exact: true }).focus();
  await page.keyboard.press(']'); await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Unstage example.txt', exact: true })).toHaveCount(0);
  const calls = await batches(page);
  expect(calls.map(call => call.args?.action)).toEqual(['stage', 'unstage']);
  expect(calls.every(call => (call.args?.patches as string[]).length === 1 && typeof call.args?.expectedFingerprint === 'string')).toBe(true);
});

test('discard confirmation keeps the original reviewed token when the diff refreshes behind it', async ({ page }) => {
  const diff = await openHunks(page);
  await expect(diff.getByText('new change 1', { exact: true })).toBeVisible();
  await selectFirstTwoHunks(diff);
  await diff.getByRole('button', { name: 'Discard 4 lines', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('example.txt');
  await page.evaluate(() => { window.__L8GIT_HUNK_FIXTURE__!.revision += 1; });
  // Refresh through the existing header control while the modal retains its captured plan.
  await diff.locator('button[aria-label="Reload diff"]').evaluate((button: HTMLButtonElement) => button.click());
  await expect(diff.getByRole('status', { name: labels.diff.loading, exact: true, includeHidden: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByText(/example\.txt.*changed after/)).toBeVisible();
  await expect(diff.getByText('new change 0', { exact: true })).toBeVisible();
  const calls = await batches(page);
  expect(calls).toHaveLength(1);
  expect(calls[0].args?.action).toBe('discard');
  await selectFirstTwoHunks(diff);
  await diff.getByRole('button', { name: 'Discard 4 lines', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(diff.getByText('new change 2', { exact: true })).toBeVisible();
  await expect(diff.getByText('new change 0', { exact: true })).toHaveCount(0);
  const retry = await batches(page);
  expect(retry).toHaveLength(2);
  expect(retry[1].args?.expectedFingerprint).not.toBe(retry[0].args?.expectedFingerprint);
});

test('a captured discard still runs while a background diff read is pending', async ({ page }) => {
  const diff = await openHunks(page);
  await expect(diff.getByText('new change 1', { exact: true })).toBeVisible();
  await selectFirstTwoHunks(diff);
  await diff.getByRole('button', { name: 'Discard 4 lines', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('example.txt');
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    const control = { started: false, release: () => {} };
    (window as Window & { __HUNK_PENDING__: typeof control }).__HUNK_PENDING__ = control;
    let hold = true;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_file_diff' && hold) {
        hold = false; control.started = true;
        await new Promise<void>(resolve => { control.release = resolve; });
      }
      return original(command, args);
    };
  });
  await diff.locator('button[aria-label="Reload diff"]').evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => page.evaluate(() => (window as Window & { __HUNK_PENDING__: { started: boolean } }).__HUNK_PENDING__.started)).toBe(true);
  await expect(diff.getByRole('status', { name: labels.diff.loading, exact: true, includeHidden: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await batches(page)).length).toBe(1);
  await page.evaluate(() => { (window as Window & { __HUNK_PENDING__: { release: () => void } }).__HUNK_PENDING__.release(); });
  await expect(diff.getByText('new change 2', { exact: true })).toBeVisible();
  await expect(diff.getByText('new change 0', { exact: true })).toHaveCount(0);
  const calls = await batches(page);
  expect(calls[0].args).toMatchObject({ action: 'discard', patches: [expect.stringContaining('old change 0'), expect.stringContaining('old change 1')] });
});
