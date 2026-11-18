// Runs in the fixture's incognito WKWebView against the built production UI.
(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const path = fixture.parent;
  const steps = [];
  let operation = 'storage and IPC isolation';
  const wait = async (label, find) => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const result = find();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}\n${document.body?.innerText.slice(0, 1500)}`);
  };
  const shown = element => element.getClientRects().length > 0;
  const button = (name, root = document) => [...root.querySelectorAll('button')].find(
    element => shown(element) && !element.disabled &&
      (element.getAttribute('aria-label') || element.textContent.trim()) === name,
  );
  const diff = () => document.querySelector('[data-testid="diff"]');
  const hunkButtons = (title, panel = diff()) => [...panel.querySelectorAll(`button[title="${title}"]`)].filter(shown);
  const fileButton = (action, file) => wait(`${action} ${file}`, () => button(`${action} ${file}`));
  const select = async (action, file) => {
    (await fileButton(action, file)).parentElement.click();
    const sector = action === 'Stage' ? 'Unstaged' : 'Staged';
    return wait(`${sector} ${file} diff`, () => {
      const panel = diff();
      return panel?.querySelector(`[title="${CSS.escape(file)}"]`) &&
        [...panel.querySelectorAll('span')].some(label => label.textContent === sector) ? panel : null;
    });
  };
  const readDiff = file => ipc('repo_file_diff', { path, file, untracked: false, includeFingerprint: true });
  const modePatch = 'diff --git a/mode.sh b/mode.sh\nold mode 100644\nnew mode 100755\n';
  const modeDiff = async action => {
    const panel = await select(action, 'mode.sh');
    await wait('mode notice and raw headers', () => {
      const text = panel.innerText;
      return text.includes('File mode changed') && text.includes('old mode 100644') && text.includes('new mode 100755');
    });
    if (['Stage hunk', 'Unstage hunk', 'Select line'].some(title => hunkButtons(title, panel).length) ||
        [...panel.querySelectorAll('button')].some(control => shown(control) && /^(Stage|Unstage|Discard) \d+ lines?$/.test(control.textContent.trim()))) {
      throw new Error('Mode-only diff exposed a hunk or line action');
    }
    const patch = await readDiff('mode.sh');
    const side = action === 'Stage' ? 'unstaged' : 'staged';
    const other = side === 'staged' ? 'unstaged' : 'staged';
    if (patch[side] !== modePatch || patch[other] !== null || patch.is_binary) {
      throw new Error(`Unexpected native mode patch for ${side}`);
    }
  };
  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [path], activePath: path, customFavicons: {} });
    seed('l8git-ui', { sidebarTab: 'commit' });
    const denied = await Promise.allSettled([
      ipc('open_repo', { path: fixture.outside }),
      ipc('secret_get', { path, key: 'native-acceptance-synthetic-probe' }),
      ipc('stage_files', { path, files: ['.'] }),
      ipc('git_apply_reviewed_hunks', { path, file: 'mode.sh', action: 'stage', patches: [modePatch] }),
    ]);
    if (denied.some(result => result.status !== 'rejected' || !String(result.reason).includes('fixture scope'))) {
      throw new Error('IPC did not reject an out-of-scope probe');
    }
    steps.push('Empty WebKit storage; out-of-scope repository, keychain, bulk stage and mode hunk IPC denied');

    operation = 'mode-only diff and whole-file round trip';
    await modeDiff('Stage');
    (await fileButton('Stage', 'mode.sh')).click();
    await modeDiff('Unstage');
    (await fileButton('Unstage', 'mode.sh')).click();
    await modeDiff('Stage');
    steps.push('Worktree and index displayed exact old mode 100644 / new mode 100755; whole-file stage/unstage; no hunk or line controls');

    operation = 'checked text-hunk round trip';
    await select('Stage', 'text.txt');
    const stage = await wait('two text hunks', () => {
      const controls = hunkButtons('Stage hunk');
      return controls.length === 2 && diff().innerText.includes('native-first-edit') &&
        diff().innerText.includes('native-second-edit') ? controls[0] : null;
    });
    stage.click();
    // Status can show the staged row before the panel finishes reloading the diff.
    await wait('remaining unstaged hunk', () => hunkButtons('Stage hunk').length === 1 &&
      diff().innerText.includes('native-second-edit') && !diff().innerText.includes('native-first-edit'));
    await select('Unstage', 'text.txt');
    const unstage = await wait('one staged text hunk', () => hunkButtons('Unstage hunk')[0]);
    const split = await readDiff('text.txt');
    if (!split.staged?.includes('+native-first-edit\n') || split.staged.includes('native-second-edit') ||
        !split.unstaged?.includes('+native-second-edit\n') || split.unstaged.includes('+native-first-edit\n')) {
      throw new Error('The checked stage action did not preserve the other unstaged hunk');
    }
    unstage.click();
    await wait('text hunk left the index', () => !button('Unstage text.txt'));
    const restored = await readDiff('text.txt');
    if (restored.staged !== null || !restored.unstaged?.includes('+native-first-edit\n') ||
        !restored.unstaged.includes('+native-second-edit\n')) {
      throw new Error('The checked unstage action did not restore both worktree hunks');
    }
    steps.push('Live checked Stage/Unstage hunk IPC moved only the first edit; second edit stayed in the worktree');
    await ipc('native_acceptance_result', { ok: true, steps });
  };
  run().catch(error => {
    void ipc('native_acceptance_result', { ok: false, operation, error: String(error), steps });
  });
})();
