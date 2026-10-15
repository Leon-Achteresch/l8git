import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const labels = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const horizontalKey = 'l8git.commit-panel.layout.v2';
const verticalKey = 'l8git.commit-panel.layout.vertical.v1';

async function seedPreferences(page: Page, options: { sidebarWidth?: number; uiScale?: number; terminalRight?: boolean; tabLayout?: 'list' | 'grid'; hiddenTabs?: string[] } = {}) {
  await page.addInitScript(({ options, horizontalKey }) => {
    localStorage.setItem('l8git-ui', JSON.stringify({ state: { sidebarWidth: options.sidebarWidth ?? 256, sidebarTab: 'commit' }, version: 0 }));
    // Pixel budgets below are measured for the classic shell; the default rail takes extra width.
    localStorage.setItem('l8git-workspace-prefs', JSON.stringify({ state: { uiScale: options.uiScale ?? 1, shellLayout: 'classic' }, version: 0 }));
    localStorage.setItem(horizontalKey, JSON.stringify({ files: 37, diff: 63 }));
    if (options.tabLayout || options.hiddenTabs) localStorage.setItem('l8git-sidebar-prefs', JSON.stringify({ state: { tabLayout: options.tabLayout ?? 'list', hiddenTabs: options.hiddenTabs ?? [] }, version: 0 }));
    if (options.terminalRight) localStorage.setItem('l8git-terminal', JSON.stringify({ state: { position: 'right', panelWidth: 440 }, version: 0 }));
  }, { options, horizontalKey });
}

async function openWorkspace(page: Page, scene = 'partial-staging') {
  await page.goto(`/?scene=${scene}`, { waitUntil: 'domcontentloaded' });
  // The full app is lazy loaded; cold Vite compilation can exceed an individual layout assertion.
  await expect(page.getByTestId('commit-split-container')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.locator('#main-content > div').evaluate(node => {
    const style = getComputedStyle(node);
    return style.opacity === '1' && style.transform === 'none';
  })).toBe(true);
}

async function expectFullWidthFiles(page: Page) {
  await expect(page.locator('#commit-panel-layout')).toHaveAttribute('data-orientation', 'vertical');
  await expect.poll(async () => {
    const files = await page.getByTestId('files').boundingBox();
    const container = await page.getByTestId('commit-split-container').boundingBox();
    return files && container ? Math.abs(files.width - container.width) : 1000;
  }).toBeLessThan(3);
}

async function expectFileRatio(page: Page, orientation: 'horizontal' | 'vertical', expected: number) {
  await expect(page.locator('#commit-panel-layout')).toHaveAttribute('data-orientation', orientation);
  await expect.poll(async () => {
    const files = await page.getByTestId('files').boundingBox();
    const diff = await page.getByTestId('diff').boundingBox();
    if (!files || !diff) return 1000;
    const dimension = orientation === 'horizontal' ? 'width' : 'height';
    return Math.abs(100 * files[dimension] / (files[dimension] + diff[dimension]) - expected);
  }).toBeLessThan(0.5);
}

async function savedLayout(page: Page, key: string): Promise<{ files: number; diff: number }> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
}

test('the native minimum and compact rail keep file names and branch navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await seedPreferences(page);
  await openWorkspace(page);
  await expectFullWidthFiles(page);
  await expect(page.getByTestId('repository-sidebar')).toHaveAttribute('data-layout', 'full');
  await expect(page.getByTestId('files').getByText('first.txt', { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 640, height: 800 });
  const sidebar = page.getByTestId('repository-sidebar');
  await expect(sidebar).toHaveAttribute('data-layout', 'compact');
  await expectFullWidthFiles(page);
  await expect(sidebar.getByRole('tab', { name: labels.sidebar.tabCommit, exact: true })).toBeVisible();
  await expect(sidebar.getByRole('tab', { name: labels.sidebar.tabHistory, exact: true })).toBeVisible();
  await expect(sidebar.getByRole('separator')).toHaveCount(0);
  await sidebar.getByRole('button', { name: labels.sidebar.branchPopoverTitle, exact: true }).click();
  await expect(page.getByRole('button', { name: labels.sidebar.newBranchAria, exact: true })).toBeVisible();
  await expect(page.getByText('main', { exact: true }).last()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('l8git-ui')!).state.sidebarWidth)).toBe(256);
});

