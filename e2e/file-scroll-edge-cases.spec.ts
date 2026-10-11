import { expect, test, type Page } from '@playwright/test';

async function openFiles(page: Page, scale = 1) {
  await page.addInitScript(scale => {
    localStorage.setItem('l8git-workspace-prefs', JSON.stringify({ state: { uiScale: scale }, version: 0 }));
  }, scale);
  await page.goto('/?scene=performance');
  await expect(page.getByTestId('files').getByText('file-0000.txt', { exact: true })).toBeVisible();
  // A mounted row can satisfy visibility while the route's entrance is still
  // transparent and translating. Capture gesture targets after that surface settles.
  await expect.poll(() => page.locator('#main-content > div').evaluate(node => {
    const style = getComputedStyle(node);
    return style.opacity === '1' && style.transform === 'none';
  })).toBe(true);
}

async function recyclableFile(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openFiles(page);
  const files = page.getByTestId('files');
  const scroller = files.locator('.overflow-y-auto').last();
  const height = await files.locator('[data-change-row-id]').first().evaluate(node => node.getBoundingClientRect().height);
  // Begin away from the list boundary so overscan is symmetric before and after
  // the jump; the same DOM slot then stays under the same pointer coordinates.
  await scroller.evaluate((node, height) => { node.scrollTop = 100 * height; }, height);
  const path = 'files/file-0105.txt';
  const button = files.getByRole('button', { name: `Stage ${path}`, exact: true });
  await expect(button).toBeVisible();
  const element = await button.elementHandle();
  if (!element) throw new Error('Missing recyclable checkbox');
  return {
    files, scroller, button, element, path, height,
    recycle: async () => {
      await scroller.evaluate((node, height) => { node.scrollTop += 64 * height; }, height);
      await expect.poll(() => element.evaluate((node, path) => node.isConnected && node.getAttribute('aria-label') !== `Stage ${path}`, path)).toBe(true);
      const nextPath = (await element.getAttribute('aria-label'))?.replace(/^Stage /, '') ?? '';
      expect(nextPath).toMatch(/^files\/file-\d{4}\.txt$/);
      expect(nextPath).not.toBe(path);
      return nextPath;
    },
  };
}

async function stagedPaths(page: Page) {
  return page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === 'stage_files').map(call => call.args?.files));
}

test('70 percent rows retain complete checkbox glyphs and do not overlap after deep scrolling', async ({ page }) => {
  await openFiles(page, 0.7);
  const files = page.getByTestId('files');
  await files.locator('.overflow-y-auto').last().evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(files.getByText('file-0999.txt', { exact: true })).toBeVisible();
  expect(await files.locator('[data-change-row-id]').evaluateAll(rows => {
    return Math.max(...rows.flatMap((row, index) => {
      const rect = row.getBoundingClientRect();
      const glyph = row.querySelector('button svg')!.getBoundingClientRect();
      const next = rows[index + 1]?.getBoundingClientRect();
      return [Math.max(0, rect.top - glyph.top, glyph.bottom - rect.bottom), next ? Math.max(0, rect.bottom - next.top) : 0];
    }));
  })).toBeLessThan(1);
});

test('keyboard menus restore their exact row focus and filtered menus use the visible file', async ({ page }) => {
  await openFiles(page);
  const files = page.getByTestId('files');
  const filter = files.getByRole('textbox', { name: 'Filter files...', exact: true });
  await filter.fill('file-0500');
  const button = files.getByRole('button', { name: 'Stage files/file-0500.txt', exact: true });
  await button.focus();
  await button.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await button.locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Discard changes?', exact: true });
  await expect(dialog.getByText('files/file-0500.txt', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await button.click();
  await expect.poll(() => page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === 'stage_files').map(call => call.args?.files))).toEqual([['files/file-0500.txt']]);
});

test('staging after closing a deep file menu retains the scrolling element and its position', async ({ page }) => {
  await openFiles(page);
  const files = page.getByTestId('files');
  const scroller = files.locator('.overflow-y-auto').last();
  await scroller.evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) * 0.65; });
  let path = '';
  await expect.poll(async () => {
    path = await files.getByRole('button', { name: /^Stage files\/file-\d{4}\.txt$/ }).evaluateAll(buttons => {
      const button = buttons.find(button => {
        const row = button.getBoundingClientRect();
        const viewport = button.closest('.overflow-y-auto')!.getBoundingClientRect();
        return row.top > viewport.top + 20 && row.bottom < viewport.bottom - 20;
      });
      return button?.getAttribute('aria-label')?.replace(/^Stage /, '') ?? '';
    });
    return path;
  }).toMatch(/^files\/file-\d{4}\.txt$/);
  const button = files.getByRole('button', { name: `Stage ${path}`, exact: true });
  await button.locator('..').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const before = await scroller.evaluate(node => {
    node.setAttribute('data-scroll-retained', 'yes');
    return node.scrollTop;
  });
  await button.click();
  await expect(button).toHaveCount(0);
  await expect(scroller).toHaveAttribute('data-scroll-retained', 'yes');
  expect(await scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(before - 100);
});

test('a stationary touch long press opens its file menu and moving cancels it', async ({ page }) => {
  await openFiles(page);
  const row = page.getByTestId('files').getByText('file-0000.txt', { exact: true }).locator('../..');
  const bounds = await row.boundingBox();
  if (!bounds) throw new Error('Missing first file row');
  const pointer = { pointerId: 1, pointerType: 'touch', clientX: bounds.x + 30, clientY: bounds.y + bounds.height / 2, bubbles: true };
  await row.dispatchEvent('pointerdown', pointer);
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await row.dispatchEvent('pointerdown', pointer);
  await row.dispatchEvent('pointermove', { ...pointer, clientY: pointer.clientY + 30 });
  // The original long-press deadline must pass without opening a menu during a swipe.
  await page.waitForTimeout(750);
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toHaveCount(0);
});

