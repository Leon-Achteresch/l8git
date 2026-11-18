(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const named = (selector, name) => [...document.querySelectorAll(selector)]
    .find(element => element.getClientRects().length &&
      (element.getAttribute('aria-label') || element.textContent.trim()) === name);
  const wait = async (name, check, timeout = 12000) => {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      const found = await check();
      if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${name}\n${document.body.innerText.slice(0, 2400)}`);
  };
  const screenshot = async tag => {
    // Let the app's dialog and workspace transitions settle before capture.
    await new Promise(resolve => setTimeout(resolve, 450));
    await ipc('native_f02_checkpoint', { tag });
    await wait(`captured ${tag}`, () => ipc('native_f02_checkpoint_done', { tag }));
  };
  const expectDenied = async (args, expected) => {
    try {
      await ipc('workspace_fetch_desktop_validate', args);
    } catch (error) {
      if (String(error).includes(expected)) return;
      throw error;
    }
    throw new Error('Unconfirmed validation unexpectedly succeeded');
  };
  const steps = [];
  const run = async () => {
    if (localStorage.length !== 0) throw new Error('Expected an empty private profile');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent, fixture.child], activePath: fixture.parent, customFavicons: {} });
    seed('l8git-workspaces', { activeWorkspaceId: 'fixture', workspaces: [
      { id: 'fixture', name: 'Fixture workspace', repoPaths: [fixture.parent] },
      { id: 'other', name: 'Other workspace', repoPaths: [fixture.child] },
    ] });
    seed('l8git-ui', { sidebarTab: 'history' });
    await expectDenied({ path: fixture.parent, workspaceId: 'fixture', revision: 0 }, 'native picker');
    const openPreview = async () => {
      (await wait('Activity center', () => named('button', 'Activity & recovery'))).click();
      (await wait('Preview summary', () => named('summary', 'Workspace fetch preview'))).click();
    };
    const review = async (capturePreview = false) => {
      await openPreview();
      (await wait('Approved checkout selection', () => named('label', 'approved'))).click();
      (await wait('Read-only preview button', () => named('button', 'Check selected repositories'))).click();
      await wait('preview target', () => named('p', 'Fetch target: origin'));
      if (capturePreview) await screenshot('preview');
      (await wait('native confirmation button', () => named('button', 'Confirm targets'))).click();
      await wait('native picker completed and target matched',
        () => named('[role="status"]', 'The targets match the preview. Workspace fetch is still unavailable.'), 65000);
      const revision = await ipc('native_f02_reviewed_revision');
      const confirmed = { path: fixture.parent, workspaceId: 'fixture', revision };
      await ipc('workspace_fetch_desktop_validate', confirmed);
      return confirmed;
    };
    const closePreview = async () => {
      (await wait('Close activity dialog', () => named('button', 'Close'))).click();
      await wait('Activity dialog closed', () => !named('[role="heading"],h2,h3', 'Activity & recovery'));
    };
    const switchWorkspace = async (from, to) => {
      (await wait(`workspace switcher for ${from}`, () => named('button', from))).click();
      (await wait(`choose workspace ${to}`, () => named('span', to))).click();
      await wait(`active workspace ${to}`, () => named('button', to));
    };
    const waitRevoked = confirmed => wait('membership revoked', async () => {
      try {
        await ipc('workspace_fetch_desktop_validate', confirmed);
      } catch (error) {
        if (String(error).includes('active, open membership')) return true;
        throw error;
      }
      return false;
    });

    const confirmed = await review(true);
    await expectDenied({ ...confirmed, path: fixture.child }, 'active, open membership');
    await expectDenied({ ...confirmed, revision: 0 }, 'approval is stale');
    await screenshot('confirmed');
    steps.push('Native picker approved one checkout. Another checkout and an old revision were rejected.');

    await closePreview();
    await switchWorkspace('Fixture workspace', 'Other workspace');
    await waitRevoked(confirmed);
    await openPreview();
    await wait('other workspace visible in preview', () => named('label', 'other') && !named('label', 'approved'));
    await screenshot('revoked');
    steps.push('The regular Workspace switch revoked the prior revision.');
    await closePreview();
    await switchWorkspace('Other workspace', 'Fixture workspace');

    const reopened = await review();
    if (reopened.revision <= confirmed.revision) throw new Error('Expected a fresh host revision');
    await closePreview();
    const tab = await wait('approved repo tab', () => document.querySelector(`[data-repo-path="${CSS.escape(fixture.parent)}"]`));
    const close = tab.querySelector('[aria-label="Close tab"]');
    if (close) close.click();
    else tab.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    await wait('approved repo closed', () => !document.querySelector(`[data-repo-path="${CSS.escape(fixture.parent)}"]`));
    await waitRevoked(reopened);
    await openPreview();
    await wait('closed repo no longer listed', () => named('p', 'No open repositories in this workspace.'));
    await screenshot('repo-closed');
    steps.push('Closing the repo tab removed it from the preview and revoked the fresh host revision.');
    await ipc('native_acceptance_result', { ok: true, steps });
  };
  run().catch(error => ipc('native_acceptance_result', { ok: false, error: String(error), steps }));
})();
