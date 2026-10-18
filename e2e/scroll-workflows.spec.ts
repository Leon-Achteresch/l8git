import { expect, test, type Page } from '@playwright/test';

async function openScene(page: Page, scene: string, scale = 1) {
  await page.addInitScript(scale => {
    localStorage.setItem('l8git-workspace-prefs', JSON.stringify({ state: { uiScale: scale }, version: 0 }));
  }, scale);
  await page.goto(`/?scene=${scene}`);
  // An opacity-zero route still counts as visible to Playwright. Wait until its
  // entrance finishes before retaining a physical row that can be recycled.
  const surface = page.locator('#main-content > div');
  await expect(surface).toBeAttached({ timeout: 15_000 });
  await expect.poll(() => surface.evaluate(node => {
    const style = getComputedStyle(node);
    return style.opacity === '1' && style.transform === 'none';
  })).toBe(true);
}

async function visibleFile(page: Page, fraction: number) {
  const files = page.getByTestId('files');
  const scroller = files.locator('.overflow-y-auto').last();
  await scroller.evaluate((node, fraction) => { node.scrollTop = (node.scrollHeight - node.clientHeight) * fraction; }, fraction);
  const buttons = files.getByRole('button', { name: /^Stage files\/file-\d{4}\.txt$/ });
  let path = '';
  await expect.poll(async () => {
    path = await buttons.evaluateAll(buttons => {
      const button = buttons.find(button => {
        const viewport = button.closest('.overflow-y-auto');
        if (!button.isConnected || !viewport) return false;
        const rect = button.getBoundingClientRect();
        const scroller = viewport.getBoundingClientRect();
        return rect.top > scroller.top + 20 && rect.bottom < scroller.bottom - 20;
      });
      return button?.getAttribute('aria-label')?.replace(/^Stage /, '') ?? '';
    });
    return path;
  }).toMatch(/^files\/file-\d{4}\.txt$/);
  return { path, button: files.getByRole('button', { name: `Stage ${path}`, exact: true }) };
}

