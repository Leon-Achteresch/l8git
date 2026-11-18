import { expect, test, type Page } from '@playwright/test';

const commit = (page: Page) => page.getByRole('button', { name: 'Commit to main', exact: true });
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'Commit identity differs' });
const reviewed = (page: Page) => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.filter(
  ({ command }) => command === 'commit_changes_with_identity',
));
const event = (page: Page, name: string) => page.evaluate((type) => window.dispatchEvent(new Event(type)), name);

async function prepare(page: Page) {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?scene=commit-identity');
  await page.getByTestId('files').getByRole('button', { name: 'Stage all files', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Identity fixture commit');
}

test('F04 confirms exact identities and requires a new review after the native identity changes', async ({ page }) => {
  await prepare(page);
  await commit(page).click();
  await expect(dialog(page)).toContainText('Profile: Work');
  await expect(dialog(page)).toContainText('Local Author <author@example.invalid>');
  await expect(dialog(page)).toContainText('Profile Name <profile@example.invalid>');
  expect(await reviewed(page)).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await reviewed(page)).toEqual([]);
  await commit(page).click();
  await expect(dialog(page)).toBeVisible();
  await event(page, 'identity-update-effective');
  await dialog(page).getByRole('button', { name: 'Commit with this identity', exact: true }).click();
  await expect(page.getByText('The Git identity changed. Start the commit again to review the current values.').first()).toBeVisible();
  const rejected = await reviewed(page);
  expect(rejected).toHaveLength(1);
  expect(rejected?.[0].args).toMatchObject({ expectedIdentity: { author: { name: 'Local Author' } } });

  await commit(page).click();
  await expect(dialog(page)).toContainText('Updated Author <updated@example.invalid>');
  await dialog(page).getByRole('button', { name: 'Commit with this identity', exact: true }).click();
  await expect(page.getByText('Working tree clean', { exact: true })).toBeVisible();
  expect((await reviewed(page))?.at(-1)?.args).toMatchObject({
    message: 'Identity fixture commit',
    expectedIdentity: { author: { name: 'Updated Author' }, committer: { name: 'Profile Name' } },
  });
});

test('F04 invalidates a review on profile edits and transient repository switches', async ({ page }) => {
  await prepare(page);
  await commit(page).click();
  await expect(dialog(page)).toBeVisible();
  await event(page, 'identity-update-profile');
  await expect(dialog(page)).toHaveCount(0);
  await commit(page).click();
  await expect(dialog(page)).toContainText('Updated Profile <profile@example.invalid>');
  await event(page, 'identity-switch-repo');
  await expect(dialog(page)).toHaveCount(0);
  expect(await reviewed(page)).toEqual([]);
});

test('F04 applies the checked commit directly when both Git identities match', async ({ page }) => {
  await prepare(page);
  await event(page, 'identity-match-profile');
  await commit(page).click();
  await expect(page.getByText('Working tree clean', { exact: true })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(await reviewed(page)).toHaveLength(1);
});
