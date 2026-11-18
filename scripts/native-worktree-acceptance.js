// Drives the bundled Worktree panel. The launcher performs external Git phases.
(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const trace = path => ipc('native_worktree_counts', { path });
  const phase = phase => ipc('native_worktree_phase', { phase });
  const steps = [];
  let operation = 'private storage and fixture scope';

  const wait = async (label, find) => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const answer = await find();
      if (answer) return answer;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}\n${document.body?.innerText.slice(0, 1700)}`);
  };
  const button = (role, name, root) => [...root.querySelectorAll(role)].find(
    element => element.getClientRects().length && (element.getAttribute('aria-label') || element.textContent.trim()) === name,
  );
  const tab = path => document.querySelector(`[data-repo-path="${CSS.escape(path)}"]`);
  const visibleRows = () => [...document.querySelectorAll('button[data-slot="list-row"]')]
    .filter(row => row.getClientRects().length)
    .map(row => row.innerText);
  const catalogShown = (summary, included, excluded = []) => {
    const visible = document.body.innerText;
    const rows = visibleRows();
    return visible.includes(summary) && visible.includes('Worktrees checked at') &&
      included.every(name => rows.some(row => row.includes(name))) &&
      excluded.every(name => rows.every(row => !row.includes(name)));
  };
  const value = (counts, key) => counts[key] ?? 0;
  const idle = () => new Promise(resolve => setTimeout(resolve, 3400));
  const stableCounts = async (path, previous, reads, events) => {
    await idle();
    const current = await trace(path);
    if (value(current, 'list_worktrees') - value(previous, 'list_worktrees') !== reads ||
        value(current, 'repo-worktrees-changed') - value(previous, 'repo-worktrees-changed') !== events) {
      throw new Error(`Unexpected catalog activity: ${JSON.stringify({ previous, current, reads, events })}`);
    }
    return current;
  };

  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent, fixture.child], activePath: fixture.parent, customFavicons: {} });
    seed('l8git-ui', { sidebarTab: 'worktrees' });
    const denied = await Promise.allSettled([
      ipc('list_worktrees', { path: fixture.outside }),
      ipc('git_worktree_prune', { path: fixture.parent }),
    ]);
    if (denied.some(result => result.status !== 'rejected')) throw new Error('Unexpected fixture permission');

    operation = 'initial linked catalog';
    const originals = ['catalog-main', 'catalog-linked'];
    const added = [1, 2, 3].map(index => `catalog-external-${index}`);
    const sidebar = await wait('repository sidebar', () => document.querySelector('[data-testid="repository-sidebar"]'));
    if (!button('[role="tab"]', 'Worktrees', sidebar)) {
      (await wait('More', () => button('button', 'More', sidebar))).click();
    }
    (await wait('Worktrees', () => button('[role="tab"]', 'Worktrees', sidebar))).click();
    await wait('2 initial entries', () => catalogShown('2 entries · 1 linked', originals));
    await wait('native watch attachment request', async () => value(await trace(fixture.parent), 'watch_repo') >= 1);
    let counts = await trace(fixture.parent);
    if (value(counts, 'list_worktrees') !== 1) throw new Error('Expected exactly one initial catalog read');
    counts = await stableCounts(fixture.parent, counts, 0, 0);
    steps.push('Linked checkout: 2 visible entries, 1 initial IPC, no idle refresh');

    operation = 'active add/remove bursts';
    await phase('add');
    await wait('5 entries after external add', () => catalogShown('5 entries · 4 linked', [...originals, ...added]));
    counts = await stableCounts(fixture.parent, counts, 1, 1);
    steps.push('External add burst: 5 visible entries, 1 native event and 1 list IPC');

    await phase('remove');
    await wait('2 entries after external remove', () => catalogShown('2 entries · 1 linked', originals, added));
    counts = await stableCounts(fixture.parent, counts, 1, 1);
    steps.push('External remove burst: 2 visible entries, 1 native event and 1 list IPC');

    operation = 'active repository isolation';
    (await wait('other repository tab', () => tab(fixture.child))).click();
    await wait('other repository catalog and watcher swap', async () =>
      tab(fixture.child)?.dataset.active === 'true' &&
      catalogShown('1 entry (main)', ['catalog-other'], originals) &&
      value(await trace(fixture.parent), 'unwatch_repo') >= 1 &&
      value(await trace(fixture.child), 'watch_repo') >= 1,
    );
    const other = await trace(fixture.child);
    if (value(other, 'list_worktrees') !== 1) throw new Error('Expected one initial read for the other repository');
    await phase('inactive-add');
    await stableCounts(fixture.child, other, 0, 0);
    const inactive = await trace(fixture.parent);
    if (!catalogShown('1 entry (main)', ['catalog-other'], added) ||
        value(inactive, 'list_worktrees') !== value(counts, 'list_worktrees') ||
        value(inactive, 'repo-worktrees-changed') !== value(counts, 'repo-worktrees-changed')) {
      throw new Error('Inactive repository change triggered a refresh or leaked into the active catalog');
    }
    tab(fixture.parent).click();
    await wait('3 entries on reopening the linked repository', () =>
      tab(fixture.parent)?.dataset.active === 'true' &&
        catalogShown('3 entries · 2 linked', [...originals, added[0]], ['catalog-other']),
    );
    await stableCounts(fixture.parent, inactive, 1, 0);
    steps.push('Inactive external add: no catalog IPC in either repo; returning reads 3 entries once');
    await ipc('native_acceptance_result', { ok: true, steps });
  };
  run().catch(error => {
    void ipc('native_acceptance_result', { ok: false, operation, error: String(error), steps });
  });
})();
