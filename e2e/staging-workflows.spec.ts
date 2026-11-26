import { test, expect, type Page } from '@playwright/test';

async function previewDiscard(page: Page, name = 'Stage first.txt') {
  await page.getByRole('button', { name, exact: true }).locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Discard changes?', exact: true });
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeEnabled();
  return dialog;
}

test('the working copy finds the original filename only in the section containing the rename', async ({ page }) => {
  await page.goto('/?scene=working-rename&lang=en');
  const files = page.getByTestId('files');
  const staged = files.getByRole('button', { name: 'Unstage src/current.ts', exact: true });
  const unstaged = files.getByRole('button', { name: 'Stage src/current.ts', exact: true });
  await expect(staged).toBeVisible();
  await expect(unstaged).toBeVisible();
  await expect(files.getByTitle('docs/previous.md → src/current.ts', { exact: true })).toHaveText(/← docs\/previous\.md/);
  const filter = files.getByRole('textbox', { name: 'Filter files...', exact: true });
  await filter.fill('*.md');
  await expect(staged).toBeVisible();
  await expect(unstaged).toHaveCount(0);
  await filter.fill('current.ts');
  await expect(staged).toBeVisible();
  await expect(unstaged).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__;
    if (!original) throw Error('Working-copy fixture is unavailable');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== 'repo_diff_preview') return original(command, args);
      if (!args?.request) throw Error('Missing diff preview request');
      const { kind, file, previousFile } = args.request as { kind: string; file: string; previousFile?: string };
      document.documentElement.dataset.renamePreview = JSON.stringify([kind, file, previousFile ?? null]);
      return { patch: '', truncated: false, movedLines: [], binary: false, baseSha: null, headSha: null };
    };
  });
  await staged.locator('..').click();
  await page.getByRole('button', { name: 'Diff display options', exact: true }).click();
  await page.getByRole('button', { name: 'Ignore whitespace', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-rename-preview', JSON.stringify(['staged', 'src/current.ts', 'docs/previous.md']));
  await unstaged.locator('..').click();
  await expect(page.locator('html')).toHaveAttribute('data-rename-preview', JSON.stringify(['unstaged', 'src/current.ts', null]));
});

test('bulk staging reports mixed selections and disables actions for embedded repositories', async ({ page }) => {
  await page.goto('/?scene=working-rename&lang=en');
  const files = page.getByTestId('files');
  const filter = files.getByRole('textbox', { name: 'Filter files...', exact: true });
  const toolbar = files.locator('button[aria-pressed="mixed"]');
  await expect(toolbar).toHaveAccessibleName('Stage all files');
  await filter.fill('current.ts');
  await expect(toolbar).toHaveAccessibleName('Stage matching files');
  await filter.fill('previous.md');
  await expect(files.getByRole('button', { name: 'Unstage matching files', pressed: true })).toBeEnabled();
  await filter.fill('vendor/embedded');
  const stageButtons = files.getByRole('button', { name: 'Stage matching files', exact: true });
  await expect(stageButtons).toHaveCount(2);
  await expect(stageButtons.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(stageButtons.first()).toBeDisabled();
  await expect(stageButtons.nth(1)).toBeDisabled();
  await expect(files.getByRole('button', { name: 'Unstage matching files', exact: true })).toBeDisabled();
});

test('palette bulk actions recheck current files and preserve conflicts and embedded repositories', async ({ page }) => {
  await page.goto('/?scene=working-rename&lang=en');
  const jump = page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true });
  await expect(jump).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await invoke(command, args);
      if (command !== 'repo_status' || !Array.isArray(result)) return result;
      return result.map(entry => entry.path === 'other.txt'
        ? { ...entry, index_status: 'U', worktree_status: 'U', staged: true, unstaged: true } : entry);
    };
  });
  for (const [action, command] of [['Stage all', 'stage_files'], ['Unstage all', 'unstage_files']]) {
    await jump.click();
    await page.getByRole('combobox').fill(action);
    const option = page.getByRole('option', { name: action, exact: true });
    await expect(option).toBeEnabled();
    await option.click();
    await expect.poll(() => page.evaluate(command => window.__L8GIT_TEST_CALLS__?.find(call => call.command === command)?.args?.files, command)).toEqual(['src/current.ts']);
  }
  await page.goto('/?scene=conflict&lang=en');
  await jump.click();
  await page.getByRole('combobox').fill('stage all');
  await expect(page.getByRole('option', { name: 'Stage all', exact: true })).toBeDisabled();
  await expect(page.getByRole('option', { name: 'Unstage all', exact: true })).toBeDisabled();
});

