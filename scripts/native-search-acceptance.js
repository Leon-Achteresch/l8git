// Exercises the production commit search through the private Tauri WebView.
(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const visible = element => element?.getClientRects().length;
  const find = (selector, predicate, root = document) =>
    [...root.querySelectorAll(selector)].find(element => visible(element) && predicate(element));
  const named = (selector, name, root) => find(selector, element =>
    (element.getAttribute('aria-label') || element.textContent.trim()) === name, root);
  const searchInput = () => named('input', 'Commit search');
  const next = () => named('button', 'Next search match');
  const row = sha => document.querySelector(`[data-commit-hash="${CSS.escape(sha)}"]`);
  const tab = path => document.querySelector(`[data-repo-path="${CSS.escape(path)}"]`);
  const { cases } = fixture;
  const steps = [];
  let operation = 'private storage and IPC scope';

  const wait = async (label, get) => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const item = get();
      if (item) return item;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}\n${document.body?.innerText.slice(0, 2200)}`);
  };

  const fillSearch = async query => {
    const input = await wait('regular commit search input', searchInput);
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const search = async (query, hits) => {
    await fillSearch(query);
    await wait(`${hits} matches for ${query}`, () =>
      find(`[title="${hits} matches"]`, element => element.textContent.trim() === String(hits)) &&
      next()?.disabled === (hits === 0));
  };

  const focusMatch = async testCase => {
    next().click();
    return wait(`focus on full ID ${testCase.sha}`, () => {
      const item = row(testCase.sha);
      return item && document.activeElement === item && item;
    });
  };

  const details = async testCase => {
    const focused = await focusMatch(testCase);
    focused.firstElementChild.click();
    return wait(`details for ${testCase.subject}`, () =>
      find('[data-file-path="fixture.txt"]', () => true) &&
      find('button[title]', button => button.title === `${testCase.subject}\nShow metadata`));
  };

  const historyText = async () => {
    const checkRow = testCase => wait(`history subject ${testCase.subject}`, () => {
      const item = row(testCase.sha);
      return item && find('span', element => element.textContent === testCase.subject, item);
    });
    const checkCommit = (commit, testCase) => {
      if (commit?.hash !== testCase.sha || commit.subject !== testCase.subject || commit.body !== testCase.body + '\n') {
        throw new Error(`Unexpected native history response for ${testCase.subject}: ${JSON.stringify(commit)}`);
      }
    };
    for (const [path, entries] of [[fixture.parent, cases.primary], [fixture.child, cases.other]]) {
      operation = `open history in ${path}`;
      if (path === fixture.child) {
        (await wait('SHA-1 repository tab', () => tab(path))).click();
        await wait('SHA-1 repository active and query reset', () =>
          tab(path).dataset.active === 'true' && searchInput()?.value === '');
      }
      for (const entry of entries) await checkRow(entry);
      const opened = await ipc('open_repo', { path });
      entries.forEach((entry, index) => checkCommit(opened.commits[index], entry));
      steps.push(`Exact initial history subjects and bodies for ${entries[0].sha.length}-character IDs`);

      if (path === fixture.parent) {
        operation = 'scroll SHA-256 history past the first page';
        if (row(cases.older.sha) || opened.commits.length !== 80) throw new Error('Unexpected initial page');
        const viewport = row(entries[0].sha).closest('.overflow-y-auto');
        viewport.scrollTop = viewport.scrollHeight;
        await checkRow(cases.older);
        const page = await ipc('repo_log_page', { path, skip: 80, limit: 80 });
        checkCommit(page.at(-1), cases.older);
        viewport.scrollTop = 0;
        await checkRow(entries[0]);
        steps.push('Scrolled to the next native history page and verified the older Latin-1 commit subject and body');
      }
      for (const entry of entries) {
        operation = `full ID, text search and detail for ${entry.subject}`;
        // A one-letter draft clears the store synchronously in the toolbar
        // effect and avoids mistaking a previous one-hit count for this query.
        for (const query of [entry.sha.toUpperCase(), entry.body]) {
          await fillSearch('x');
          await wait('previous commit search cleared', () => next()?.disabled);
          await search(query, 1);
          if (query === entry.body) {
            (await details(entry)).click();
            await wait(`expanded body for ${entry.subject}`, () =>
              find('div', element => element.childElementCount === 0 && element.textContent === entry.body));
          } else {
            await focusMatch(entry);
          }
        }
        steps.push(`Exact full ID and body searches plus rendered detail for ${entry.subject}`);
      }
    }
  };

  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent, fixture.child], activePath: fixture.parent, customFavicons: {} });
    seed('l8git-ui', { sidebarTab: 'history' });
    const denied = await Promise.allSettled([
      ipc('repo_search_commits', { path: fixture.outside, query: cases.loaded?.sha ?? cases.primary[0].sha, skip: 0, limit: 80 }),
      ipc('git_fetch', { path: fixture.parent }),
    ]);
    if (denied.some(result => result.status !== 'rejected')) throw new Error('Unexpected fixture permissions');

    operation = 'regular History panel and an unloaded SHA-256 match';
    const sidebar = await wait('repository sidebar', () => document.querySelector('[data-testid="repository-sidebar"]'));
    (await wait('History tab', () => named('[role="tab"]', 'History', sidebar))).click();
    if (fixture.historyText) {
      await historyText();
      await ipc('native_acceptance_result', { ok: true, steps });
      return;
    }
    await wait('loaded history row', () => visible(row(cases.loaded.sha)));
    await search(cases.old.sha, 1);
    next().focus();
    next().click();
    // The existing history-focus path can retry until its delayed focus pass.
    await new Promise(resolve => setTimeout(resolve, 550));
    if (row(cases.old.sha) || document.activeElement !== next()) {
      throw new Error('Next match moved focus for an unloaded history row');
    }
    steps.push('Full SHA-256 below the initial page counted once. Next match left focus in place.');

    operation = 'existing blob is not a commit hit';
    await search(cases.blob, 0);
    steps.push('Existing blob SHA-256 returned zero matches even though a commit mentions it.');

    operation = 'full uppercase SHA-256, focus, and commit details';
    await search(cases.loaded.sha.toUpperCase(), 1);
    await details(cases.loaded);
    steps.push('Uppercase SHA-256 returned one match, focused the full ID, and opened the expected details.');

    operation = 'a locally missing SHA-256';
    await search(cases.missing, 0);
    steps.push('Missing SHA-256 returned zero matches even though a commit mentions it.');

    operation = 'switch to SHA-1 and open its exact match';
    (await wait('SHA-1 repository tab', () => tab(fixture.child))).click();
    await wait('SHA-1 repository active and query reset', () =>
      tab(fixture.child).dataset.active === 'true' && searchInput()?.value === '' && visible(row(cases.other.sha)));
    if (row(cases.loaded.sha)) throw new Error('The SHA-256 row remained in the SHA-1 repository');
    await search(cases.other.sha, 1);
    await details(cases.other);
    await search(cases.loaded.sha, 0);
    steps.push('Repo switch reset the query. The SHA-1 hit focused and opened its own details. The prior SHA-256 had no match.');
    await ipc('native_acceptance_result', { ok: true, steps });
  };

  run().catch(error => {
    void ipc('native_acceptance_result', { ok: false, operation, error: String(error), steps });
  });
})();
