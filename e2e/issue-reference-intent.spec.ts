import { expect, test } from '@playwright/test';

test('F64 explains Refs and Closes during keyboard selection and preserves the editable trailers', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?scene=git-workflow&lang=en');

  const subject = page.getByRole('textbox', { name: 'Commit message', exact: true });
  const description = page.getByRole('textbox', { name: 'Description (optional)', exact: true });
  const help = page.getByRole('button', { name: 'Message help', exact: true });
  const trailerType = page.getByRole('button', { name: 'Commit trailer type', exact: true });
  const value = page.getByRole('textbox', { name: 'Issue reference or migration explanation', exact: true });
  const refs = page.getByRole('menuitem', { name: 'Refs', exact: true });
  const closes = page.getByRole('menuitem', { name: 'Closes', exact: true });

  await subject.fill('Explain reference handling');
  await page.getByRole('button', { name: 'Add description', exact: true }).click();
  await description.fill('Existing description.');
  const before = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.length);

  await help.press('Enter');
  await page.keyboard.press('Tab');
  await expect(trailerType).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(refs).toBeFocused();
  await expect(refs).toContainText('Reference an issue.');
  await expect(refs).toHaveAccessibleDescription('Reference an issue.');
  const closesHint = 'Request automatic issue closure. Whether the issue closes depends on the host, target branch and repository settings.';
  await expect(closes).toContainText(closesHint);
  await expect(closes).toHaveAccessibleDescription(closesHint);

  await page.keyboard.press('Enter');
  await expect(trailerType).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(value).toBeFocused();
  await value.fill('#12');
  await value.press('Enter');
  await expect(description).toHaveValue('Existing description.\n\nRefs: #12');

  await trailerType.press('ArrowDown');
  await expect(refs).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(closes).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trailerType).toHaveText('Closes');
  await expect(trailerType).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(value).toBeFocused();
  await value.fill('owner/repo#34');
  await value.press('Tab');
  const add = page.getByRole('button', { name: 'Add trailer to the description', exact: true });
  await expect(add).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(description).toHaveValue('Existing description.\n\nRefs: #12\nCloses: owner/repo#34');

  await description.press('End');
  await description.press('Backspace');
  await description.press('5');
  await expect(description).toHaveValue('Existing description.\n\nRefs: #12\nCloses: owner/repo#35');
  await expect(subject).toHaveValue('Explain reference handling');

  const calls = await page.evaluate(index => window.__L8GIT_TEST_CALLS__!.slice(index), before);
  expect(calls.filter(({ command }) =>
    /^(commit_changes|commit_amend|hub_api)|issue|git_push/.test(command),
  )).toEqual([]);
});

test('F64 shows localized intent in the narrow Commit panel', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/?scene=git-workflow&lang=de');
  await page.getByRole('button', { name: 'Nachrichtenhilfe', exact: true }).click();
  await page.getByRole('button', { name: 'Commit-Trailer-Typ', exact: true }).click();
  const refs = page.getByRole('menuitem', { name: 'Refs', exact: true });
  const closes = page.getByRole('menuitem', { name: 'Closes', exact: true });
  await expect(refs.getByText('Auf ein Issue verweisen.', { exact: true })).toBeVisible();
  await expect(closes.getByText(/hängt vom Host, vom Zielbranch und von den Repository-Einstellungen ab/)).toBeVisible();
});