test('the file editor recovers from a failed read and compares a rename against its original path', async ({ page }) => {
  await page.goto('/?scene=working-rename&lang=en');
  await page.getByRole('button', { name: 'Unstage src/current.ts', exact: true }).locator('..').click();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    let fail = true;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_file_content_at') {
        if (args?.file !== 'docs/previous.md') throw Error('Incorrect original filename');
        return 'before rename';
      }
      if (command === 'repo_read_file') {
        if (args?.file !== 'src/current.ts') throw Error('Incorrect working filename');
        if (fail) { fail = false; throw Error('Fixture read failed'); }
        return 'working text';
      }
      return invoke(command, args);
    };
  });
  await page.getByRole('radio', { name: 'Edit', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Fixture read failed' });
  await expect(alert).toBeVisible();
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await alert.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.monaco-diff-editor .modified .view-lines[role="presentation"]')).toContainText('working text');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('the editor saves the active repository once and preserves its UTF-8 BOM', async ({ page }) => {
  await page.goto('/?scene=worktree-catalog&lang=en');
  await expect(page.getByRole('radio', { name: 'Edit', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_file_content_at') return 'original';
      if (command === 'repo_read_file') return args?.path === '/tmp/l8git-catalog-other' ? '\uFEFFsecond' : '\uFEFFfirst';
      if (command === 'repo_write_file') {
        const state = document.documentElement.dataset;
        state.editorWrites = String(Number(state.editorWrites ?? 0) + 1);
        state.editorWrite = JSON.stringify(args);
        await new Promise<void>(resolve => window.addEventListener('finish-editor-save', () => resolve(), { once: true }));
        return null;
      }
      return invoke(command, args);
    };
  });
  await page.getByRole('radio', { name: 'Edit', exact: true }).click();
  const modified = page.locator('.monaco-diff-editor .modified .view-lines[role="presentation"]');
  await expect(modified).toContainText('first');
  await page.getByRole('button', { name: 'Jump to branch, commit, file…', exact: true }).click();
  await page.getByRole('combobox').fill('l8git-catalog-other');
  await page.getByRole('option', { name: 'Switch to: l8git-catalog-other', exact: true }).click();
  await page.getByRole('button', { name: 'Reload changes', exact: true }).click();
  await expect(modified).toContainText('second');
  await modified.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('!');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const modifier = await page.evaluate(() => navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control');
  await expect(save).toBeEnabled();
  await page.keyboard.press(`${modifier}+z`);
  await expect(save).toBeDisabled();
  await page.keyboard.insertText('?');
  await page.keyboard.press(`${modifier}+s`);
  await expect(page.locator('html')).toHaveAttribute('data-editor-writes', '1');
  await page.keyboard.press(`${modifier}+s`);
  await page.keyboard.insertText('x');
  await page.evaluate(() => window.dispatchEvent(new Event('finish-editor-save')));
  await expect(page.locator('html')).toHaveAttribute('data-editor-writes', '1');
  const write = await page.locator('html').getAttribute('data-editor-write');
  expect(JSON.parse(write ?? '{}')).toMatchObject({ path: '/tmp/l8git-catalog-other', file: 'example.txt', content: '\uFEFFsecond?', expected: { content: '\uFEFFsecond' } });
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('the editor compares external changes without losing unsaved input and checks the new disk version on save', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1100 });
  await page.goto('/?scene=worktree-catalog&lang=en');
  await expect(page.getByRole('radio', { name: 'Edit', exact: true })).toBeVisible();
  await page.evaluate(() => {
    let disk = 'initial';
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command === 'repo_file_content_at') return 'committed';
      if (command === 'repo_read_file') return disk;
      if (command === 'repo_write_file') {
        if (disk === 'initial') disk = 'external';
        if ((args?.expected as { content?: string } | undefined)?.content !== disk) {
          throw '\u001fThe file was changed in the meantime.\u001fl8e:{"code":"fs.fileChangedMeanwhile","params":{}}\u001f';
        }
        disk = String(args?.content);
        document.documentElement.dataset.savedDraft = disk;
        return null;
      }
      return invoke(command, args);
    };
  });
  await page.getByRole('radio', { name: 'Edit', exact: true }).click();
  const modified = page.locator('.monaco-diff-editor .modified .view-lines[role="presentation"]');
  await expect(modified).toContainText('initial');
  await modified.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' draft');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Compare with disk' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Review the disk version' })).toBeVisible();
  await expect(modified).toContainText('draft');
  await page.getByRole('radio', { name: 'Side by side' }).click();
  await expect(page.locator('.monaco-diff-editor .original .view-lines[role="presentation"]')).toContainText('external');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('html')).toHaveAttribute('data-saved-draft', 'initial draft');
});