test('stacking preserves desktop sizing, the live filter, selected diff and commit draft', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPreferences(page, { sidebarWidth: 400 });
  await openWorkspace(page);
  await expectFileRatio(page, 'horizontal', 37);
  const split = page.locator('#commit-panel-layout').getByRole('separator');
  await split.focus();
  await split.press('ArrowRight');
  await expect.poll(async () => (await savedLayout(page, horizontalKey)).files).toBeGreaterThan(37);
  const horizontal = await savedLayout(page, horizontalKey);
  await expectFileRatio(page, 'horizontal', horizontal.files);
  const filter = page.getByTestId('files').getByRole('textbox', { name: labels.commitPanel.fileListFilter });
  await filter.fill('second');
  await filter.evaluate(node => { node.setAttribute('data-resize-retained', 'yes'); });
  await page.getByTestId('files').getByText('second.txt', { exact: true }).first().click();
  await expect(page.getByTestId('diff').getByText('second.txt', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Keep this draft');
  await page.setViewportSize({ width: 900, height: 800 });
  await expectFullWidthFiles(page);
  await expect(filter).toHaveValue('second');
  await expect(filter).toHaveAttribute('data-resize-retained', 'yes');
  await expect(page.getByTestId('diff').getByText('second.txt', { exact: true })).toBeVisible();
  await split.focus();
  await split.press('ArrowDown');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), verticalKey)).not.toBeNull();
  const vertical = await savedLayout(page, verticalKey);
  await expectFileRatio(page, 'vertical', vertical.files);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectFileRatio(page, 'horizontal', horizontal.files);
  await expect(filter).toHaveValue('second');
  await expect(filter).toHaveAttribute('data-resize-retained', 'yes');
  await expect(page.getByRole('textbox', { name: 'Commit message', exact: true })).toHaveValue('Keep this draft');
  expect(await savedLayout(page, horizontalKey)).toEqual(horizontal);
  expect(await savedLayout(page, verticalKey)).toEqual(vertical);
  await page.setViewportSize({ width: 900, height: 800 });
  await expectFileRatio(page, 'vertical', vertical.files);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectFileRatio(page, 'horizontal', horizontal.files);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('l8git-ui')!).state.sidebarWidth)).toBe(400);
  const sidebarResize = page.getByTestId('repository-sidebar').getByRole('separator');
  await sidebarResize.focus();
  await sidebarResize.press('ArrowRight');
  await expect(sidebarResize).toHaveAttribute('aria-valuenow', '416');
});

