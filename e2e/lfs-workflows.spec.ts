import { test, expect } from '@playwright/test';

test('LFS status and file errors stay visible and preserve the last successful data', async ({ page }) => {
  await page.goto('/?scene=lfs');
  await expect(page.getByText('art/example.png', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    const state = { status: true, files: true };
    (window as Window & { __LFS_ERRORS__?: typeof state }).__LFS_ERRORS__ = state;
    window.__L8GIT_TEST_INVOKE__ = (command, args) => {
      if (command === 'lfs_available' && state.status) return Promise.reject(Error('LFS status temporarily unavailable'));
      if (command === 'lfs_ls_files' && state.files) return Promise.reject(Error('LFS files temporarily unavailable'));
      return original(command, args);
    };
  });
  await page.getByRole('button', { name: 'Refresh LFS status', exact: true }).click();
  const statusError = page.getByRole('alert').filter({ hasText: 'LFS status temporarily unavailable' });
  const filesError = page.getByRole('alert').filter({ hasText: 'LFS files temporarily unavailable' });
  await expect(statusError).toBeVisible();
  await expect(filesError).toBeVisible();
  await expect(page.getByText('art/example.png', { exact: true })).toBeVisible();
  await expect(page.getByText('Git LFS is not installed', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const state = (window as Window & { __LFS_ERRORS__?: { status: boolean; files: boolean } }).__LFS_ERRORS__!;
    state.status = false; state.files = false;
  });
  await statusError.getByRole('button', { name: 'Retry', exact: true }).click();
  await filesError.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(statusError).toHaveCount(0);
  await expect(filesError).toHaveCount(0);
  await expect(page.getByText('art/example.png', { exact: true })).toBeVisible();
});
