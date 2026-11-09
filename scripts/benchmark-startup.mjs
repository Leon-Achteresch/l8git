import { chromium, webkit } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Exercise the shipped entry point, not ui-test/audit-scenes (which eagerly imports
// test-only screens). Only native IPC is replaced; routing, hydration and chunks are real.
const runs = Number(process.env.STARTUP_RUNS ?? 5);
const throttle = Number(process.env.STARTUP_THROTTLE ?? 4);
if (!Number.isSafeInteger(runs) || runs < 3 || runs % 2 !== 1) throw Error('STARTUP_RUNS must be an odd integer >= 3');
if (!Number.isFinite(throttle) || throttle < 1) throw Error('STARTUP_THROTTLE must be >= 1');
const useWebkit = process.env.STARTUP_BROWSER === 'webkit';
const locale = process.env.STARTUP_LOCALE ?? 'de';
const trace = process.env.STARTUP_TRACE === '1' || !!process.env.STARTUP_PROFILE_DIR;
if (!['de', 'en', 'es', 'fr', 'pt', 'zh', 'ja'].includes(locale)) throw Error('Unknown STARTUP_LOCALE');
const labels = JSON.parse(await readFile(`src/locales/${locale}.json`, 'utf8'));
const server = await preview({ configFile: false, root: process.cwd(), build: { outDir: resolve(process.env.STARTUP_DIST ?? 'dist') }, preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
const browser = await (useWebkit ? webkit : chromium).launch();
const result = { scope: `Shipped production entry, ${locale} locale, ${useWebkit ? 'WebKit, no CPU throttle' : `Chromium, ${throttle}x CPU throttle`}, cold browser contexts, local HTTP, mocked native IPC (80 commits/1000 changed files). Excludes native process and WebView launch.${process.env.STARTUP_PROFILE_DIR ? ' CPU profiling enabled; timings are instrumented.' : ''}`, scenarios: {} };
try {
  for (const scenario of ['empty', 'commit', 'history']) {
    const samples = [];
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
      await context.addInitScript(({ scenario, locale, trace, emptyLabel }) => {
        const repoPath = '/tmp/startup-fixture';
        const save = (key, state) => localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
        save('l8git-locale', { locale });
        save('l8git-onboarding-prefs', { welcomeDismissed: true, tourDone: true });
        save('l8git-repo', { paths: scenario === 'empty' ? [] : [repoPath], activePath: scenario === 'empty' ? null : repoPath, customFavicons: {} });
        save('l8git-ui', { sidebarTab: scenario === 'history' ? 'history' : 'commit' });
        const commits = Array.from({ length: 80 }, (_, i) => ({ hash: (80 - i).toString(16).padStart(40, '0'), short_hash: String(80 - i), author: 'Fixture', email: 'fixture@example.com', date: '2026-11-01T12:00:00Z', subject: `Startup commit ${i}`, body: '', parents: i === 79 ? [] : [(79 - i).toString(16).padStart(40, '0')], tags: [] }));
        const entries = Array.from({ length: 1000 }, (_, i) => ({ path: `files/file-${String(i).padStart(4, '0')}.txt`, index_status: ' ', worktree_status: 'M', staged: false, unstaged: true, untracked: false, additions_staged: 0, deletions_staged: 0, additions_unstaged: 1, deletions_unstaged: 1, binary: false, embedded_repo: false }));
        window.__STARTUP_CALLS__ = [];
        let readyQueued = false;
        const seen = new Set();
        const milestones = { shell: '#main-content', commit: '[data-commit-message-input]', history: '[data-commit-hash]', files: '[data-testid="files"]' };
        if (trace) {
          window.__STARTUP_TIMELINE__ = [];
          window.__STARTUP_IPC_TIMES__ = [];
        }
        const observer = new MutationObserver(() => {
          if (trace) {
            for (const [name, selector] of Object.entries(milestones)) {
              if (!seen.has(name) && document.querySelector(selector)) {
                seen.add(name);
                window.__STARTUP_TIMELINE__.push({ name, at: performance.now() });
              }
            }
          }
          if (readyQueued) return;
          const ready = scenario === 'empty'
            ? [...document.querySelectorAll('#main-content button')].some(button => button.textContent.trim() === emptyLabel)
            : scenario === 'commit'
              ? document.querySelector('[data-commit-message-input]') && document.querySelector('[data-testid="files"]')?.textContent.includes('file-0000.txt')
              : document.querySelector('[data-commit-hash]')?.textContent.includes('Startup commit 0');
          if (!ready) return;
          readyQueued = true;
          // Time in the browser, before Playwright's selector polling/transport.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            window.__STARTUP_PAINT_READY_MS__ = performance.now();
            if (!trace) observer.disconnect();
          }));
        });
        observer.observe(document, { childList: true, subtree: true });
        // Tauri's API checks this flag separately from its IPC bridge.
        window.isTauri = true;
        window.__TAURI_INTERNALS__ = {
          metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
          transformCallback: () => 1,
          unregisterCallback: () => {},
          convertFileSrc: path => path,
          invoke: async (cmd, args) => {
            window.__STARTUP_CALLS__.push(cmd);
            window.__STARTUP_IPC_TIMES__?.push({ command: cmd, at: performance.now() });
            if (cmd.startsWith('plugin:event|')) return 1;
            if (cmd.startsWith('plugin:window|') || cmd.startsWith('plugin:webview|')) return null;
            if (cmd === 'open_repo') return { path: repoPath, branch: 'main', commits, branches: [{ name: 'main', is_current: true, is_remote: false, tip: commits[0].hash }], tags: [] };
            if (cmd === 'repo_status') return entries;
            if (cmd === 'repo_full_status') return { entries, upstream_sync: { ahead: 0, behind: 0 }, has_upstream: false };
            if (cmd === 'repo_log_page' || cmd === 'repo_history_page') return [];
            if (cmd === 'repo_commit_inspect') return { header: `commit ${args.commit}\nAuthor: Fixture <fixture@example.com>\nDate: 2026-11-01T12:00:00Z\n\n    Startup inspect details\n`, files: [] };
            if (cmd === 'commit_signature_status') return { state: 'unsigned', code: 'N', signer: null, key: null };
            if (cmd === 'rebase_status') return { in_progress: false, kind: 'none', step: 0, total: 0, conflicted_paths: [], todo: [] };
            if (cmd === 'merge_state' || cmd === 'cherry_pick_state') return { in_progress: false, conflicted_paths: [] };
            if (cmd === 'repo_upstream_sync_counts') return { ahead: 0, behind: 0 };
            if (cmd === 'branch_has_upstream') return false;
            if (['list_stashes', 'list_git_remotes', 'git_user_identities', 'detect_clis', 'list_repo_tools', 'repo_signing_keys', 'repo_diff_preview'].includes(cmd)) return [];
            if (cmd === 'repo_signing_info') return { commitSign: false, tagSign: false, toolAvailable: false };
            if (['secret_get', 'read_repo_favicon', 'repo_file_diff', 'git_credential_helper', 'pty_close_all', 'watch_repo', 'unwatch_repo'].includes(cmd)) return null;
            throw Error(`Unavailable in startup fixture: ${cmd}`);
          },
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      }, { scenario, locale, trace, emptyLabel: labels.emptyState.ctaOpen });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      const requestedScripts = [];
      page.on('request', request => {
        if (request.url().endsWith('.js')) requestedScripts.push(new URL(request.url()).pathname);
      });
      page.on('pageerror', error => errors.push(error.message));
      const cdp = useWebkit ? null : await context.newCDPSession(page);
      await cdp?.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await cdp?.send('Performance.enable');
      if (cdp && process.env.STARTUP_PROFILE_DIR) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
      }
      await page.goto('http://127.0.0.1:4177/', { waitUntil: 'commit' });
      if (scenario === 'empty') await page.getByRole('button', { name: labels.emptyState.ctaOpen, exact: true }).waitFor();
      else if (scenario === 'commit') {
        await page.locator('[data-commit-message-input]').waitFor();
        await page.getByText('file-0000.txt', { exact: true }).first().waitFor();
      } else await page.getByText('Startup commit 0', { exact: true }).first().waitFor();
      // Include a rendering opportunity after the ready DOM, not merely module evaluation.
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const sample = await page.evaluate(() => ({ readyMs: Math.round(performance.now()), paintReadyMs: Math.round(window.__STARTUP_PAINT_READY_MS__), jsBytes: performance.getEntriesByType('resource').filter(e => e.name.endsWith('.js')).reduce((sum, e) => sum + e.decodedBodySize, 0), scripts: performance.getEntriesByType('resource').filter(e => e.name.endsWith('.js')).map(e => new URL(e.name).pathname), calls: window.__STARTUP_CALLS__ }));
      if (!Number.isFinite(sample.paintReadyMs)) throw Error('Browser readiness signal missing');
      if (scenario !== 'empty' && sample.calls.filter(command => command === 'open_repo').length !== 1) {
        throw Error('Restoring a repository must issue exactly one initial open_repo');
      }
      sample.requestedScripts = [...requestedScripts];
      if (trace) sample.trace = await page.evaluate(() => ({
        milestones: window.__STARTUP_TIMELINE__, ipc: window.__STARTUP_IPC_TIMES__,
        resources: performance.getEntriesByType('resource').filter(e => e.name.endsWith('.js')).map(e => ({ name: new URL(e.name).pathname, start: e.startTime, end: e.responseEnd })),
      }));
      if (cdp && process.env.STARTUP_PROFILE_DIR) {
        const { profile } = await cdp.send('Profiler.stop');
        await mkdir(process.env.STARTUP_PROFILE_DIR, { recursive: true });
        await writeFile(resolve(process.env.STARTUP_PROFILE_DIR, `${scenario}-${run}.cpuprofile`), JSON.stringify(profile));
      }
      if (cdp) {
        const { metrics } = await cdp.send('Performance.getMetrics');
        sample.scriptMs = Math.round(1000 * metrics.find(m => m.name === 'ScriptDuration').value);
      }
      // Exercise the extracted palette on first use, close it via the global
      // shortcut, then reopen and verify that its query/focus reset still works.
      if (process.env.STARTUP_VERIFY_PALETTE !== '0') {
        await page.getByRole('button', { name: labels.appSearch.triggerPlaceholder, exact: true }).click();
        const palette = page.getByRole('combobox');
        const mod = await page.evaluate(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? 'Meta' : 'Control');
        await palette.fill('settings');
        await page.keyboard.press(`${mod}+k`);
        await palette.waitFor({ state: 'hidden' });
        await page.keyboard.press(`${mod}+k`);
        await palette.waitFor();
        if (await palette.inputValue() !== '') throw Error('Palette query was not reset');
        await palette.focus();
        await palette.fill('settings');
        await page.getByRole('option', { name: labels.appSearch.actionSettings, exact: true }).click();
      } else {
        await page.getByRole('link', { name: labels.header.settingsAria, exact: true }).click();
      }
      // Verify first-use loading and a return to the active repository as well.
      await page.getByRole('searchbox', { name: labels.audit.settingsSearch }).waitFor();
      await page.getByRole('link', { name: labels.header.repo, exact: true }).click();
      if (scenario === 'empty') await page.getByRole('button', { name: labels.emptyState.ctaOpen, exact: true }).waitFor();
      else if (scenario === 'commit') await page.locator('[data-commit-message-input]').waitFor();
      else {
        await page.getByText('Startup commit 0', { exact: true }).first().click();
        await page.getByRole('button', { name: /Startup inspect details/ }).waitFor();
        await page.getByRole('button', { name: labels.dialogs.closeAria, exact: true }).click();
        await page.getByRole('button', { name: /Startup inspect details/ }).waitFor({ state: 'hidden' });
        await page.getByText('Startup commit 0', { exact: true }).first().waitFor();
      }
      if (errors.length) throw Error(errors.join('; '));
      samples.push(sample);
      await context.close();
    }
    const metrics = Object.fromEntries(['readyMs', 'paintReadyMs', 'jsBytes', ...(useWebkit ? [] : ['scriptMs'])].map(key => [key, samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor(runs / 2)]]));
    result.scenarios[scenario] = { samples, metrics };
    console.log(scenario, metrics);
  }
  const output = process.env.STARTUP_OUT ?? 'test-results/startup.json';
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  if (process.env.STARTUP_CHECK_BUDGETS === '1') {
    for (const [scenario, { samples, metrics }] of Object.entries(result.scenarios)) {
      if (metrics.readyMs > 6000) throw Error(`${scenario}: startup exceeded 6000 ms`);
      for (const sample of samples) {
        const eagerDialog = sample.requestedScripts.find(path => /\/(app-command-palette|commit-split-dialog|rebase-interactive-editor|explain-sheet|commit-inspect-detail|issue-create-dialog)-/.test(path));
        if (eagerDialog) throw Error(`${scenario}: closed UI loaded at startup: ${eagerDialog}`);
      }
    }
  }
} finally {
  try {
    await browser.close();
  } finally {
    await new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done()));
  }
}
