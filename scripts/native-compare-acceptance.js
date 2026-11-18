// Drives the production Compare entry and reads its rendered Git results.
(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const visible = element => element?.getClientRects().length;
  const find = (selector, predicate, root = document) =>
    [...root.querySelectorAll(selector)].find(element => visible(element) && predicate(element));
  const named = (selector, name, root) => find(selector, element =>
    (element.getAttribute('aria-label') || element.textContent.trim()) === name, root);
  const compare = () => find('[role="dialog"]', dialog => dialog.innerText.includes('Compare commits and branches'));
  const tab = path => document.querySelector(`[data-repo-path="${CSS.escape(path)}"]`);
  const cases = fixture.cases;
  const steps = [];
  let operation = 'private storage and fixture scope';

  const wait = async (label, get) => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const item = await get();
      if (item) return item;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}\n${document.body?.innerText.slice(0, 2500)}`);
  };

  const fill = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const input = side => [...compare().querySelectorAll('label')].find(label => label.textContent.trim() === side)?.control;
  const open = async () => {
    (await wait('palette trigger', () => named('button', 'Jump to branch, commit, file…'))).click();
    const search = await wait('palette search', () => find('[role="dialog"] input[role="combobox"]', () => true));
    fill(search, 'compare');
    (await wait('Compare action', () => find('[role="option"]',
      option => option.innerText.trim() === 'Compare commits and branches'))).click();
    await wait('compare dialog', compare);
  };
  const submit = () => named('button', 'Compare', compare()).click();
  const choose = async (side, name, kind, ref) => {
    const trigger = await wait(`${side} reference picker`,
      () => named('button', `Choose reference for ${side}`, compare()));
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const suggestion = await wait(ref, () => find('[role="menuitemradio"]',
      item => item.title === ref && item.innerText.includes(name) && item.innerText.includes(kind)));
    suggestion.click();
    await wait('short display and qualified selection', () => input(side)?.value === name && input(side)?.title === ref);
  };
  const result = async (base, head) => {
    const title = `${base.sha} → ${head.sha}`;
    await wait(`summary and diff ${base.marker} → ${head.marker}`, () => {
      const dialog = compare();
      return dialog?.querySelector(`[title="${title}"]`) && dialog.innerText.includes('1 changed file') &&
        dialog.innerText.includes(base.marker) && dialog.innerText.includes(head.marker);
    });
  };

  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent, fixture.child], activePath: fixture.parent, customFavicons: {} });
    const denied = await Promise.allSettled([
      ipc('repo_compare_commits', { path: fixture.outside, base: 'HEAD~1', head: 'HEAD' }),
      ipc('git_fetch', { path: fixture.parent }),
    ]);
    if (denied.some(item => item.status !== 'rejected')) throw new Error('Unexpected fixture permissions');

    operation = 'regular palette and automatic tracked base';
    await open();
    await result(cases.base, cases.remote);
    if (input('Base')?.value !== 'origin/main' || input('Base')?.title !== 'refs/remotes/origin/main') {
      throw new Error('Automatic base lost its qualified tracking identity');
    }
    steps.push('Palette opened Compare with qualified origin/main base');
    fill(input('Base'), cases.base.sha);
    for (const [label, name, kind, ref] of [
      ['local', 'release', 'Local branch', 'refs/heads/release'],
      ['tag', 'release', 'Tag', 'refs/tags/release'],
      ['remote', 'origin/release', 'Remote branch', 'refs/remotes/origin/release'],
    ]) {
      operation = `select ${ref}`;
      await choose('Head', name, kind, ref);
      submit();
      await result(cases.base, cases[label]);
      steps.push(`${ref} pinned and rendered its expected commit and diff`);
    }

    operation = 'free revision and SHA';
    fill(input('Base'), 'HEAD~1');
    fill(input('Head'), cases.remote.sha);
    submit();
    await result(cases.tag, cases.remote);
    steps.push('Free HEAD~1 and full SHA produced the expected diff');

    operation = 'refresh a selected ref after external deletion';
    fill(input('Base'), cases.base.sha);
    await choose('Head', 'release', 'Local branch', 'refs/heads/release');
    submit();
    await result(cases.base, cases.local);
    await ipc('native_compare_delete');
    await wait('external deletion', () => ipc('native_compare_deleted'));
    named('button', 'Refresh comparison', compare()).click();
    await wait('clear error naming the missing exact ref', () => {
      const text = compare()?.innerText ?? '';
      return text.includes('Could not load the comparison') && text.includes('refs/heads/release') &&
        !text.includes(cases.local.marker) && named('button', 'Retry', compare());
    });
    if (input('Head')?.title !== 'refs/heads/release') throw new Error('Refresh changed selected identity');
    steps.push('Refresh surfaced missing exact ref and retained its selected identity');

    operation = 'switch repo and reopen Compare';
    named('button', 'Close', compare()).click();
    (await wait('other repository tab', () => tab(fixture.child))).click();
    await wait('other repo active', () => tab(fixture.child)?.dataset.active === 'true');
    await open();
    await result(cases.otherBase, cases.other);
    steps.push('Other repo resolved its own default revisions and diff');
    await ipc('native_acceptance_result', { ok: true, steps });
  };

  run().catch(error => {
    void ipc('native_acceptance_result', { ok: false, operation, error: String(error), steps });
  });
})();
