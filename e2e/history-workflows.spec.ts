import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

const PATH = '/tmp/l8git-history-fixture';
const SECONDARY_PATH = '/tmp/l8git-history-secondary';
const hash = (index: number) => (120 - index).toString(16).padStart(40, '0');
const form = (page: Page) => page.getByRole('form', { name: 'History filters', exact: true });
const row = (page: Page, index: number) => page.locator(`[data-commit-hash="${hash(index)}"]`);
const loadedStatus = (page: Page, count: number) => page.getByRole('status').filter({ hasText: new RegExp(`^${count} commit${count === 1 ? '' : 's'} loaded`) });

async function openHistory(page: Page) {
  // Keep Today/Yesterday/week headers and date shortcuts deterministic in CI.
  // Preserve native performance/rAF clocks: Motion's WAAPI timeline resets on
  // reload, while Playwright's full clock keeps its performance ticks running.
  await page.addInitScript(fixedTime => {
    const NativeDate = Date;
    window.Date = new Proxy(NativeDate, {
      construct: (target, args) => Reflect.construct(target, args.length ? args : [fixedTime]),
      apply: () => new NativeDate(fixedTime).toString(),
      get: (target, key, receiver) => key === 'now' ? () => fixedTime : Reflect.get(target, key, receiver),
    });
  }, new Date('2026-10-08T18:00:00Z').getTime());
  await page.goto('/?scene=history-workflow');
  await expect(form(page).getByRole('searchbox', { name: 'Commit message', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(row(page, 0)).toBeVisible();
}

async function applyQuery(page: Page, query: string) {
  await form(page).getByRole('searchbox', { name: 'Commit message', exact: true }).fill(query);
  await form(page).getByRole('button', { name: 'Apply', exact: true }).click();
}

async function historyCalls(page: Page) {
  return page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === 'repo_history_page'));
}

async function openSavedSearches(page: Page) {
  await form(page).getByRole('button', { name: /^Saved searches/ }).click();
  return page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'Search name', exact: true }) });
}

async function switchRepo(page: Page, name: string) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Search', exact: true });
  await palette.getByRole('combobox').fill(name);
  await palette.getByRole('option', { name: `Switch to: ${name}`, exact: true }).click();
  await expect(palette).toBeHidden();
}

