import { expect, test } from '@playwright/test';

test('F57 explains Git cleanup from the Commit panel without touching draft or Git', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/?scene=git-workflow&lang=en');
  const subject = page.getByRole('textbox', { name: 'Commit message', exact: true });
  await subject.fill('Explain Git cleanup');
  await page.getByRole('button', { name: 'Add description', exact: true }).click();
  const description = page.getByRole('textbox', { name: 'Description (optional)', exact: true });
  const draft = '# Template comment\n#123\nRefs: #123';
  await description.fill(draft);
  const before = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.length);
  const help = page.getByTitle('Suggestions are advisory and never prevent a commit.', { exact: true });
  await help.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  const cleanup = page.locator('details').filter({ hasText: 'Git message cleanup' });
  const disclosure = cleanup.locator('summary');
  await expect(cleanup).not.toHaveAttribute('open', '');
  // Navigate to the help disclosure by tabbing through the existing controls.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Commit trailer type', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Issue reference or migration explanation' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(disclosure).toBeFocused();
  await page.keyboard.press('Space');
  await expect(cleanup).toHaveAttribute('open', '');
  await expect(cleanup.getByText(/Commit and Amend pass the trimmed draft with -m/)).toBeVisible();
  await expect(cleanup.getByText(/Git uses commit.cleanup when configured/)).toBeVisible();
  await expect(cleanup.getByText(/A line written as Refs: #123 is kept/)).toBeVisible();
  await expect(cleanup.locator('code')).toHaveText(['strip', 'whitespace', 'verbatim', 'scissors']);
  await expect(cleanup.getByText(/Git hooks can also change or reject the message/)).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(cleanup).not.toHaveAttribute('open', '');
  await expect(subject).toHaveValue('Explain Git cleanup');
  await expect(description).toHaveValue(draft);
  const calls = await page.evaluate(index => window.__L8GIT_TEST_CALLS__!.slice(index), before);
  expect(calls).toEqual([]);
});