test('150 percent text scale keeps a full file row and diff line visible at the native minimum', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await seedPreferences(page, { uiScale: 1.5 });
  await openWorkspace(page);
  await expect(page.getByTestId('repository-sidebar')).toHaveAttribute('data-layout', 'compact');
  await expectFullWidthFiles(page);
  const name = page.getByTestId('files').getByText('first.txt', { exact: true }).first();
  await expect(name).toBeVisible();
  expect(await name.locator('..').evaluate(node => node.clientWidth >= node.scrollWidth)).toBe(true);
  const fileRow = page.getByTestId('files').getByRole('button', { name: labels.commitActions.unstageFile.replace('{{path}}', 'first.txt'), exact: true }).locator('..');
  await expect.poll(async () => {
    const row = await fileRow.boundingBox();
    const files = await page.getByTestId('files').boundingBox();
    return row && files ? row.y + row.height - files.y - files.height : 1000;
  }).toBeLessThan(1);
  const diffScroller = page.getByTestId('diff').locator('[tabindex="0"].overflow-auto');
  const firstLine = diffScroller.getByText('diff --git a/example.txt b/example.txt', { exact: true });
  await expect(firstLine).toBeAttached();
  await expect.poll(async () => {
    const line = await firstLine.boundingBox();
    const scroller = await diffScroller.boundingBox();
    return line && scroller ? Math.max(scroller.y - line.y, line.y + line.height - scroller.y - scroller.height) : 1000;
  }).toBeLessThan(1);
  await expect.poll(() => diffScroller.evaluate(scroller => {
    const rows = [...scroller.querySelectorAll<HTMLElement>('[style*="translateY"]')];
    if (rows.length < 3) return 1000;
    return Math.max(...rows.flatMap((row, index) => {
      const bounds = row.getBoundingClientRect();
      const text = row.querySelector('.whitespace-pre')?.getBoundingClientRect();
      return [
        text ? Math.max(bounds.top - text.top, text.bottom - bounds.bottom) : 0,
        index + 1 < rows.length ? Math.max(0, bounds.bottom - rows[index + 1].getBoundingClientRect().top) : 0,
      ];
    }));
  })).toBeLessThan(1);
  expect(await page.getByTestId('commit-split-container').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test('scaled session review keeps a complete short hunk visible in its narrow dialog', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await seedPreferences(page, { uiScale: 1.5 });
  await page.goto('/?scene=review');
  const review = page.getByRole('dialog', { name: labels.agentReview.title, exact: true });
  await expect(review.getByRole('button', { name: labels.agentReview.discardFile, exact: true })).toBeEnabled({ timeout: 20_000 });
  // This isolated dialog fixture omits the application shell that applies the saved text scale.
  await page.evaluate(() => { document.documentElement.style.fontSize = '150%'; });
  const scroller = review.locator('.overflow-auto').filter({ hasText: 'reviewed content' });
  await expect.poll(() => scroller.evaluate(element => {
    const viewport = element.getBoundingClientRect();
    const rows = [...element.querySelectorAll<HTMLElement>('[data-index]')];
    if (rows.length !== 3) return 1000;
    return Math.max(...rows.flatMap((row, index) => {
      const bounds = row.getBoundingClientRect();
      const text = row.firstElementChild!.getBoundingClientRect();
      return [
        Math.max(viewport.top - text.top, text.bottom - viewport.bottom),
        Math.abs(bounds.height - text.height),
        index + 1 < rows.length ? Math.max(0, bounds.bottom - rows[index + 1].getBoundingClientRect().top) : 0,
      ];
    }));
  })).toBeLessThan(1);
  const bounds = await review.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(640);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(801);
});

test('a right dock stacks the commit panels using their allocation and restores the desktop split when closed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedPreferences(page, { terminalRight: true });
  await openWorkspace(page, 'git-workflow');
  await expect(page.locator('#commit-panel-layout')).toHaveAttribute('data-orientation', 'horizontal');
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'pty_open') return 1;
      if (['pty_resize', 'pty_write', 'pty_close'].includes(command)) return null;
      return original(command, args);
    };
  });
  await page.getByRole('button', { name: labels.dock.shell, exact: true }).click();
  const closeTerminal = page.getByTestId('in-app-terminal-area').getByRole('button', { name: labels.embeddedTerminal.close, exact: true });
  await expect(closeTerminal).toBeVisible();
  await expectFullWidthFiles(page);
  expect(await page.getByTestId('commit-split-container').evaluate(node => node.clientWidth)).toBeLessThan(720);
  await closeTerminal.click();
  await expect(page.locator('#commit-panel-layout')).toHaveAttribute('data-orientation', 'horizontal');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), horizontalKey)).toEqual({ files: 37, diff: 63 });
});