test('message filters apply explicitly and find literal text in commit bodies', async ({ page }) => {
  await openHistory(page);
  const query = form(page).getByRole('searchbox', { name: 'Commit message', exact: true });
  await query.fill('PARSER [literal]');
  await query.press('ArrowDown');
  await query.press('Control+a');
  await expect(query).toBeFocused();
  expect(await historyCalls(page)).toHaveLength(0);
  await expect(page.getByRole('toolbar', { name: /commits selected/ })).toHaveCount(0);
  await form(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(loadedStatus(page, 2)).toBeVisible();
  await expect(row(page, 1)).toContainText('Document token expiry');
  await expect(row(page, 3)).toContainText('Normalize mail addresses');
  await expect(row(page, 0)).toHaveCount(0);
  expect((await historyCalls(page))[0].args).toMatchObject({ path: PATH, filter: { query: 'PARSER [literal]', refs: [] }, skip: 0, limit: 80 });
  await page.getByRole('button', { name: 'Remove Commit message filter: PARSER [literal]', exact: true }).click();
  await expect(row(page, 0)).toBeVisible();
  await expect(query).toHaveValue('');
});

test('author, Git pathspec and inclusive date filters combine and validate before applying', async ({ page }) => {
  await openHistory(page);
  await form(page).getByRole('button', { name: 'Filters', exact: true }).click();
  await form(page).getByRole('combobox', { name: 'Author', exact: true }).fill('ALICE@example.com');
  await form(page).getByRole('textbox', { name: 'File or directory', exact: true }).fill(':(glob)**/*.ts');
  await form(page).getByLabel('From date', { exact: true }).fill('2026-10-08');
  await form(page).getByLabel('Until date', { exact: true }).fill('2026-10-07');
  await expect(form(page).getByRole('alert')).toHaveText('The start date must be on or before the end date.');
  await expect(form(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  expect(await historyCalls(page)).toHaveLength(0);
  await form(page).getByLabel('From date', { exact: true }).fill('2026-10-07');
  await form(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(loadedStatus(page, 1)).toBeVisible();
  await expect(row(page, 2)).toContainText('Handle retry budgets');
  await expect(row(page, 0)).toHaveCount(0);
  await row(page, 2).click();
  await row(page, 2).focus();
  await page.keyboard.press('c');
  const checkout = page.getByRole('alertdialog');
  await expect(checkout).toContainText('Handle retry budgets');
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await checkout.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Until date filter: 2026-10-07', exact: true }).click();
  await expect(loadedStatus(page, 2)).toBeVisible();
  const calls = await historyCalls(page);
  expect(calls[0].args).toMatchObject({ filter: { author: 'ALICE@example.com', file: ':(glob)**/*.ts', since: '2026-10-07', until: '2026-10-07' } });
});

test('named searches persist branch choices, update by name and stay scoped to their repository', async ({ page }) => {
  await openHistory(page);
  await page.getByRole('button', { name: 'All branches', exact: true }).click();
  await page.getByRole('option', { name: /release\/1\.2/ }).click();
  await page.keyboard.press('Escape');
  await applyQuery(page, 'parser [literal]');
  await expect(loadedStatus(page, 1)).toBeVisible();
  let saved = await openSavedSearches(page);
  await saved.getByRole('textbox', { name: 'Search name', exact: true }).fill('Release triage');
  await saved.getByRole('button', { name: 'Save search', exact: true }).click();
  await expect(saved.getByRole('button', { name: 'Release triage', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(form(page).getByRole('searchbox', { name: 'Commit message', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(form(page).getByRole('searchbox', { name: 'Commit message', exact: true })).toHaveValue('parser [literal]');
  await expect(page.getByRole('button', { name: 'Remove branch filter: release/1.2', exact: true })).toBeVisible();
  await expect(loadedStatus(page, 1)).toBeVisible();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  saved = await openSavedSearches(page);
  await saved.getByRole('button', { name: 'Release triage', exact: true }).click();
  await expect(row(page, 3)).toBeVisible();
  await expect(row(page, 1)).toHaveCount(0);
  await applyQuery(page, 'retry budgets');
  await expect(row(page, 2)).toBeVisible();
  saved = await openSavedSearches(page);
  await saved.getByRole('textbox', { name: 'Search name', exact: true }).fill('release triage');
  await saved.getByRole('button', { name: 'Update saved search', exact: true }).click();
  await expect(saved.getByRole('button', { name: /^release triage$/i })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await switchRepo(page, 'l8git-history-secondary');
  await expect(form(page).getByRole('searchbox', { name: 'Commit message', exact: true })).toHaveValue('');
  await expect(page.getByText('Secondary repository baseline', { exact: true })).toBeVisible();
  saved = await openSavedSearches(page);
  await expect(saved.getByRole('button', { name: /^release triage$/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await switchRepo(page, 'l8git-history-fixture');
  await expect(form(page).getByRole('searchbox', { name: 'Commit message', exact: true })).toHaveValue('retry budgets');
  await expect(row(page, 2)).toBeVisible();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('l8git-history-prefs.v1')!).state.repositories);
  expect(persisted[PATH].presets).toHaveLength(1);
  expect(persisted[PATH].presets[0].filter).toMatchObject({ query: 'retry budgets', refs: ['release/1.2'] });
  expect(persisted[SECONDARY_PATH]?.presets ?? []).toEqual([]);
});

test('pagination retry retains useful matches and resumes the failed page without duplicates', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openHistory(page);
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let failed = false;
    window.__L8GIT_TEST_INVOKE__ = (command, args) => {
      if (command === 'repo_history_page' && args?.skip === 80 && !failed) {
        failed = true;
        window.__L8GIT_TEST_CALLS__!.push({ command, args });
        return Promise.reject(Error('History page temporarily unavailable'));
      }
      return original(command, args);
    };
  });
  await applyQuery(page, 'release');
  await expect(loadedStatus(page, 80)).toBeVisible();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Error: History page temporarily unavailable' })).toBeVisible();
  await expect(row(page, 0)).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(loadedStatus(page, 120)).toBeVisible();
  await expect(loadedStatus(page, 120)).toContainText('All matching commits loaded');
  await row(page, 0).focus();
  await page.keyboard.press('Control+a');
  const selected = page.getByRole('toolbar', { name: '120 commits selected', exact: true });
  await selected.getByRole('button', { name: 'Copy commit hashes', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe(Array.from({ length: 120 }, (_, index) => hash(index)).join('\n'));
  expect((await historyCalls(page)).map(call => call.args?.skip)).toEqual([0, 80, 80]);
});

test('an obsolete slow response cannot overwrite a newer filtered result', async ({ page }) => {
  await openHistory(page);
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    const testWindow = window as Window & { __RELEASE_HISTORY__?: () => void };
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_history_page' && (args?.filter as { query: string }).query === 'parser [literal]') {
        window.__L8GIT_TEST_CALLS__!.push({ command: 'history-held', args });
        await new Promise<void>(resolve => { testWindow.__RELEASE_HISTORY__ = resolve; });
      }
      return original(command, args);
    };
  });
  await applyQuery(page, 'parser [literal]');
  await expect.poll(() => page.evaluate(() => !!(window as Window & { __RELEASE_HISTORY__?: () => void }).__RELEASE_HISTORY__)).toBe(true);
  await applyQuery(page, 'retry budgets');
  await expect(loadedStatus(page, 1)).toBeVisible();
  await expect(row(page, 2)).toBeVisible();
  await page.evaluate(() => (window as Window & { __RELEASE_HISTORY__?: () => void }).__RELEASE_HISTORY__?.());
  await expect.poll(async () => (await historyCalls(page)).some(call => (call.args?.filter as { query: string }).query === 'parser [literal]')).toBe(true);
  await expect(row(page, 2)).toBeVisible();
  await expect(row(page, 1)).toHaveCount(0);
  await expect(loadedStatus(page, 1)).toBeVisible();
});

test('keyboard range selection remains visible across date-group headers and clears after filtering', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 740 });
  await openHistory(page);
  await applyQuery(page, 'release');
  await expect(loadedStatus(page, 80)).toBeVisible();
  await row(page, 0).click();
  await row(page, 0).focus();
  for (let index = 1; index <= 30; index++) await page.keyboard.press('Shift+ArrowDown');
  await expect(page.getByRole('toolbar', { name: '31 commits selected', exact: true })).toBeVisible();
  await expect(row(page, 30)).toBeInViewport({ ratio: 0.5 });
  await expect(row(page, 30)).toBeFocused();
  await applyQuery(page, 'token expiry protocol');
  await expect(loadedStatus(page, 1)).toBeVisible();
  await expect(page.getByRole('toolbar', { name: /commits selected/ })).toHaveCount(0);
  await expect(row(page, 1)).toBeVisible();
  await expect(row(page, 0)).toHaveCount(0);
});

test('draft escape and a no-match reset restore the previous useful history in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await openHistory(page);
  await applyQuery(page, 'parser [literal]');
  await expect(loadedStatus(page, 2)).toBeVisible();
  const query = form(page).getByRole('searchbox', { name: 'Commit message', exact: true });
  await query.fill('discard this draft');
  await query.press('Escape');
  await expect(query).toHaveValue('parser [literal]');
  await expect(row(page, 1)).toBeVisible();
  await applyQuery(page, 'no-such-commit-message');
  await expect(page.getByText('No commits match these filters', { exact: true })).toBeVisible();
  const empty = page.getByText('No commits match these filters', { exact: true }).locator('..').locator('..');
  await empty.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(query).toHaveValue('');
  await expect(row(page, 0)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