test('a recycled focused checkbox loses focus before Space can stage its new file', async ({ page }) => {
  const row = await recyclableFile(page);
  await row.button.focus();
  const path = await row.recycle();
  expect(await row.element.evaluate(node => node === document.activeElement)).toBe(false);
  await page.keyboard.press('Space');
  expect(await stagedPaths(page)).toEqual([]);
  const current = row.files.getByRole('button', { name: `Stage ${path}`, exact: true });
  await current.focus();
  await current.press('Space');
  await expect.poll(() => stagedPaths(page)).toEqual([[path]]);
});

test('small scrolling preserves keyboard focus on the same logical file without resetting scroll', async ({ page }) => {
  const row = await recyclableFile(page);
  await row.button.focus();
  const before = await row.scroller.evaluate(node => node.scrollTop);
  await row.scroller.evaluate((node, height) => { node.scrollTop += height; }, row.height);
  await expect.poll(() => row.element.evaluate(node => node.getAttribute('aria-label'))).not.toBe(`Stage ${row.path}`);
  await expect(row.button).toBeFocused();
  expect(await row.scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(before);
  await row.button.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toBeVisible();
  const menuBefore = await row.scroller.evaluate(node => node.scrollTop);
  await row.scroller.evaluate((node, height) => { node.scrollTop += height; }, row.height);
  await page.keyboard.press('Escape');
  await expect(row.button).toBeFocused();
  expect(await row.scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(menuBefore);
  await row.button.press('Space');
  await expect.poll(() => stagedPaths(page)).toEqual([[row.path]]);
});

test('a checkbox press started before recycling cannot stage the file beneath its release', async ({ page }) => {
  const row = await recyclableFile(page);
  const before = await row.button.boundingBox();
  if (!before) throw new Error('Missing original checkbox bounds');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  const path = await row.recycle();
  const after = await row.element.boundingBox();
  if (!after) throw new Error('Recycled checkbox was removed');
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await page.mouse.up();
  expect(await stagedPaths(page)).toEqual([]);
  await row.files.getByRole('button', { name: `Stage ${path}`, exact: true }).click();
  await expect.poll(() => stagedPaths(page)).toEqual([[path]]);
});

test('closing a menu after recycling cannot focus its old checkbox as a different file', async ({ page }) => {
  const row = await recyclableFile(page);
  await row.button.focus();
  await row.button.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toBeVisible();
  const path = await row.recycle();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toHaveCount(0);
  expect(await row.element.evaluate(node => node === document.activeElement)).toBe(false);
  await page.keyboard.press('Space');
  expect(await stagedPaths(page)).toEqual([]);
  const current = row.files.getByRole('button', { name: `Stage ${path}`, exact: true });
  await current.focus();
  await current.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Discard changes?', exact: true }).getByText(path, { exact: true })).toBeVisible();
});

test('right-button release cannot open a different file menu after its pressed slot is recycled', async ({ page }) => {
  const row = await recyclableFile(page);
  await row.button.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2, buttons: 2, bubbles: true });
  const path = await row.recycle();
  await row.element.dispatchEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
  await expect(page.getByRole('menuitem', { name: 'Discard changes', exact: true })).toHaveCount(0);
  await row.files.getByRole('button', { name: `Stage ${path}`, exact: true }).locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Discard changes?', exact: true }).getByText(path, { exact: true })).toBeVisible();
});

test('the first deep scaled right-click keeps the visible file target', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFiles(page, 1.5);
  const files = page.getByTestId('files');
  const scroller = files.locator('.overflow-y-auto').last();
  await scroller.evaluate(node => {
    (window as any).__filePoolEvents = [];
    for (const type of ['scroll', 'pointermove', 'pointerdown', 'mousedown', 'focusin', 'contextmenu', 'pointerup', 'click']) {
      node.addEventListener(type, event => {
        const target = event.target as Element;
        const row = target.closest?.('[data-change-row-id]') as HTMLElement | null;
        const probe = document.querySelector<HTMLElement>('[data-pool-probe]');
        (window as any).__filePoolEvents.push({ type, top: node.scrollTop, row: row?.dataset.changeRowId, probe: probe?.dataset.changeRowId, y: (event as MouseEvent).clientY, anchor: getComputedStyle(node).overflowAnchor });
      }, true);
    }
    node.scrollTop = (node.scrollHeight - node.clientHeight) * 0.7;
  });
  let path = '';
  await expect.poll(async () => {
    path = await files.getByRole('button', { name: /^Stage files\/file-\d{4}\.txt$/ }).evaluateAll(buttons => {
      const button = buttons.find(button => {
        const bounds = button.getBoundingClientRect();
        const viewport = button.closest('.overflow-y-auto')!.getBoundingClientRect();
        return bounds.top > viewport.top + 20 && bounds.bottom < viewport.bottom - 20;
      });
      return button?.getAttribute('aria-label')?.replace(/^Stage /, '') ?? '';
    });
    return path;
  }).toMatch(/^files\/file-\d{4}\.txt$/);
  const row = files.getByRole('button', { name: `Stage ${path}`, exact: true }).locator('..');
  await row.evaluate(node => { node.setAttribute('data-pool-probe', 'yes'); });
  try {
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByText(path, { exact: true })).toBeVisible();
  } catch (error) {
    const events = await page.evaluate(() => (window as any).__filePoolEvents);
    await testInfo.attach('file-pool-events', { body: JSON.stringify({ expected: path, events }), contentType: 'application/json' });
    throw error;
  }
});
