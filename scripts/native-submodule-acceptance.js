// Loaded at document start into the runner's nonpersistent WKWebView.
(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const steps = [];
  let operation = 'isolated storage and IPC';
  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent], activePath: fixture.parent, customFavicons: {} });
    seed('l8git-ui', { sidebarTab: 'commit' });

    const denied = await Promise.allSettled([
      ipc('open_repo', { path: fixture.outside }),
      ipc('secret_get', { key: 'native-acceptance-synthetic-probe' }),
    ]);
    if (denied.some(result => result.status !== 'rejected' || !String(result.reason).includes('fixture scope'))) {
      throw new Error('The IPC fixture boundary did not reject both probes');
    }
    steps.push('empty WebKit storage, synthetic registration, out-of-scope repo and keychain IPC rejected');

    const wait = async (label, find) => {
      const deadline = performance.now() + 12000;
      while (performance.now() < deadline) {
        const element = find();
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}\n${document.body?.innerText.slice(0, 1500)}`);
    };
    const shown = element => element.getClientRects().length > 0 && !element.disabled;
    const named = (selector, name, root = document) => [...root.querySelectorAll(selector)].find(
      element => shown(element) && (element.getAttribute('aria-label') || element.textContent.trim()) === name,
    );
    const tab = path => document.querySelector(`[data-repo-path="${CSS.escape(path)}"]`);
    const active = path => tab(path)?.dataset.active === 'true';
    const modal = () => document.querySelector('[role="dialog"]');
    const click = async (selector, name, root = document) =>
      (await wait(name, () => named(selector, name, root))).click();

    operation = 'F21';
    const sidebar = await wait('repository sidebar', () => document.querySelector('[data-testid="repository-sidebar"]'));
    const submodules = named('[role="tab"]', 'Submodules', sidebar);
    if (!submodules) await click('button', 'More', sidebar);
    await click('[role="tab"]', 'Submodules', sidebar);
    const live = await wait('initialized live submodule row', () =>
      [...document.querySelectorAll('button')].find(button =>
        shown(button) && [...button.querySelectorAll('p')].some(label => label.textContent.trim() === 'live'),
      ),
    );
    live.click();
    await click('button', 'Open repository');
    await wait('active canonical child tab', () => active(fixture.child));
    if (!tab(fixture.parent)) throw new Error('Parent repository tab disappeared');
    const registration = JSON.parse(localStorage.getItem('l8git-repo')).state;
    if (registration.activePath !== fixture.child || registration.paths.length !== 2) {
      throw new Error('Child was not registered in the isolated workspace');
    }
    steps.push('F21 initialized checkout opened and registered as the active canonical child tab');
    tab(fixture.parent).click();
    await wait('active parent tab', () => active(fixture.parent));
    await click('[role="tab"]', 'Commit', sidebar);

    const compare = async (action, path) => {
      const selection = await wait(`${action} ${path}`, () => named('button', `${action} ${path}`));
      selection.parentElement.click();
      const sector = action === 'Unstage' ? 'Staged' : 'Unstaged';
      const trigger = await wait(`Compare ${sector} ${path}`, () => {
        const diff = document.querySelector('[data-testid="diff"]');
        if (!diff?.querySelector(`[title="${CSS.escape(path)}"]`) ||
            ![...diff.querySelectorAll('span')].some(label => label.textContent === sector)) return null;
        return named('button', 'Compare submodule pins', diff);
      });
      trigger.click();
      return wait('pin comparison dialog', modal);
    };
    const close = async panel => {
      await click('button', 'Close', panel);
      await wait('dialog closed', () => !modal());
    };
    for (const [action, before, after, from, to] of [
      ['Unstage', fixture.before, fixture.index, 'native-original', 'native-index'],
      ['Stage', fixture.index, fixture.checkout, 'native-index', 'native-checkout'],
    ]) {
      operation = `F20 ${action}`;
      const panel = await compare(action, 'vendor/live');
      await wait('exact pins and local patch', () => {
        const pins = [...panel.querySelectorAll('code')].map(element => element.textContent);
        return pins.includes(before) && pins.includes(after) &&
          panel.textContent.includes(from) && panel.textContent.includes(to) && panel.textContent.includes('lib.txt');
      });
      steps.push(`F20 ${action}: ${before} → ${after}, ${from} → ${to}`);
      await close(panel);
    }
    for (const [action, path, selector, expected] of [
      ['Unstage', 'vendor/uninitialized', '[role="alert"]', 'Initialize this submodule'],
      ['Unstage', 'vendor/unavailable', '[role="alert"]', 'Required objects are missing'],
      ['Stage', 'vendor/dirty', '[role="status"]', 'Both sides point to the same submodule commit.'],
    ]) {
      operation = `F20 ${path}`;
      const panel = await compare(action, path);
      await wait(expected, () => [...panel.querySelectorAll(selector)].some(element => element.textContent.includes(expected)));
      steps.push(`F20 ${path}: ${expected}`);
      await close(panel);
    }
    await ipc('native_acceptance_result', { ok: true, steps });
  };
  run().catch(error => {
    void ipc('native_acceptance_result', { ok: false, operation, error: String(error), steps });
  });
})();
