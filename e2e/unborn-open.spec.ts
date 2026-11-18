import { expect, test, type Page } from '@playwright/test';

const intended = 'fixture/first';
const unbornName = `${intended} · No commit yet`;
const event = (page: Page, name: string) => page.evaluate((type) => window.dispatchEvent(new Event(type)), name);

async function holdOpen(page: Page, number: string) {
  await event(page, 'hold-unborn-open');
  await expect(page.locator('html')).toHaveAttribute('data-unborn-held', number);
}

async function releaseOpen(page: Page, number: string) {
  await event(page, 'release-unborn-open');
  await expect(page.locator('html')).toHaveAttribute('data-unborn-completed', number);
}

async function switchRepo(page: Page, name: string) {
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill(name);
  await page.getByRole('option', { name: `Switch to: ${name}`, exact: true }).click();
}

test('F63 keeps the intended branch scoped through repository switches and the first commit', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?scene=unborn-open');
  const unborn = page.getByRole('button', { name: unbornName, exact: true });
  const branch = page.getByRole('button', { name: 'Choose branch', exact: true });
  await expect(unborn).toContainText('No commit yet');
  await expect(unborn).toBeDisabled();

  await holdOpen(page, '1');
  await switchRepo(page, 'l8git-detached-fixture');
  await expect(branch).toContainText('HEAD');
  await releaseOpen(page, '1');
  await expect(unborn).toHaveCount(0);
  await expect(branch).toContainText('HEAD');

  await switchRepo(page, 'l8git-audit-fixture');
  await expect(unborn).toBeVisible();
  await page.getByTestId('files').getByRole('button', { name: 'Stage all files', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Initial fixture commit');
  await holdOpen(page, '2');
  await page.getByRole('button', { name: `Commit to ${intended}`, exact: true }).click();
  await expect(branch).toContainText(intended);
  await expect(branch).toBeEnabled();
  await releaseOpen(page, '2');
  await expect(unborn).toHaveCount(0);
  await expect(branch).toBeEnabled();
  await expect(page.getByText('Working tree clean', { exact: true })).toBeVisible();
});

test('F63 translates the missing first commit in the branch display', async ({ page }) => {
  await page.goto('/?scene=unborn-open&lang=de');
  await expect(page.getByRole('button', { name: `${intended} · Noch kein Commit`, exact: true })).toContainText('Noch kein Commit');
});
