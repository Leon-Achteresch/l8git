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
