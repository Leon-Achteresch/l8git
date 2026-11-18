import { expect, test, type Page } from '@playwright/test';

const FIXTURE_PATH = '/tmp/l8git-audit-fixture';
const SUBMODULE_PATH = 'vendor/space [lib]';
const CHILD_REPO_PATH = `/private${FIXTURE_PATH}/${SUBMODULE_PATH}`;

test.describe.configure({ timeout: 60_000 });

async function openSubmodules(page: Page) {
  await page.goto('/?scene=submodules');
  await page.getByTestId('repository-sidebar').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('tab', { name: 'Submodules', exact: true }).click();
  await expect(page.getByRole('button', { name: /space \[lib\]/ })).toBeVisible();
}

const repoTab = (page: Page, path: string) => page.locator(`[data-repo-path="${path}"]`);
const openButton = (page: Page) => page.getByRole('button', { name: 'Open repository', exact: true });
const selectLibrary = (page: Page) => page.getByRole('button', { name: /space \[lib\]/ }).press('Enter');
const selectMissing = (page: Page) => page.getByRole('button', { name: /^missing vendor/ }).press('Enter');
const repoCalls = (page: Page) => page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(
  ({ command }) => command === 'open_submodule_repo' || command === 'open_repo' || command.startsWith('git_submodule_'),
));

test('a keyboard-selected checkout opens the backend canonical path in the usual repo tabs', async ({ page }) => {
  await openSubmodules(page);
  await selectLibrary(page);
  expect((await repoCalls(page)).filter(({ command }) => command === 'open_submodule_repo')).toEqual([]);
  await openButton(page).press('Enter');

  await expect(repoTab(page, CHILD_REPO_PATH)).toHaveAttribute('data-active', 'true');
  await expect(repoTab(page, FIXTURE_PATH)).toBeAttached();
  const calls = await repoCalls(page);
  expect(calls.filter(({ command }) => command === 'open_submodule_repo')).toEqual([{
    command: 'open_submodule_repo',
    args: { path: FIXTURE_PATH, submodulePath: SUBMODULE_PATH, hideT3Checkpoints: expect.any(Boolean) },
  }]);
  expect(calls.some(({ command }) => command.startsWith('git_submodule_'))).toBe(false);
  expect(calls.some(({ command, args }) => command === 'open_repo' && args?.path !== FIXTURE_PATH && args?.path !== CHILD_REPO_PATH)).toBe(false);
});

test('uninitialized modules stay unavailable and a later validation failure can be retried', async ({ page }) => {
  await openSubmodules(page);
  await selectMissing(page);
  await expect(openButton(page)).toBeDisabled();
  await expect(page.getByText('Initialize this submodule before opening its repository.')).toBeVisible();
  await expect(repoTab(page, CHILD_REPO_PATH)).toHaveCount(0);
  expect((await repoCalls(page)).filter(({ command }) => command === 'open_submodule_repo')).toEqual([]);

  await selectLibrary(page);
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    let fail = true;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const value = await invoke(command, args);
      if (command === 'open_submodule_repo' && fail) {
        fail = false;
        throw new Error('The checkout could not be verified.');
      }
      return value;
    };
  });
  await openButton(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The checkout could not be verified.' })).toBeVisible();
  await expect(repoTab(page, FIXTURE_PATH)).toHaveAttribute('data-active', 'true');
  await expect(repoTab(page, CHILD_REPO_PATH)).toHaveCount(0);
  await openButton(page).click();
  await expect(repoTab(page, CHILD_REPO_PATH)).toHaveAttribute('data-active', 'true');
});

test('changing selection while opening prevents a late reply from opening a tab', async ({ page }) => {
  await openSubmodules(page);
  await selectLibrary(page);
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const pending = invoke(command, args);
      if (command === 'open_submodule_repo') {
        await new Promise<void>(resolve => window.addEventListener('release-submodule-open', () => resolve(), { once: true }));
      }
      return pending;
    };
  });
  await openButton(page).click();
  await expect(page.getByRole('button', { name: 'Opening repository…', exact: true })).toBeDisabled();
  await selectMissing(page);
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('release-submodule-open'));
    // A new rendering frame lets the invoke and store continuations run first.
    await new Promise(requestAnimationFrame);
  });
  await expect(openButton(page)).toBeDisabled();
  await expect(repoTab(page, FIXTURE_PATH)).toHaveAttribute('data-active', 'true');
  await expect(repoTab(page, CHILD_REPO_PATH)).toHaveCount(0);
});

test('F60 explains URL sync without mutation and keeps single and bulk sync explicit', async ({ page }) => {
  await openSubmodules(page);
  const mutating = async () => (await repoCalls(page)).filter(({ command }) => command.startsWith('git_submodule_'));
  const help = page.getByRole('link', { name: 'Help: Update a submodule deliberately', exact: true });
  await help.focus();
  await expect(help).toBeFocused();
  await page.keyboard.press('Enter');
  const guide = page.getByRole('article', { name: 'Update a submodule deliberately', exact: true });
  await expect(guide.getByText(/update its checkout to the version recorded by the parent repository/)).toBeVisible();
  await expect(guide.getByText(/Sync copies the versioned URL from .gitmodules into the local configuration of initialized submodules/)).toBeVisible();
  await expect(guide.getByText(/overwrite an intentional local URL override/)).toBeVisible();
  await expect(guide).not.toContainText(FIXTURE_PATH);
  await expect(guide).not.toContainText('example.com');
  expect(await mutating()).toEqual([]);

  await guide.getByRole('button', { name: 'Open submodules', exact: true }).press('Enter');
  await page.getByRole('button', { name: /space \[lib\]/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Sync URL', exact: true }).click();
  await expect.poll(mutating).toEqual([{
    command: 'git_submodule_sync',
    args: { path: FIXTURE_PATH, submodulePath: SUBMODULE_PATH },
  }]);
  await page.getByRole('button', { name: 'Sync', exact: true }).press('Enter');
  await expect.poll(mutating).toEqual([
    { command: 'git_submodule_sync', args: { path: FIXTURE_PATH, submodulePath: SUBMODULE_PATH } },
    { command: 'git_submodule_sync', args: { path: FIXTURE_PATH, submodulePath: null } },
  ]);
});