for (const scale of [1, 1.5]) {
  test(`file menus target newly mounted rows after deep scrolling at ${scale * 100}% scale`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openScene(page, 'performance', scale);
    await expect(page.getByTestId('files').getByText('file-0000.txt', { exact: true })).toBeVisible();
    const first = await visibleFile(page, 0.7);
    await first.button.locator('..').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
    let dialog = page.getByRole('alertdialog', { name: 'Discard changes?', exact: true });
    await expect(dialog.getByText(first.path, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const second = await visibleFile(page, 0.25);
    expect(second.path).not.toBe(first.path);
    await second.button.focus();
    await second.button.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
    dialog = page.getByRole('alertdialog', { name: 'Discard changes?', exact: true });
    await expect(dialog.getByText(second.path, { exact: true })).toBeVisible();
    await expect(dialog.getByText(first.path, { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await second.button.click();
    await expect.poll(() => page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === 'stage_files').map(call => call.args?.files))).toEqual([[second.path]]);
    expect(await page.getByTestId('files').getByRole('button', { name: /^Stage files\/file-/ }).count()).toBeLessThan(80);
  });
}

test('history menus keep the current commit and its dialog alive after scrolling and menu close', async ({ page }) => {
  await openScene(page, 'performance-history');
  await expect(page.locator('[data-commit-hash]').first()).toBeVisible();
  const scroller = page.locator('[data-commit-hash]').first().locator('..').locator('..');
  const hashes: string[] = [];
  for (const fraction of [0.65, 0.2]) {
    await scroller.evaluate((node, fraction) => { node.scrollTop = (node.scrollHeight - node.clientHeight) * fraction; }, fraction);
    let hash = '';
    await expect.poll(async () => {
      hash = await page.locator('[data-commit-hash]').evaluateAll(rows => {
        const row = rows.find(row => {
          // React can unmount a pooled row between Playwright's query and this callback.
          const viewport = row.parentElement?.parentElement;
          if (!viewport) return false;
          const rect = row.getBoundingClientRect();
          const scroller = viewport.getBoundingClientRect();
          return rect.top > scroller.top + 30 && rect.bottom < scroller.bottom - 30;
        });
        return row?.getAttribute('data-commit-hash') ?? '';
      });
      return hash;
    }).toMatch(/^[a-f\d]{40}$/);
    hashes.push(hash);
    const row = page.locator(`[data-commit-hash="${hash}"]`);
    if (fraction > 0.5) await row.click({ button: 'right' });
    else { await row.focus(); await row.press('Shift+F10'); }
    await page.getByRole('menuitem', { name: 'Reset to…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset branch', exact: true });
    await expect(dialog.locator('#reset-target')).toHaveValue(hash);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(hashes[0]).not.toBe(hashes[1]);
  expect(await page.locator('[data-commit-hash]').count()).toBeLessThan(100);
});

test('history menu keyboard navigation suspends background selection and commit shortcuts', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openScene(page, 'performance-history');
  const visibleRows = page.locator('[data-commit-hash]');
  await expect(visibleRows.first()).toBeVisible();
  const hash = await visibleRows.nth(4).getAttribute('data-commit-hash');
  const row = page.locator(`[data-commit-hash="${hash}"]`);
  const subject = await row.getByText(/^Fixture commit \d+$/).textContent();
  await row.click();
  await row.focus();
  await page.evaluate(() => navigator.clipboard.writeText('preserve clipboard while menu is open'));
  await row.press('Shift+F10');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  for (const key of ['ArrowDown', 'ArrowUp', 'c', 'r', 'y', 'Control+a']) {
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="menu"]'))).toBe(true);
    await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toHaveCount(0);
  }
  await expect(page.getByRole('toolbar', { name: /commits selected/ })).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('preserve clipboard while menu is open');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(row).toBeFocused();
  await row.press('c');
  const checkout = page.getByRole('alertdialog');
  await expect(checkout).toContainText(subject!);
  await checkout.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('recycled history rows cannot retarget a held click or restore focus to a different commit', async ({ page }) => {
  await openScene(page, 'performance-history');
  const rows = page.locator('[data-commit-hash]');
  await expect(rows.first()).toBeVisible();
  const scroller = rows.first().locator('..').locator('..');
  const initialHash = await rows.nth(5).getAttribute('data-commit-hash');
  const original = page.locator(`[data-commit-hash="${initialHash}"]`);
  const originalSubject = await original.getByText(/^Fixture commit \d+$/).textContent();
  await original.click();
  // Move away from the top, where the virtual range has fewer overscan rows.
  await scroller.evaluate(node => { node.scrollTop = 3000; });
  let targetHash = '';
  await expect.poll(async () => {
    targetHash = await rows.evaluateAll(rows => {
      const target = rows.find(row => {
        const bounds = row.getBoundingClientRect();
        // A pooled row can unmount between Playwright's query and this callback.
        const viewport = row.parentElement?.parentElement?.getBoundingClientRect();
        if (!viewport) return false;
        return bounds.top > viewport.top + 60 && bounds.bottom < viewport.bottom - 30;
      });
      return target?.getAttribute('data-commit-hash') ?? '';
    });
    return targetHash;
  }).toMatch(/^[a-f\d]{40}$/);
  const target = page.locator(`[data-commit-hash="${targetHash}"]`);
  await target.evaluate(row => { row.setAttribute('data-recycled-history-probe', 'yes'); });
  const slot = page.locator('[data-recycled-history-probe="yes"]');
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error('Missing history pointer target');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  // A pooled node is reused one pool length (256 rows, src/lib/virtual-pool.ts) later.
  await scroller.evaluate(node => { node.scrollTop += 256 * 30; });
  await expect(slot).toHaveCount(1);
  await expect(slot).not.toHaveAttribute('data-commit-hash', targetHash);
  await page.mouse.up();
  await page.keyboard.press('c');
  let checkout = page.getByRole('alertdialog');
  await expect(checkout).toContainText(originalSubject!);
  await checkout.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(checkout).toHaveCount(0);

  const recycledHash = await slot.getAttribute('data-commit-hash');
  const recycledSubject = await slot.getByText(/^Fixture commit \d+$/).textContent();
  await slot.click();
  await slot.focus();
  await slot.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await scroller.evaluate(node => { node.scrollTop += 256 * 30; });
  await expect(slot).not.toHaveAttribute('data-commit-hash', recycledHash!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(slot).not.toBeFocused();
  await page.keyboard.press('c');
  checkout = page.getByRole('alertdialog');
  await expect(checkout).toContainText(recycledSubject!);
  await checkout.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('small history scrolls preserve keyboard focus on the same logical commit', async ({ page }) => {
  await openScene(page, 'performance-history');
  const rows = page.locator('[data-commit-hash]');
  await expect(rows.first()).toBeVisible();
  const scroller = rows.first().locator('..').locator('..');
  await scroller.evaluate(node => { node.scrollTop = 3000; });
  await expect.poll(async () => Number(await rows.first().getAttribute('data-index'))).toBeGreaterThan(80);
  const hash = await rows.nth(14).getAttribute('data-commit-hash');
  const commit = page.locator(`[data-commit-hash="${hash}"]`);
  await commit.focus();
  await commit.evaluate(row => { row.setAttribute('data-small-scroll-history-probe', 'yes'); });
  await scroller.evaluate(node => { node.scrollTop += 30; });
  // Pool slots follow the row index, so a one-row scroll keeps this node on its commit.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('[data-small-scroll-history-probe="yes"]')).toHaveAttribute('data-commit-hash', hash!);
  await expect(commit).toBeFocused();
  await commit.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await scroller.evaluate(node => { node.scrollTop += 30; });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(commit).toBeFocused();
  expect(await scroller.evaluate(node => node.scrollTop)).toBe(3060);
});

test('opening and closing deep commit details preserves the scrolling element and position', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openScene(page, 'performance-history');
  const rows = page.locator('[data-commit-hash]');
  await expect(rows.first()).toBeVisible();
  const scroller = rows.first().locator('..').locator('..');
  await scroller.evaluate(node => { node.scrollTop = 150_000; });
  let hash = '';
  await expect.poll(async () => {
    hash = await rows.evaluateAll(rows => {
      const target = rows.find(row => {
        const bounds = row.getBoundingClientRect();
        // A pooled row can unmount between Playwright's query and this callback.
        const viewport = row.parentElement?.parentElement?.getBoundingClientRect();
        if (!viewport) return false;
        return bounds.top > viewport.top + 100 && bounds.bottom < viewport.bottom - 30;
      });
      return target?.getAttribute('data-commit-hash') ?? '';
    });
    return hash;
  }).toMatch(/^[a-f\d]{40}$/);
  const before = await scroller.evaluate(node => {
    node.setAttribute('data-history-scroll-retained', 'yes');
    return node.scrollTop;
  });
  const commit = page.locator(`[data-commit-hash="${hash}"]`);
  await commit.click();
  const close = page.getByText('Commit details', { exact: true }).locator('../..').getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeVisible();
  const retained = page.locator('[data-history-scroll-retained="yes"]');
  await expect(retained).toHaveCount(1);
  await expect(commit).toBeInViewport();
  expect(Math.abs(await retained.evaluate(node => node.scrollTop) - before)).toBeLessThan(2);
  await close.click();
  await expect(close).toHaveCount(0);
  await expect(retained).toHaveCount(1);
  await expect(commit).toBeInViewport();
  expect(Math.abs(await retained.evaluate(node => node.scrollTop) - before)).toBeLessThan(2);
  // A responsive orientation change must retain the same history viewport too.
  await commit.click();
  await expect(close).toBeVisible();
  await page.setViewportSize({ width: 640, height: 800 });
  await expect(retained).toHaveCount(1);
  expect(await retained.evaluate(node => node.scrollTop)).toBeGreaterThan(100_000);
  await expect(close).toBeVisible();
  await close.click();
  await expect(retained).toHaveCount(1);
  expect(await retained.evaluate(node => node.scrollTop)).toBeGreaterThan(100_000);
});

test('wrapped history rows and graph geometry settle after deep scrolling and resizing at 150 percent', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await openScene(page, 'performance-history', 1.5);
  const rows = page.locator('[data-commit-hash]');
  await expect(rows.first()).toBeVisible();
  const scroller = rows.first().locator('..').locator('..');
  const checkGeometry = async () => {
    await expect.poll(() => rows.evaluateAll(rows => {
      if (rows.length < 3) return 1000;
      return Math.max(...rows.flatMap((row, index) => {
        const rect = row.getBoundingClientRect();
        const next = rows[index + 1]?.getBoundingClientRect();
        const graph = row.querySelector<SVGSVGElement>('svg[viewBox]')!;
        return [Math.abs(graph.viewBox.baseVal.height - graph.getBoundingClientRect().height),
          next ? Math.max(0, rect.bottom - next.top) : 0];
      }));
    })).toBeLessThan(1);
  };
  await checkGeometry();
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight * 0.45; });
  await expect(page.getByText('Fixture commit 0', { exact: true })).toHaveCount(0);
  await checkGeometry();
  await page.setViewportSize({ width: 1200, height: 900 });
  await checkGeometry();
  expect(await rows.count()).toBeLessThan(100);
});

test('list scrolling leaves the inbox anchor idle and first opening still focuses and positions its panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openScene(page, 'performance-history');
  const rows = page.locator('[data-commit-hash]');
  await expect(rows.first()).toBeVisible();
  const inbox = page.getByRole('button', { name: /^Inbox/ });
  await inbox.evaluate(button => {
    const anchor = button.parentElement!;
    const measure = anchor.getBoundingClientRect.bind(anchor);
    anchor.dataset.inboxAnchorReads = '0';
    anchor.getBoundingClientRect = () => {
      anchor.dataset.inboxAnchorReads = String(Number(anchor.dataset.inboxAnchorReads) + 1);
      return measure();
    };
  });
  const anchor = page.locator('[data-inbox-anchor-reads]');
  const scroll = async () => {
    await rows.first().locator('..').locator('..').evaluate(async node => {
      for (let frame = 1; frame <= 12; frame++) {
        node.scrollTop += 180;
        await new Promise(requestAnimationFrame);
      }
    });
  };
  await scroll();
  await expect(anchor).toHaveAttribute('data-inbox-anchor-reads', '0');
  await inbox.click();
  const panel = page.getByRole('dialog', { name: 'Inbox', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  const readsWhenOpen = await anchor.getAttribute('data-inbox-anchor-reads');
  await scroll();
  await expect(anchor).toHaveAttribute('data-inbox-anchor-reads', readsWhenOpen!);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => Number(await anchor.getAttribute('data-inbox-anchor-reads'))).toBeGreaterThan(Number(readsWhenOpen));
  await expect.poll(async () => {
    const bounds = await panel.boundingBox();
    return bounds ? bounds.y + bounds.height : Infinity;
  }).toBeLessThanOrEqual(720);
  await page.setViewportSize({ width: 960, height: 720 });
  const bounds = await panel.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  await panel.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(inbox).toBeVisible();
});
