// Views measured by benchmark-scroll.mjs and profiled by profile-scroll.mjs. IPC is fixture data.
// Scroll targets scroll the list around `anchor`; `wheel` targets get wheel events on `anchor` instead
// (Monaco, xterm scroll virtually); `interact` targets record frames while the interaction runs.
const filesReady = page => page.getByTestId('files').getByText('file-0000.txt', { exact: true });
const sidebarList = page => page.locator('[data-testid="repository-sidebar"] [data-slot="scroll-area-viewport"]').first();
const hubRepoRow = page => page.getByText('Service number 0 with', { exact: false }).first();
const inboxRow = page => page.getByRole('dialog', { name: 'Inbox' }).getByText('Improve', { exact: false }).first();
const cmdlogRow = page => page.getByText('--porcelain=v2', { exact: false }).first();
const settingsMain = page => page.locator('main.overscroll-contain');
const terminalScreen = page => page.locator('.xterm-screen').first();
const agentsLast = page => page.getByText('Done with step 199', { exact: false });

export const TARGETS = [
  { name: 'files', scene: 'performance', ready: filesReady, anchor: page => page.getByTestId('files') },
  { name: 'history', scene: 'performance-history', ready: page => page.locator('[data-commit-hash]').first(), anchor: page => page.locator('[data-commit-hash]').first() },
  // Commit inspect: 400 files, a 3000-line diff, and the history list beside them.
  { name: 'inspect-diff', scene: 'performance-inspect', open: openInspect, ready: diffLine, anchor: diffLine },
  { name: 'inspect-diff-split', scene: 'performance-inspect', sideBySide: true, open: openInspect, ready: page => page.locator('.monaco-diff-editor .view-line').first(), anchor: page => page.locator('.monaco-diff-editor .modified .monaco-scrollable-element').first(), wheel: true },
  { name: 'inspect-files', scene: 'performance-inspect', open: openInspect, ready: page => page.getByRole('group', { name: 'Changed files' }), anchor: page => page.getByRole('group', { name: 'Changed files' }) },
  { name: 'inspect-history', scene: 'performance-inspect', open: openInspect, ready: diffLine, anchor: page => page.locator('[data-commit-hash]').first() },
  // performance-app: the same repository plus 1600 branches, 400 tags, 2000 PRs, 500 stashes, hub, inbox and terminal data.
  { name: 'branches', scene: 'performance-app', ready: sidebarList, anchor: sidebarList },
  { name: 'prs', scene: 'performance-app', open: tab('pr'), ready: page => page.getByText('Improve fix handling', { exact: false }).first(), anchor: page => page.getByText('Improve fix handling', { exact: false }).first() },
  { name: 'stashes', scene: 'performance-app', open: tab('stash'), ready: page => page.getByText('experiment 0', { exact: false }).first(), anchor: page => page.getByText('experiment 0', { exact: false }).first() },
  { name: 'dashboard', scene: 'performance-app', open: nav('/dashboard'), ready: page => page.getByText('dev-000').first(), anchor: page => page.getByText('dev-000').first() },
  { name: 'hub-repos', scene: 'performance-app', open: async page => { await seedHub(page); await nav('/hub', { view: 'repos' })(page); }, ready: hubRepoRow, anchor: hubRepoRow },
  { name: 'hub-contributors', scene: 'performance-app', open: openContributors, ready: page => page.getByText('dev-099').first(), anchor: page => page.getByText('dev-099').first() },
  { name: 'inbox', scene: 'performance-app', open: page => page.evaluate(() => window.__L8GIT_PERF__.ui.getState().openInbox()), ready: inboxRow, anchor: inboxRow },
  { name: 'cmdlog', scene: 'performance-app', open: page => page.evaluate(() => window.__L8GIT_PERF__.ui.getState().openCommandLog()), ready: cmdlogRow, anchor: cmdlogRow },
  { name: 'settings', scene: 'performance-app', open: openSettingsSearch, ready: settingsMain, anchor: settingsMain },
  // xterm ignores synthetic wheel events, so the terminal gets real ones from Playwright.
  { name: 'terminal', scene: 'performance-app', open: openTerminal, ready: terminalScreen, interact: async page => { for (let i = 0; i < 240; i++) await page.mouse.wheel(0, i < 120 ? -40 : 40); } },
  { name: 'agents', scene: 'performance-agents', open: page => page.getByText('Wire the agents tab').first().click(), ready: agentsLast, anchor: agentsLast },
  { name: 'palette', scene: 'performance-app', ready: filesReady, interact: async page => {
    const input = page.getByRole('dialog', { name: 'Search', exact: true }).getByRole('combobox');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ControlOrMeta+K');
      await input.waitFor({ state: 'visible' });
      await input.pressSequentially('fixture commit 12', { delay: 30 });
      await page.keyboard.press('Escape');
      await input.waitFor({ state: 'hidden' });
    }
  } },
  { name: 'commit-typing', scene: 'performance-app', ready: filesReady, interact: async page => { await page.locator('[data-commit-message-input]').click(); await page.keyboard.type('fix(history): keep pooled rows on their item while scrolling fast', { delay: 30 }); } },
  { name: 'tab-switch', scene: 'performance-app', ready: filesReady, interact: async page => { for (const name of ['history', 'pr', 'stash', 'commit', 'history', 'commit']) { await tab(name)(page); await page.waitForTimeout(400); } } },
  { name: 'route-switch', scene: 'performance-app', ready: filesReady, interact: async page => { for (const to of ['/dashboard', '/settings', '/hub', '/', '/dashboard', '/']) { await nav(to)(page); await page.waitForTimeout(500); } } },
];