test('adding an ignore rule uses the selected path and explains tracked files', async ({ page }) => {
  await page.goto('/?scene=literal-ignore&lang=en');
  const files = page.getByTestId('files');
  const selected = files.getByRole('button', { name: 'Stage item[a].txt', exact: true });
  await selected.locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to .gitignore', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.find(c => c.command === 'add_to_gitignore')?.args))
    .toMatchObject({ patterns: ['item[a].txt'], literalPaths: true });
  await expect(selected).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Stage itema.txt', exact: true })).toBeVisible();
  await files.getByRole('button', { name: 'Stage example.txt', exact: true }).locator('..').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Add ignore rule (file stays tracked)', exact: true })).toBeVisible();
});

test('large new files use a bounded display and a separate complete discard review', async ({ page }) => {
  await page.goto('/?scene=literal-ignore&lang=en');
  const file = page.getByRole('button', { name: 'Stage itema.txt', exact: true });
  await expect(file).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__;
    if (!invoke) throw Error('Missing fixture');
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (args?.file !== 'itema.txt') return invoke(command, args);
      if (command === 'repo_untracked_file_preview') return { text: 'First preview line\n', is_binary: false, truncated: true };
      if (command === 'repo_file_diff') {
        if (!args.includeFingerprint) throw Error('Unexpected full display read');
        const review = await invoke(command, args);
        return { ...(review as object), unstaged: null, untracked_plain: 'First preview line\n'.padEnd(11_999, 'x') + '🦀Last reviewed line\n' };
      }
      return invoke(command, args);
    };
  });
  await file.locator('..').click();
  await expect(page.getByText('First preview line', { exact: true })).toBeVisible();
  const notice = page.getByRole('status').filter({ hasText: '2,000 lines or 256 KiB' });
  await expect(notice).toBeVisible();
  const dialog = await previewDiscard(page, 'Stage itema.txt');
  await expect(dialog.locator('pre')).toHaveCount(0);
  await dialog.getByText('Preview affected changes', { exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Page 1 of 2');
  await expect(dialog.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await expect(dialog.locator('pre')).not.toContainText('Last reviewed line');
  await dialog.getByRole('button', { name: 'Next page' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Page 2 of 2');
  await expect(dialog.locator('pre')).toHaveText('🦀Last reviewed line');
  await expect(dialog.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Previous page' }).click();
  await expect(dialog.locator('pre')).toContainText('First preview line');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stage example.txt', exact: true }).locator('..').click();
  await expect(notice).toHaveCount(0);
});

test('a display-only diff refreshes with the working file and identifies a partial preview', async ({ page }) => {
  await page.goto('/?scene=partial-staging&lang=en');
  const files = page.getByTestId('files');
  await files.getByRole('button', { name: 'Stage first.txt', exact: true }).locator('..').click();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__;
    if (!original) throw Error('Working-copy fixture is unavailable');
    let reads = 0;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== 'repo_diff_preview') return original(command, args);
      if (!args?.request) throw Error('Missing diff preview request');
      const { file, context } = args.request as { file: string; context: number };
      const n = ++reads;
      if (n === 2) await new Promise<void>(resolve => {
        window.addEventListener('release-working-preview', () => resolve(), { once: true });
        document.documentElement.dataset.heldPreview = file;
      });
      const line = `Preview for ${file} version ${n} context ${context}`;
      return { patch: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+${line}\n`,
        movedLines: [], truncated: n === 1, binary: false, baseSha: null, headSha: null };
    };
  });
  const options = page.getByRole('button', { name: 'Diff display options', exact: true });
  await options.click();
  await page.getByRole('button', { name: 'Ignore whitespace', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Display diff truncated/)).toBeVisible();
  await expect(page.getByText('Preview for first.txt version 1 context 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reload diff', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-held-preview', 'first.txt');
  await files.getByRole('button', { name: 'Stage second.txt', exact: true }).locator('..').click();
  const current = page.getByText('Preview for second.txt version 3 context 3', { exact: true });
  await expect(current).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('release-working-preview')));
  await expect(current).toBeVisible();
  await expect(page.getByText(/Display diff truncated/)).toHaveCount(0);
  await expect(page.getByText(/Preview for first.txt/)).toHaveCount(0);
});

test('partially staged file actions follow the section that was clicked', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  await page.getByRole('button', { name: 'Unstage first.txt', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.filter(call => call.command === 'unstage_files').at(-1)?.args?.files)).toEqual(['first.txt']);
  await expect(page.getByRole('button', { name: 'Unstage first.txt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unstage second.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stage second.txt', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__L8GIT_TEST_CALLS__?.filter(call => call.command === 'stage_files').at(-1)?.args?.files)).toEqual(['second.txt']);
  await expect(page.getByRole('button', { name: 'Stage second.txt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stage third.txt', exact: true })).toBeVisible();
});

test('discarding the unstaged version preserves the reviewed index snapshot', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  const dialog = await previewDiscard(page);
  await expect(dialog).toContainText('Discard working tree changes; keep staged changes');
  await dialog.getByRole('checkbox', { name: 'Include first.txt in discard', exact: true }).uncheck();
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Include first.txt in discard', exact: true }).check();
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unstage first.txt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stage first.txt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stage second.txt', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__L8GIT_TEST_CALLS__ ?? []);
  const discard = calls.find(call => call.command === 'git_discard_worktree_changes');
  expect(discard?.args).toMatchObject({ files: ['first.txt'], untracked: [false] });
  expect(discard?.args?.expectedFingerprints).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
  expect(calls.some(call => call.command === 'git_discard_files')).toBe(false);
});

test('changed file contents require refreshing and reviewing the discard preview', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  const dialog = await previewDiscard(page);
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let changed = true;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await original(command, args);
      if (command === 'repo_file_diff' && args?.includeFingerprint && changed) {
        changed = false;
        return { ...(result as object), fingerprint: 'f'.repeat(64) };
      }
      return result;
    };
  });
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('These files changed since the preview: first.txt.');
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__L8GIT_TEST_CALLS__?.some(call => call.command.startsWith('git_discard')))).toBe(false);
  await dialog.getByRole('button', { name: 'Refresh preview', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('a backend file race is visible and keeps the discard dialog open', async ({ page }) => {
  await page.goto('/?scene=partial-staging');
  const dialog = await previewDiscard(page, 'Unstage first.txt');
  await expect(dialog).toContainText('Discard staged and working tree changes');
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = (command, args) => command === 'git_discard_files'
      ? Promise.reject(Error('__FILE_CHANGED__|first.txt')) : original(command, args);
  });
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('first.txt');
  await expect(dialog.getByRole('button', { name: 'Refresh preview', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unstage first.txt', exact: true })).toBeVisible();
});
