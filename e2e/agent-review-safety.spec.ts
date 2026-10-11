import { test, expect } from '@playwright/test';
import french from '../src/locales/fr.json' with { type: 'json' };
import german from '../src/locales/de.json' with { type: 'json' };

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/?scene=review');
  await expect(page.getByRole('button', { name: 'Discard file', exact: true })).toBeEnabled({ timeout: 20_000 });
}

test('whole-file session discard forwards the displayed base and fingerprint in one mutation', async ({ page }) => {
  await ready(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Discard file', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === 'agent_review_discard_change').length)).toBe(1);
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  const preview = calls.find(call => call.command === 'agent_review_file_diff');
  expect(preview?.args).toMatchObject({ mergeBase: 'a'.repeat(40), file: 'example.txt' });
  expect(calls.find(call => call.command === 'agent_review_discard_change')?.args).toMatchObject({
    worktreePath: '/tmp/l8git-audit-fixture', mergeBase: 'a'.repeat(40), file: 'example.txt', patch: null,
    expectedFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(calls.some(call => ['git_discard_files', 'git_restore_files_at_commit'].includes(call.command))).toBe(false);
});

test('binary file changes require a fresh review before any destructive command', async ({ page }) => {
  await page.addInitScript(() => {
    let original: Window['__L8GIT_TEST_INVOKE__'];
    let changed = false;
    Object.defineProperty(window, '__CHANGE_REVIEW_BINARY__', { value: () => { changed = true; } });
    Object.defineProperty(window, '__L8GIT_TEST_INVOKE__', {
      configurable: true,
      get: () => async (command: string, args?: Record<string, unknown>) => {
        const result = await original!(command, args);
        return command === 'agent_review_file_diff' ? {
          diff: null, untrackedPlain: null, isBinary: true, fingerprint: changed ? 'review-v1:new' : 'review-v1:old',
        } : result;
      },
      set: value => { original = value; },
    });
  });
  await ready(page);
  await expect(page.getByText('Binary file – no text diff available.', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as Window & { __CHANGE_REVIEW_BINARY__: () => void }).__CHANGE_REVIEW_BINARY__());
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Discard file', exact: true }).click();
  await expect(page.getByText('The displayed changes changed while this action was open. Refresh the review before discarding.', { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  expect(calls.filter(call => call.command === 'agent_review_file_diff')).toHaveLength(2);
  expect(calls.some(call => ['agent_review_discard_change', 'git_discard_files', 'git_restore_files_at_commit'].includes(call.command))).toBe(false);
});

for (const width of [1280, 640]) {
  test(`French review keeps file and hunk actions within the dialog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/?scene=review&lang=fr');
    const review = page.getByRole('dialog', { name: 'Revue de session', exact: true });
    const discard = review.getByRole('button', { name: 'Abandonner le fichier', exact: true });
    await expect(discard).toBeEnabled({ timeout: 20_000 });
    await expect.poll(() => review.evaluate(dialog => {
      const rect = dialog.getBoundingClientRect();
      const actions = [...dialog.querySelectorAll('button')].filter(button => /^Conserver|^Abandonner/.test(button.textContent ?? ''));
      return {
        width: rect.width,
        fits: actions.length === 4 && actions.every(button => {
          const bounds = button.getBoundingClientRect();
          return bounds.left >= rect.left && bounds.right <= rect.right && bounds.top >= rect.top && bounds.bottom <= rect.bottom;
        }),
        overflow: dialog.scrollWidth - dialog.clientWidth,
      };
    })).toMatchObject({ width: expect.any(Number), fits: true, overflow: 0 });
    const bounds = await review.boundingBox();
    expect(bounds!.width).toBeGreaterThan(width >= 1000 ? 1000 : 550);
    expect(bounds!.width).toBeLessThanOrEqual(width);
  });
}

for (const { language, labels } of [{ language: 'fr', labels: french }, { language: 'de', labels: german }]) {
  for (const longBranches of [false, true]) {
    test(`${language} scaled finish keeps its title and close action visible while ${longBranches ? 'long branch names and steps' : 'steps'} scroll`, async ({ page }) => {
      const sessionBranch = `agents/${'agent-session-branch-'.repeat(5)}${'s'.repeat(64)}`;
      const baseBranch = `release/${'base-branch-'.repeat(5)}${'b'.repeat(64)}`;
      if (longBranches) await page.addInitScript(({ sessionBranch, baseBranch }) => {
        let original: Window['__L8GIT_TEST_INVOKE__'];
        Object.defineProperty(window, '__L8GIT_TEST_INVOKE__', {
          configurable: true,
          get: () => async (command: string, args?: Record<string, unknown>) => {
            const result = await original!(command, args);
            if (command === 'agent_review_summary') return { ...(result as Record<string, unknown>), sessionBranch, baseBranch };
            if (command === 'list_worktrees') return (result as Record<string, unknown>[]).map(entry => ({ ...entry, branch: entry.is_main ? baseBranch : sessionBranch }));
            return result;
          },
          set: value => { original = value; },
        });
      }, { sessionBranch, baseBranch });
      await page.setViewportSize({ width: 640, height: 560 });
      await page.goto(`/?scene=review&lang=${language}`);
      await expect(page.getByRole('button', { name: labels.agentReview.finish, exact: true })).toBeEnabled({ timeout: 20_000 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });
      await page.getByRole('button', { name: labels.agentReview.finish, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: labels.agentReview.finishTitle, exact: true });
      const body = dialog.getByRole('region', { name: labels.agentReview.finishTitle, exact: true });
      const title = dialog.getByRole('heading', { name: labels.agentReview.finishTitle, exact: true });
      const close = dialog.locator('[data-slot="dialog-footer"]').getByRole('button', { name: labels.agentReview.close, exact: true });
      const cleanup = body.getByRole('button', { name: labels.agentReview.runCleanup, exact: true });
      await expect(body).toBeVisible();
      await expect.poll(() => dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const header = element.querySelector('[data-slot="dialog-header"]')!.getBoundingClientRect();
        const footer = element.querySelector('[data-slot="dialog-footer"]')!.getBoundingClientRect();
        const region = element.querySelector('[role="region"]')!;
        const style = getComputedStyle(element);
        const transform = new DOMMatrixReadOnly(style.transform);
        return {
          fits: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
          headerFits: header.top >= rect.top && header.bottom <= rect.bottom,
          footerFits: footer.top >= rect.top && footer.bottom <= rect.bottom,
          stepsScroll: region.scrollHeight > region.clientHeight,
          horizontalOverflow: Math.max(element.scrollWidth - element.clientWidth, region.scrollWidth - region.clientWidth),
          settled: transform.a === 1 && transform.d === 1 && style.opacity === '1',
        };
      })).toEqual({ fits: true, headerFits: true, footerFits: true, stepsScroll: true, horizontalOverflow: 0, settled: true });
      if (longBranches) {
        const description = body.locator('[data-slot="dialog-description"]');
        await expect(description).toContainText(sessionBranch);
        await expect(description).toContainText(baseBranch);
        expect(await dialog.getAttribute('aria-describedby')).toBe(await description.getAttribute('id'));
      }
      const before = { title: await title.boundingBox(), close: await close.boundingBox() };
      await body.focus();
      await page.keyboard.press('End');
      await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await expect.poll(async () => {
        const [region, button] = await Promise.all([body.boundingBox(), cleanup.boundingBox()]);
        return !!region && !!button && button.y >= region.y && button.y + button.height <= region.y + region.height;
      }).toBe(true);
      const after = { title: await title.boundingBox(), close: await close.boundingBox() };
      expect(after.title!.y).toBeCloseTo(before.title!.y, 1);
      expect(after.close!.y).toBeCloseTo(before.close!.y, 1);
      await close.click();
      await expect(dialog).not.toBeVisible();
      expect(await page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? []).some(call => ['agent_review_commit_checked', 'git_merge', 'git_worktree_remove_checked', 'agent_review_delete_branch_checked'].includes(call.command)))).toBe(false);
    });
  }
}
