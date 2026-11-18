// Drives the bundled History panel using real Tauri IPC.
(() => {
  if (location.protocol !== 'tauri:' || location.hostname !== 'localhost') return;
  const ipc = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const count = () => ipc('native_notes_count');
  const visible = element => element?.getClientRects().length;
  const find = (selector, predicate, root = document) =>
    [...root.querySelectorAll(selector)].find(element => visible(element) && predicate(element));
  const named = (selector, name, root) => find(selector, element =>
    (element.getAttribute('aria-label') || element.textContent.trim()) === name, root);
  const trigger = () => named('button', 'Local Git note');
  const region = () => document.getElementById(trigger()?.getAttribute('aria-controls'));
  const note = () => find('pre', element => element.getAttribute('aria-label') === 'Local Git note', region() || document);
  const ref = () => region() && named('code', 'refs/notes/commits', region());
  const status = message => region() && named('[role="status"]', message, region());
  const tab = path => document.querySelector(`[data-repo-path="${CSS.escape(path)}"]`);
  const metadata = testCase => find('button[title]', button => button.title === `${testCase.subject}\nShow metadata`);
  const steps = [];
  let operation = 'private storage and IPC scope';
  let reads = 0;

  const wait = async (label, find) => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const item = find();
      if (item) return item;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}\n${document.body?.innerText.slice(0, 1700)}`);
  };

  const expectCount = async () => {
    const observed = await count();
    if (observed !== reads) throw new Error(`Expected ${reads} Notes IPC calls, saw ${observed}`);
  };

  const details = async testCase => {
    await wait(`collapsed detail for ${testCase.subject}`, () => metadata(testCase) && trigger()?.getAttribute('aria-expanded') === 'false' &&
      find('[data-file-path="fixture.txt"]', () => true));
    if (note() || ref()) throw new Error('Previous note is visible in a newly selected commit');
    await expectCount();
  };

  const inspect = async testCase => {
    const row = await wait(`history row for ${testCase.subject}`, () =>
      find(`[data-commit-hash="${CSS.escape(testCase.sha)}"] > div`, () => true));
    row.click();
    await details(testCase);
  };

  const reveal = async (kind, result) => {
    operation = `explicit Notes disclosure for ${kind}`;
    trigger().click();
    reads++;
    await wait(kind, result);
    if (trigger().getAttribute('aria-expanded') !== 'true') throw new Error('Notes disclosure did not expand');
    await expectCount();
    steps.push(kind);
  };

  const run = async () => {
    if (localStorage.length !== 0) throw new Error('WebKit storage was not empty at startup');
    const seed = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    seed('l8git-locale', { locale: 'en' });
    seed('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
    seed('l8git-repo', { paths: [fixture.parent, fixture.child], activePath: fixture.parent, customFavicons: {} });
    seed('l8git-ui', { sidebarTab: 'history' });
    const cases = fixture.cases;
    const denied = await Promise.allSettled([
      ipc('repo_commit_note', { path: fixture.outside, commit: cases.literal.sha }),
      ipc('stage_files', { path: fixture.parent, files: ['fixture.txt'] }),
    ]);
    if (denied.some(result => result.status !== 'rejected')) throw new Error('Unexpected fixture permission');

    operation = 'normal History panel and commit detail';
    const sidebar = await wait('repository sidebar', () => document.querySelector('[data-testid="repository-sidebar"]'));
    (await wait('History tab', () => named('[role="tab"]', 'History', sidebar))).click();
    await inspect(cases.literal);
    metadata(cases.literal).click();
    await wait('ordinary message and file diff', () => document.body.innerText.includes('Ordinary F42 commit body') &&
      document.body.innerText.includes(`${cases.literal.subject} patch line`));
    await expectCount();
    steps.push('History, commit selection, commit body and file diff without a Notes request');

    await reveal('literal text and source ref', () => ref() && note()?.textContent === fixture.literal);
    if (note().childElementCount || !document.body.innerText.includes('Ordinary F42 commit body') ||
        !document.body.innerText.includes(`${cases.literal.subject} patch line`)) {
      throw new Error('Note changed markup or displaced the normal commit details');
    }
    metadata(cases.literal).click();

    await inspect(cases.missing);
    await reveal('missing mapping with source ref', () => ref() && status('No local note for this commit under this ref.'));
    await inspect(cases.empty);
    await reveal('empty blob with source ref', () => ref() && status('This Git note is empty.'));
    await inspect(cases.exact);
    await reveal('exactly 65536 bytes', () => ref() && note()?.textContent === 'x'.repeat(65536));
    await inspect(cases.oversized);
    await reveal('65537 bytes rejected', () => ref() && status('This Git note exceeds the 64 KiB display limit.'));
    if (note()) throw new Error('Oversized note left visible text');
    await inspect(cases.error);
    await reveal('missing blob is a read error', () => status('Could not read the local Git note.') &&
      named('button', 'Retry', region()) && !note());

    operation = 'switch to independent repository';
    tab(fixture.child).click();
    await wait('other repo tab', () => tab(fixture.child).dataset.active === 'true');
    await inspect(cases.other);
    await reveal('other repo note on the same SHA', () => ref() && note()?.textContent === fixture.otherLiteral);

    operation = 'return to original repository';
    tab(fixture.parent).click();
    await wait('original repo tab', () => tab(fixture.parent).dataset.active === 'true');
    await details(cases.error);
    await inspect(cases.literal);
    await reveal('original repo note after return', () => ref() && note()?.textContent === fixture.literal);
    await ipc('native_acceptance_result', { ok: true, reads, steps });
  };

  run().catch(error => {
    void ipc('native_acceptance_result', { ok: false, operation, error: String(error), steps });
  });
})();
