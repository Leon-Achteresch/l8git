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

  const activateByKeyboard = async (button, key) => {
    let keydown = false;
    let activation = false;
    button.addEventListener('keydown', event => {
      keydown = event.isTrusted && event.key === (key === 'Space' ? ' ' : 'Enter');
    }, { once: true });
    button.addEventListener('click', event => {
      activation = event.isTrusted && event.detail === 0;
    }, { once: true });
    button.focus();
    await wait('focus on action button', () => document.activeElement === button);
    await ipc('native_history_key', { key });
    await wait(`trusted keyboard activation with ${key}`, () => keydown && activation);
  };

  const fill = (input, value) => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const fillSearch = async query => fill(await wait('regular commit search input', searchInput), query);

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
      entries.forEach((entry, index) => { checkCommit(opened.commits[index], entry); });
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

  const historyPath = async () => {
    const historyForm = await wait('history filters form', () => document.querySelector('form[aria-label="History filters"]'));
    const query = named('input', 'Commit message', historyForm);
    const pathChip = () => find('button', element =>
      element.getAttribute('aria-label')?.startsWith('Remove File or directory filter:'));
    const hint = () => find('p', element => element.textContent.startsWith('Git simplifies path history.'));
    const shown = (sha, subject) => visible(row(sha)) && row(sha).innerText.includes(subject);
    const graph = () => shown(cases.merge, 'Merge side work') && shown(cases.original, 'Add document');
    const filtered = () => !row(cases.merge) && shown(cases.renamed, 'Rename document') &&
      shown(cases.original, 'Add document');

    operation = 'open regular two-parent history';
    await wait('merge and ordinary path hit', graph);
    if (hint()) throw new Error('Path hint appeared in the unfiltered graph');
    (await wait('advanced filters', () => named('button', 'Filters', historyForm))).click();
    const path = await wait('file or directory input', () => find('input[type="text"]', element =>
      element.closest('label')?.textContent.trim() === 'File or directory', historyForm));
    const applyPath = async (file, text = '') => {
      fill(path, file);
      if (text) fill(query, text);
      if (hint()) throw new Error('Path hint appeared before applying the draft');
      named('button', 'Apply', historyForm).click();
      await wait(`filtered rows for ${file}`, filtered);
      const chip = await wait('existing remove-path control', pathChip);
      const explanation = document.getElementById(chip.getAttribute('aria-describedby'));
      if (chip.getAttribute('aria-label') !== `Remove File or directory filter: ${file}` ||
          explanation !== hint() || !visible(explanation) ||
          !explanation.textContent.includes('Other filters stay active.')) {
        throw new Error('Missing visible path hint or accessible description of the remove control');
      }
      return chip;
    };
    const removePath = async (chip, key) => {
      await activateByKeyboard(chip, key);
      await wait('path cleared and focus restored to history search', () =>
        !pathChip() && !hint() && !path.value && document.activeElement === query);
    };

    for (const file of ['docs/', ':(glob)docs/**', 'docs/topic.txt']) {
      operation = `path filter and keyboard removal for ${file}`;
      const chip = await applyPath(file);
      if (file === 'docs/topic.txt' && !row(cases.renamed).innerText.includes('docs/old.txt')) {
        throw new Error('Single-file history did not show the predecessor path');
      }
      await removePath(chip, 'Enter');
      await wait('restored merge in the regular graph', graph);
      steps.push(`${file} omitted the merge, kept the path hit and restored the graph after trusted Enter`);
    }

    operation = 'remove path while keeping the combined message search';
    const chip = await applyPath('docs/', 'document');
    await removePath(chip, 'Space');
    await wait('message-only history results', filtered);
    if (query.value !== 'document' || !find('button', element =>
      element.getAttribute('aria-label') === 'Remove Commit message filter: document')) {
      throw new Error('Removing the path also removed the active message filter');
    }
    steps.push('Trusted Space removed only the path, retained the message filter and restored query focus');
  };

  const historyDates = async () => {
    const opened = await ipc('open_repo', { path: fixture.parent });
    for (const [entry, key] of [[cases.different, 'Enter'], [cases.equal, 'Space']]) {
      operation = `history and inspector dates for ${entry.subject}`;
      const commit = opened.commits.find(item => item.hash === entry.sha);
      if (commit?.date !== entry.committerISO) throw new Error('Native history IPC lost the committer ISO date');
      const historyTime = await wait('history committer time', () => row(entry.sha)?.querySelector('time'));
      const committerText = new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'medium' })
        .format(new Date(entry.committerISO));
      const hasTimeLabel = (time, label) => !!find('span.sr-only', span => span.textContent.trim() === `${label}:`, time) &&
        !time.closest('[aria-hidden="true"]');
      if (historyTime.dateTime !== entry.committerISO || historyTime.title !== `Committer date: ${committerText}` ||
          !hasTimeLabel(historyTime, 'Committer date')) {
        throw new Error(`History rendered a different time or label: ${historyTime.outerHTML}`);
      }

      row(entry.sha).firstElementChild.click();
      const disclosure = await wait(`collapsed inspector for ${entry.subject}`, () =>
        find('button[aria-expanded="false"]', button => button.title === `${entry.subject}\nShow metadata`));
      const inspectorTime = disclosure.querySelector('time');
      const authorDate = new Date(entry.authorISO);
      const authorText = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(authorDate);
      if (inspectorTime?.dateTime !== authorDate.toISOString() ||
          inspectorTime.title !== `Author date: ${authorText}` ||
          !hasTimeLabel(inspectorTime, 'Author date') ||
          !inspectorTime.textContent.includes(authorText) ||
          getComputedStyle(inspectorTime).position === 'absolute') {
        throw new Error(`Inspector rendered a different time or label: ${inspectorTime?.outerHTML}`);
      }

      await activateByKeyboard(disclosure, key);
      const expectedHeader = [`AuthorDate: ${entry.authorRaw}`, `CommitDate: ${entry.committerRaw}`];
      await wait('expanded Git dates and retained focus', () =>
        disclosure.getAttribute('aria-expanded') === 'true' && document.activeElement === disclosure &&
        find('pre', header => expectedHeader.every(line => header.textContent.split('\n').includes(line.trimEnd()))));
      steps.push(`${entry.subject}: history committer date, compact author date and both Git header labels match; ${key} retained focus`);
    }
  };

  const partialClone = async () => {
    const file = name => document.querySelector(`[data-file-path="${CSS.escape(name)}"]`);
    const missingText = 'This partial clone has the commit, but some file content needed for the diff is missing locally.';
    const missing = () => named('[role="status"]', missingText);
    const open = async sha => {
      const commit = await wait(`loaded commit ${sha}`, () => visible(row(sha)) && row(sha));
      commit.firstElementChild.click();
    };
    operation = 'partial clone inspector and unavailable parent blob';
    await open(cases.partial);
    await wait('missing content from proven promisor blob', missing);
    if (file('missing.txt')?.getAttribute('aria-pressed') !== 'true') {
      throw new Error('The missing-content hint appeared for the wrong file');
    }
    (await wait('readable file in the same commit', () => file('present.txt'))).click();
    await wait('readable patch and cleared unavailable hint', () =>
      file('present.txt')?.getAttribute('aria-pressed') === 'true' && !missing() &&
      document.body.innerText.split('\n').some(line => line.trim() === 'readable fixture line'));
    steps.push('Selected commit lists both files. Missing parent blob shows the partial-clone hint; the other file shows its patch.');

    operation = 'ordinary read failure in a different fixture repo';
    (await wait('ordinary fixture tab', () => tab(fixture.child))).click();
    await wait('ordinary fixture active', () => tab(fixture.child)?.dataset.active === 'true');
    await open(cases.ordinary);
    await wait('generic diff error', () => file('ordinary.txt')?.getAttribute('aria-pressed') === 'true' &&
      named('div', 'Could not load diff.') && !missing());
    steps.push('The ordinary missing object shows the generic diff failure after switching repositories.');
  };

  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent, fixture.child], activePath: fixture.parent, customFavicons: {} });
    seed('l8git-ui', { sidebarTab: 'history' });
    const denied = await Promise.allSettled([
      ipc('repo_search_commits', { path: fixture.outside, query: cases.partial ?? cases.loaded?.sha ?? cases.merge ?? cases.different?.sha ?? cases.primary[0].sha, skip: 0, limit: 80 }),
      ipc('git_fetch', { path: fixture.parent }),
    ]);
    if (denied.some(result => result.status !== 'rejected')) throw new Error('Unexpected fixture permissions');

    operation = 'regular History panel and an unloaded SHA-256 match';
    const sidebar = await wait('repository sidebar', () => document.querySelector('[data-testid="repository-sidebar"]'));
    (await wait('History tab', () => named('[role="tab"]', 'History', sidebar))).click();
    if (fixture.partialClone) {
      await partialClone();
      await ipc('native_acceptance_result', { ok: true, steps });
      return;
    }
    if (fixture.historyDates) {
      await historyDates();
      await ipc('native_acceptance_result', { ok: true, steps });
      return;
    }
    if (fixture.historyPath) {
      await historyPath();
      await ipc('native_acceptance_result', { ok: true, steps });
      return;
    }
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
