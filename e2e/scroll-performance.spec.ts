import { expect, test, type Locator, type Page } from '@playwright/test';

// Structural guards for the scroll paths measured by scripts/benchmark-scroll.mjs.
// FPS itself is too machine-dependent for CI; these pin the causes of the regressions.

async function openScene(page: Page, scene: string) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`/?scene=${scene}`);
  await expect(page.locator('[data-commit-hash], [data-testid="files"]').first()).toBeVisible({ timeout: 15_000 });
}

async function scrollerOf(locator: Locator) {
  return locator.evaluateHandle(node => {
    let element: HTMLElement | null = node as HTMLElement;
    while (element && !(element.scrollHeight > element.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(element).overflowY))) element = element.parentElement;
    if (!element) throw new Error('No scroll container');
    return element;
  });
}

test('the inline commit diff mounts a bounded window of rows instead of Monaco', async ({ page }) => {
  await openScene(page, 'performance-inspect');
  await page.locator('[data-commit-hash]').first().click();
  const firstLine = page.getByText('computeSomething(0,', { exact: false }).first();
  await expect(firstLine).toBeVisible({ timeout: 15_000 });
  // Monaco's inline mode renders every deleted line of the 3000-line fixture eagerly.
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);
  const scroller = await scrollerOf(firstLine);
  const mountedRows = () => scroller.evaluate(node => node.querySelectorAll('[data-index]').length);
  expect(await mountedRows()).toBeLessThan(150);

  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByText('computeSomethingElse(49,', { exact: false }).last()).toBeVisible();
  expect(await mountedRows()).toBeLessThan(150);

  await page.getByRole('radio', { name: 'Side by side' }).click();
  await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15_000 });
});

test('a one-row history scroll leaves every still-visible row node on its commit', async ({ page }) => {
  await openScene(page, 'performance-history');
  const rows = page.locator('[data-commit-hash]');
  await expect(rows.first()).toBeVisible();
  const scroller = await scrollerOf(rows.first());
  await scroller.evaluate(node => { node.scrollTop = 3000; });
  await page.waitForTimeout(100);
  const tagged = await rows.evaluateAll(nodes => {
    for (const node of nodes) (node as HTMLElement & { __probe?: string }).__probe = node.getAttribute('data-commit-hash') ?? '';
    return nodes.length;
  });
  expect(tagged).toBeGreaterThan(10);

  const rowHeight = await rows.first().evaluate(node => node.getBoundingClientRect().height);
  await scroller.evaluate((node, by) => { node.scrollTop += by; }, rowHeight);
  await page.waitForTimeout(100);
  // Positional slots handed each node its neighbour's commit, re-rendering the whole window.
  // Only a row that left the window may hand its node to an entering one.
  const moved = await rows.evaluateAll(nodes => {
    const shown = new Set(nodes.map(node => node.getAttribute('data-commit-hash')));
    return nodes.filter(node => {
      const probe = (node as HTMLElement & { __probe?: string }).__probe;
      return probe !== undefined && shown.has(probe) && probe !== node.getAttribute('data-commit-hash');
    }).length;
  });
  expect(moved).toBe(0);
  // A remount of every row would leave no probes and pass the check above vacuously.
  // One row leaves (two at a fractional row boundary); the rest must be the same nodes.
  expect(await rows.evaluateAll(nodes => nodes.filter(node => (node as HTMLElement & { __probe?: string }).__probe !== undefined).length)).toBeGreaterThanOrEqual(tagged - 2);
});

test('a one-row file list scroll leaves every still-visible file row on its file', async ({ page }) => {
  await openScene(page, 'performance');
  const files = page.getByTestId('files');
  await expect(files.getByText('file-0000.txt', { exact: true })).toBeVisible();
  const slots = files.locator('[data-index]:has(button[aria-label^="Stage files/"])');
  const scroller = await scrollerOf(slots.first());
  await scroller.evaluate(node => { node.scrollTop = 4000; });
  await page.waitForTimeout(100);
  const tagged = await slots.evaluateAll(nodes => {
    for (const node of nodes) (node as HTMLElement & { __probe?: string }).__probe = node.querySelector('button[aria-label^="Stage files/"]')?.getAttribute('aria-label') ?? '';
    return nodes.length;
  });
  expect(tagged).toBeGreaterThan(5);

  const rowHeight = await slots.first().evaluate(node => node.getBoundingClientRect().height);
  await scroller.evaluate((node, by) => { node.scrollTop += by; }, rowHeight);
  await page.waitForTimeout(100);
  // Only a row that left the window may hand its node to an entering one.
  const moved = await slots.evaluateAll(nodes => {
    const label = (node: Element) => node.querySelector('button[aria-label^="Stage files/"]')?.getAttribute('aria-label') ?? '';
    const shown = new Set(nodes.map(label));
    return nodes.filter(node => {
      const probe = (node as HTMLElement & { __probe?: string }).__probe;
      return probe !== undefined && shown.has(probe) && probe !== label(node);
    }).length;
  });
  expect(moved).toBe(0);
  // A remount of every row would leave no probes and pass the check above vacuously.
  // One row leaves (two at a fractional row boundary); the rest must be the same nodes.
  expect(await slots.evaluateAll(nodes => nodes.filter(node => (node as HTMLElement & { __probe?: string }).__probe !== undefined).length)).toBeGreaterThanOrEqual(tagged - 2);
});
