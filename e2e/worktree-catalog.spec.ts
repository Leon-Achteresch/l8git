import { expect, test, type Page } from '@playwright/test';

const linked = '/tmp/l8git-audit-fixture';
const other = '/tmp/l8git-catalog-other';
const added = 'external-added-worktree';
const late = 'late-catalog-entry';
const requests = (page: Page) => page.evaluate(() => window.__L8GIT_TEST_CALLS__!
  .filter(({ command }) => command === 'list_worktrees').map(({ args }) => args?.path));

const emit = (page: Page, path: string, count = 1) => page.evaluate(({ path, count }) => {
  for (let i = 0; i < count; i++) {
    window.dispatchEvent(new CustomEvent('l8git-test:repo-worktrees-changed', { detail: path }));
  }
}, { path, count });

const configure = (page: Page, value: string, hold = '') => page.evaluate(({ value, hold }) => {
  document.documentElement.dataset.catalogValue = value;
  document.documentElement.dataset.catalogHold = hold;
}, { value, hold });

const release = (page: Page, name: string) =>
  page.evaluate(name => window.dispatchEvent(new Event(`release-catalog-${name}`)), name);

const row = (page: Page, text: string) => page.locator('button[data-slot="list-row"]').filter({ hasText: text });
const checked = (page: Page) => page.getByText(/Worktrees checked at/);

async function openPanel(page: Page) {
  await page.goto('/?scene=worktree-catalog');
  await page.getByTestId('repository-sidebar').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('tab', { name: 'Worktrees', exact: true }).click();
  await expect(checked(page)).toBeVisible();
  await page.evaluate(linked => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const original = await invoke(command, args);
      if (command !== 'list_worktrees' || args?.path !== linked) return original;
      const data = document.documentElement.dataset;
      const { catalogHold: hold, catalogValue: value } = data;
      const list = original as { path: string }[];
      if (hold) {
        delete data.catalogHold;
        await new Promise<void>(resolve => {
          window.addEventListener(`release-catalog-${hold}`, () => resolve(), { once: true });
          data.catalogHeld = hold;
        });
        data.catalogReleased = hold;
      }
      if (value === 'fail') throw Error('Fixture list failed');
      if (!value) return list;
      return [...list, { ...list[1], path: `/tmp/${value}`, branch: value }];
    };
  }, linked);
}

async function switchRepo(page: Page, path: string) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill(path.split('/').at(-1)!);
  await page.getByRole('option', { name: `Switch to: ${path.split('/').at(-1)}`, exact: true }).click();
}

test('F05 coalesces the active catalog, preserves stale rows on failure and drops late replies', async ({ page }) => {
  await openPanel(page);
  expect(await requests(page)).toEqual([linked]);
  await emit(page, other, 24);
  expect(await requests(page)).toEqual([linked]);

  await configure(page, '', 'burst');
  await emit(page, linked);
  await expect(page.locator('html')).toHaveAttribute('data-catalog-held', 'burst');
  await configure(page, added);
  await emit(page, linked, 24);
  expect(await requests(page)).toEqual([linked, linked]);
  await release(page, 'burst');
  await expect(row(page, added)).toBeVisible();
  expect(await requests(page)).toEqual([linked, linked, linked]);

  await configure(page, 'fail');
  await emit(page, linked);
  await expect(page.getByRole('alert')).toHaveText('Could not refresh worktrees. Any displayed entries may be out of date.');
  await expect(row(page, added)).toBeVisible();
  await configure(page, added);
  await page.getByRole('button', { name: 'Refresh', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(row(page, added)).toBeVisible();
  await configure(page, '');
  await emit(page, linked);
  await expect(row(page, added)).toHaveCount(0);
  await expect(checked(page)).toBeVisible();

  await configure(page, late, 'before-switch');
  await emit(page, linked);
  await expect(page.locator('html')).toHaveAttribute('data-catalog-held', 'before-switch');
  await switchRepo(page, other);
  await expect(row(page, 'l8git-catalog-other')).toBeVisible();
  await release(page, 'before-switch');
  await expect(page.locator('html')).toHaveAttribute('data-catalog-released', 'before-switch');
  await expect(row(page, late)).toHaveCount(0);

  await configure(page, '', 'return');
  await switchRepo(page, linked);
  await expect(page.locator('html')).toHaveAttribute('data-catalog-held', 'return');
  await expect(row(page, 'l8git-audit-fixture-main')).toBeVisible();
  await expect(row(page, late)).toHaveCount(0);
  await release(page, 'return');
  await expect(checked(page)).toBeVisible();
  expect(await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(({ command }) =>
    command.startsWith('git_worktree_'),
  ))).toEqual([]);
});

test('large worktree catalogs search all entries, preserve the filter in details and copy full IDs', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPanel(page);
  const oid = '1234567' + 'c'.repeat(53) + 'beef';
  const target = 'C:\\Release\\Candidate';
  await page.evaluate(({ oid, target, linked }) => {
    const base = window.__L8GIT_TEST_INVOKE__;
    if (!base) throw new Error('Worktree fixture unavailable');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await base(command, args);
      if (command !== 'list_worktrees' || args?.path !== linked) return result;
      const rows = Array.from({ length: 1200 }, (_, i) => ({
        path: i === 0 ? '/tmp/store.git' : `/tmp/search-entry-${i}`,
        branch: i === 0 ? null : `topic/${i}`, head: i === 0 ? '' : 'abcdef0',
        is_main: i === 0, is_bare: i === 0, is_locked: false, is_prunable: false,
      }));
      return [...rows, { path: target, branch: null, head: oid.slice(0, 7), head_oid: oid,
        is_main: false, is_locked: true, is_prunable: false, lock_reason: 'Awaiting signoff' }];
    };
  }, { oid, target, linked });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const rows = page.locator('[data-worktree-path]');
  await expect(rows).toHaveCount(60);
  await expect(page.getByText('Showing 60 of 1201 matches')).toBeVisible();
  await page.getByRole('button', { name: 'Show more entries' }).press('Enter');
  await expect(rows).toHaveCount(120);
  await expect(rows.nth(60)).toBeFocused();
  const filter = page.getByRole('searchbox', { name: 'Branch, path, hash or status' });
  await filter.fill('Bare repository');
  await expect(rows).toHaveCount(1);
  await filter.press('Enter');
  await expect(page.getByText('This bare repository has no working copy. History and refs are available.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy hash', exact: true })).toHaveCount(0);
  await filter.fill('unknown');
  await expect(page.getByText('No matches', { exact: true })).toBeVisible();
  await filter.press('Escape');
  await expect(rows).toHaveCount(60);
  await filter.fill('SIGNOFF locked Beef detached');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Candidate');
  await expect(rows.first()).toContainText('C:\\Release\\');
  await filter.press('Enter');
  await expect(filter).toHaveValue('SIGNOFF locked Beef detached');
  await expect(page.getByText(oid, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy hash', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(oid);
  const copyPath = page.getByRole('button', { name: 'Copy path', exact: true });
  await copyPath.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(target);
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
    value: async () => { throw new Error('Clipboard is unavailable'); }, configurable: true,
  }));
  await copyPath.click();
  await expect(page.getByText('Copying failed', { exact: true })).toBeVisible();
  expect(await requests(page)).toEqual([linked, linked]);
  await switchRepo(page, other);
  await expect(filter).toHaveValue('');
  await expect(row(page, 'l8git-catalog-other')).toBeVisible();
  await expect(copyPath).toHaveCount(0);
});