test('sidebar keyboard navigation keeps one tab stop and activates panels only with Enter or Space', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await seedPreferences(page);
  await openWorkspace(page);
  const sidebar = page.getByTestId('repository-sidebar');
  const nav = sidebar.getByRole('tablist', { name: labels.sidebar.navAria, exact: true });
  const commit = nav.getByRole('tab', { name: labels.sidebar.tabCommit, exact: true });
  const history = nav.getByRole('tab', { name: labels.sidebar.tabHistory, exact: true });
  const stash = nav.getByRole('tab', { name: labels.sidebar.tabStash, exact: true });
  const tools = nav.getByRole('tab', { name: labels.sidebar.tabTools, exact: true });
  await expect(nav).toHaveAttribute('aria-orientation', 'vertical');
  await expect(nav.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await expect(commit).toHaveAttribute('tabindex', '0');
  await commit.focus();
  await commit.press('ArrowDown');
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('tabindex', '0');
  await expect(commit).toHaveAttribute('aria-selected', 'true');
  await expectFullWidthFiles(page);
  await history.press('End');
  await expect(stash).toBeFocused();
  await stash.press('Home');
  await expect(commit).toBeFocused();
  await commit.press('ArrowUp');
  await expect(stash).toBeFocused();
  await stash.press('ArrowDown');
  await expect(commit).toBeFocused();
  await page.setViewportSize({ width: 640, height: 800 });
  await expect(sidebar).toHaveAttribute('data-layout', 'compact');
  await commit.press('End');
  await expect(tools).toBeFocused();
  await expect(commit).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  // Expanding from the rail keeps a focused rare tab reachable until focus leaves it.
  await expect(tools).toBeFocused();
  await tools.press('Home');
  await expect(commit).toBeFocused();
  await commit.press('ArrowDown');
  await history.press('Space');
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('commit-split-container')).toHaveCount(0);
  await history.press('ArrowUp');
  await commit.press('Enter');
  await expect(commit).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('commit-split-container')).toBeVisible();
  await expect(nav.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
});

test('grid sidebar navigation follows visible tabs and switches to vertical keys in the compact rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedPreferences(page, { tabLayout: 'grid', hiddenTabs: ['history'] });
  await openWorkspace(page);
  const sidebar = page.getByTestId('repository-sidebar');
  const nav = sidebar.getByRole('tablist', { name: labels.sidebar.navAria, exact: true });
  const commit = nav.getByRole('tab', { name: labels.sidebar.tabCommit, exact: true });
  const prs = nav.getByRole('tab', { name: labels.sidebar.tabPr, exact: true });
  await expect(nav).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(nav.getByRole('tab', { name: labels.sidebar.tabHistory, exact: true })).toHaveCount(0);
  await commit.focus();
  await commit.press('ArrowRight');
  await expect(prs).toBeFocused();
  await expect(commit).toHaveAttribute('aria-selected', 'true');
  await prs.press('ArrowLeft');
  await expect(commit).toBeFocused();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(sidebar).toHaveAttribute('data-layout', 'compact');
  await expect(nav).toHaveAttribute('aria-orientation', 'vertical');
  await commit.press('ArrowDown');
  await expect(prs).toBeFocused();
  await expect(nav.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
});

test('a thousand scaled file rows stay separate when virtualized and remain selectable after scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedPreferences(page, { uiScale: 1.5 });
  await openWorkspace(page, 'performance');
  const files = page.getByTestId('files');
  const rows = files.getByRole('button', { name: /^Stage files\/file-\d{4}\.txt$/ });
  const scroller = files.locator('.overflow-y-auto').last();
  const expectSeparateRows = async () => {
    await expect.poll(() => rows.evaluateAll(buttons => {
      const bounds = buttons.map(button => {
        const row = button.parentElement!;
        return { row: row.getBoundingClientRect(), wrapper: row.parentElement!.getBoundingClientRect() };
      });
      if (bounds.length < 3) return 1000;
      return Math.max(...bounds.flatMap(({ row, wrapper }, index) => [
        Math.abs(row.height - wrapper.height),
        index + 1 < bounds.length ? Math.max(0, row.bottom - bounds[index + 1].row.top) : 0,
      ]));
    })).toBeLessThan(1);
    expect(await rows.count()).toBeLessThan(80);
  };
  await expectSeparateRows();
  await scroller.evaluate(node => { node.scrollTop = 27_000; });
  await expect(files.getByText('file-0000.txt', { exact: true })).toHaveCount(0);
  await expect(files.getByText('file-0500.txt', { exact: true })).toBeAttached();
  await expectSeparateRows();
  await files.getByText('file-0500.txt', { exact: true }).click();
  await expect(page.getByTestId('diff').getByText('files/file-0500.txt', { exact: true })).toBeVisible();
  await files.getByText('file-0501.txt', { exact: true }).click();
  await expect(page.getByTestId('diff').getByText('files/file-0501.txt', { exact: true })).toBeVisible();
});
