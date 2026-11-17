import { expect, test, type Page } from '@playwright/test';

const repository = '/tmp/l8git-audit-fixture';
const submodule = 'vendor/space [lib]';
const compare = 'Compare submodule pins';
const pin = (digit: number) => String(digit).repeat(40);

test.describe.configure({ timeout: 70_000 });

async function openCommitPanel(page: Page) {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto('/?scene=submodule-pin-diff', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('files')).toBeVisible({ timeout: 50_000 });
}

const select = (page: Page, action: string, file: string) =>
  page.getByRole('button', { name: `${action} ${file}`, exact: true }).locator('..').click();
const trigger = (page: Page) => page.getByRole('button', { name: compare, exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: compare, exact: true });
const calls = (page: Page) => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(
  ({ command }) => command === 'git_submodule_pin_diff',
));

test('staged and unstaged gitlinks compare their own pins in the existing commit diff', async ({ page }) => {
  await openCommitPanel(page);
  await select(page, 'Unstage', submodule);
  expect(await calls(page)).toEqual([]);
  await trigger(page).press('Enter');
  await expect(dialog(page).getByText('reviewed content', { exact: true })).toBeVisible();
  await expect(dialog(page)).toContainText(pin(1));
  await expect(dialog(page)).toContainText(pin(2));
  await expect(dialog(page).getByRole('button', { name: /stage|discard/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();

  await select(page, 'Stage', submodule);
  await trigger(page).click();
  await expect(dialog(page).getByText('reviewed content', { exact: true })).toBeVisible();
  expect((await calls(page)).map(({ args }) => args)).toEqual([
    { path: repository, submodulePath: submodule, before: pin(1), after: pin(2) },
    { path: repository, submodulePath: submodule, before: pin(2), after: pin(3) },
  ]);
});

test('ordinary files are excluded and dirty-only gitlinks report an unchanged pin', async ({ page }) => {
  await openCommitPanel(page);
  await select(page, 'Stage', 'example.txt');
  await expect(trigger(page)).toHaveCount(0);
  await select(page, 'Stage', 'vendor/dirty');
  await trigger(page).click();
  await expect(dialog(page).getByRole('status')).toHaveText('Both sides point to the same submodule commit.');
  expect((await calls(page))[0].args).toEqual({
    path: repository, submodulePath: 'vendor/dirty', before: pin(2), after: pin(2),
  });
});

test('missing checkout and objects have distinct messages and keep the reviewed pair on retry', async ({ page }) => {
  await openCommitPanel(page);
  await select(page, 'Unstage', submodule);
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    let attempts = 0;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await invoke(command, args);
      if (command !== 'git_submodule_pin_diff') return result;
      const code = ['submodule.notInitialized', 'submodule.objectsUnavailable'][attempts++];
      if (code) {
        const params = code.endsWith('objectsUnavailable') ? { error: 'missing fixture object' } : {};
        throw new Error(`\u001fFixture\u001fl8e:${JSON.stringify({ code, params })}\u001f`);
      }
      return result;
    };
  });
  await trigger(page).click();
  const modal = dialog(page);
  await expect(modal.getByRole('alert')).toContainText('Initialize this submodule');
  await modal.getByRole('button', { name: 'Retry' }).click();
  await expect(modal.getByRole('alert')).toContainText('Required objects are missing');
  await modal.getByRole('button', { name: 'Retry' }).click();
  await expect(modal.getByText('reviewed content', { exact: true })).toBeVisible();
  const requests = await calls(page);
  expect(requests).toHaveLength(3);
  expect(requests.every(({ args }) => args?.before === pin(1) && args?.after === pin(2))).toBe(true);
});