function diffLine(page) {
  return page.getByText('computeSomething(0,', { exact: false }).first();
}

async function openInspect(page) {
  await page.locator('[data-commit-hash]').first().click();
}

function nav(to, search) {
  return page => page.evaluate(([to, search]) => window.__L8GIT_PERF__.router.navigate({ to, search }), [to, search]);
}

function tab(name) {
  return page => page.evaluate(name => window.__L8GIT_PERF__.ui.getState().setSidebarTab(name), name);
}

// The hub cache expires 60 s after seeding; slow throttled loads must reseed right before opening the hub.
function seedHub(page) {
  return page.evaluate(() => window.__L8GIT_PERF__.seedHub());
}

async function openContributors(page) {
  await seedHub(page);
  await nav('/hub', { view: 'repo', repo: 'acme/big' })(page);
  await page.getByRole('button', { name: 'Contributors', exact: true }).click();
}

async function openSettingsSearch(page) {
  // Searching renders every matching section, which makes the settings page long enough to scroll.
  await nav('/settings')(page);
  await page.getByRole('searchbox').fill('e');
}

async function openTerminal(page) {
  await page.evaluate(() => {
    const terminal = window.__L8GIT_PERF__.terminal.getState();
    terminal.setPosition('right');
    terminal.setPanelWidth(700);
    terminal.setVisible('/tmp/l8git-audit-fixture', true);
  });
  const box = await terminalScreen(page).boundingBox({ timeout: 30_000 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1000);
}

async function recordFrames(page, run) {
  await page.evaluate(() => {
    const intervals = [];
    window.__benchmarkFrames = intervals;
    let previous;
    const tick = now => {
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      if (window.__benchmarkFrames === intervals) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await run();
  return page.evaluate(() => { const intervals = window.__benchmarkFrames; window.__benchmarkFrames = null; return intervals; });
}

/** Loads the target's scene and opens its view. */
export async function openTarget(page, target, origin) {
  if (target.sideBySide) await page.addInitScript(() => localStorage.setItem('l8git-commit-prefs', JSON.stringify({ state: { diffLayoutMode: 'sideBySide' }, version: 0 })));
  await page.goto(`${origin}/?scene=${target.scene}`, { timeout: 120_000 });
  if (target.open) {
    await page.locator('[data-commit-hash], [data-testid="files"], [data-agent-chat]').first().waitFor({ timeout: 120_000 });
    await target.open(page);
  }
  await target.ready(page).waitFor({ timeout: 120_000 });
}

/** Scrolls, wheels or interacts with the target and returns the frame intervals in ms. */
export async function driveTarget(page, target, { pxPerFrame, frameCount }) {
  return target.interact ? await recordFrames(page, () => target.interact(page)) : await target.anchor(page).evaluate(async (root, { pxPerFrame, frameCount, wheel }) => {
    let scroller;
    if (!wheel) {
      const scrollable = node => node.scrollHeight > node.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(node).overflowY);
      scroller = [...root.querySelectorAll('*')].find(scrollable);
      for (let node = root; !scroller && node && node !== document.body; node = node.parentElement) {
        if (scrollable(node)) scroller = node;
      }
      if (!scroller) throw new Error('Missing scrollable fixture list');
    }
    const intervals = [];
    let previous;
    await new Promise(resolve => {
      const tick = now => {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        if (wheel) {
          // Monaco and xterm scroll virtually: drive them with wheel events like a trackpad.
          const down = Math.floor(intervals.length / 120) % 2 === 0;
          root.dispatchEvent(new WheelEvent('wheel', { deltaY: (down ? 1 : -1) * (pxPerFrame || 120), deltaMode: 0, bubbles: true, cancelable: true }));
        } else {
          // Scroll across the full fixture and back; every frame changes rows.
          const max = scroller.scrollHeight - scroller.clientHeight;
          if (pxPerFrame > 0) {
            const span = 2 * max;
            const pos = (intervals.length * pxPerFrame) % span;
            scroller.scrollTop = pos <= max ? pos : span - pos;
          } else {
            const phase = (intervals.length % 120) / 120;
            scroller.scrollTop = max * (1 - Math.abs(phase * 2 - 1));
          }
        }
        if (intervals.length < frameCount) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return intervals;
  }, { pxPerFrame, frameCount, wheel: !!target.wheel });
}
