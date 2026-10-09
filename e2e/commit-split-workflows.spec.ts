import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const labels = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const fixturePath = '/tmp/l8git-audit-fixture';
const checkedCommand = 'git_commit_split_group_checked';
const legacyMutations = ['stage_files', 'stage_hunk', 'unstage_hunk', 'commit_changes', 'git_reset'];
const checkedCalls = async (page: Page) => page.evaluate(command => window.__L8GIT_TEST_CALLS__!.filter(call => call.command === command), checkedCommand);

async function openSplit(page: Page, scene = 'split', holdPlanning = false) {
  const prompts: string[] = [];
  let releasePlanning!: () => void;
  const pendingPlanning = new Promise<void>(resolve => { releasePlanning = resolve; });
  const planning = { started: false, release: releasePlanning };
  await page.route('**/__fixture-ai/v1/responses', async route => {
    const request = route.request();
    const payload = request.postDataJSON() as { model: string; input: { role: string; content: { type: string; text?: string }[] }[] };
    expect(request.method()).toBe('POST');
    expect(request.headers().authorization).toBe('Bearer fixture-only-key');
    expect(payload.model).toBe('fixture-split-model');
    const prompt = payload.input.filter(message => message.role === 'user').flatMap(message => message.content)
      .filter(part => part.type === 'input_text').map(part => part.text ?? '').join('\n');
    prompts.push(prompt);
    const units = [...prompt.matchAll(/--- (u\d+) \|/g)].map(match => match[1]);
    expect(units.length).toBeGreaterThanOrEqual(2);
    const firstCount = units.length > 2 ? 2 : 1;
    const text = JSON.stringify({ groups: [
      { message: 'feat: first reviewed group', rationale: 'Keep the first concern together.', units: units.slice(0, firstCount) },
      { message: 'docs: second reviewed group', rationale: 'Keep the remaining concern separate.', units: units.slice(firstCount) },
    ] });
    if (holdPlanning) { planning.started = true; await pendingPlanning; }
    // The installed OpenAI Responses adapter consumes this real JSON response shape.
    await route.fulfill({ contentType: 'application/json', json: { id: `resp_fixture_${prompts.length}`, object: 'response',
      created_at: 1_791_000_000, status: 'completed', model: payload.model,
      output: [{ id: `msg_fixture_${prompts.length}`, type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }] }],
      usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } });
  });
  await page.goto(`/?scene=${scene}`, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: labels.commitSplit.title, exact: true });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if (!holdPlanning) await expect(dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true })).toBeEnabled();
  return { dialog, prompts, planning };
}

test('the actual split dialog creates two reviewed groups with one checked RPC each', async ({ page }) => {
  const { dialog, prompts } = await openSplit(page);
  await expect(dialog).toContainText('4 change units across 2 files');
  await expect(dialog.getByRole('textbox', { name: labels.commitPanel.messageLabel, exact: true })).toHaveCount(2);
  expect(prompts.at(-1)).toContain('new split 0');
  expect(prompts.at(-1)).toContain('new-notes.txt | new file');
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Split result')).toHaveText('{"committed":2,"cancelled":false}');
  const calls = await checkedCalls(page);
  expect(calls).toHaveLength(2);
  for (const call of calls) expect(call.args).toMatchObject({ path: fixturePath, files: ['example.txt', 'new-notes.txt'], sign: null });
  expect(calls[0].args?.selections).toEqual([{ file: 'example.txt', patches: [expect.stringContaining('new split 0'), expect.stringContaining('new split 1')] }]);
  expect(calls[1].args?.selections).toEqual([{ file: 'example.txt', patches: [expect.stringContaining('new split 2')] }, { file: 'new-notes.txt', patches: null }]);
  const first = calls[0].args?.expected as Record<string, unknown>;
  const second = calls[1].args?.expected as Record<string, unknown>;
  expect(second.head).not.toBe(first.head);
  expect(second.indexFingerprint).not.toBe(first.indexFingerprint);
  expect(second.worktreeFingerprint).toBe(first.worktreeFingerprint);
  const mutations = await page.evaluate(names => window.__L8GIT_TEST_CALLS__!.filter(call => names.includes(call.command)), [...legacyMutations, 'unstage_files']);
  expect(mutations).toEqual([]);
});

test('whole-file edits and later index changes reject the captured plan with visible guidance and preserve staging', async ({ page }) => {
  const { dialog } = await openSplit(page);
  // The whole-file unit has no displayed text hunk: its raw worktree token still guards it.
  await page.evaluate(() => { window.__L8GIT_SPLIT_FIXTURE__!.worktreeRevision += 1; });
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect(dialog).toContainText(labels.commitSplit.errorReviewChanged);
  expect(await page.evaluate(() => window.__L8GIT_SPLIT_FIXTURE__!.committed)).toBe(0);
  await dialog.getByRole('button', { name: labels.commitSplit.retry, exact: true }).click();
  await expect(dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const control = window.__L8GIT_SPLIT_FIXTURE__!;
    control.externalStage = true; control.indexRevision += 1; control.stagedFiles = ['new-notes.txt'];
  });
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect(dialog).toContainText(labels.commitSplit.errorStagingChanged);
  expect(await page.evaluate(() => ({ committed: window.__L8GIT_SPLIT_FIXTURE__!.committed, staged: window.__L8GIT_SPLIT_FIXTURE__!.stagedFiles })))
    .toEqual({ committed: 0, staged: ['new-notes.txt'] });
  const calls = await checkedCalls(page);
  expect(calls).toHaveLength(2);
  expect((calls[1].args?.expected as Record<string, unknown>).worktreeFingerprint)
    .not.toBe((calls[0].args?.expected as Record<string, unknown>).worktreeFingerprint);
  const reset = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => ['unstage_files', 'git_reset'].includes(call.command)));
  expect(reset).toEqual([]);
});

test('failure after the first split commit preserves staging and retry recollects only remaining changes', async ({ page }) => {
  const { dialog, prompts } = await openSplit(page);
  await page.evaluate(() => { window.__L8GIT_SPLIT_FIXTURE__!.failGroup = 2; });
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect(dialog).toContainText('Fixture commit hook rejected the second group');
  expect(await page.evaluate(() => ({ committed: window.__L8GIT_SPLIT_FIXTURE__!.committed, staged: window.__L8GIT_SPLIT_FIXTURE__!.stagedFiles })))
    .toEqual({ committed: 1, staged: ['example.txt', 'new-notes.txt'] });
  const beforeRetry = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.length);
  const rejected = await checkedCalls(page);
  expect(rejected).toHaveLength(2);
  const automaticReset = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.filter(call => ['unstage_files', 'git_reset'].includes(call.command)));
  expect(automaticReset).toEqual([]);
  await dialog.getByRole('button', { name: labels.commitSplit.retry, exact: true }).click();
  await expect(dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true })).toBeEnabled();
  await expect(dialog).toContainText('2 change units across 2 files');
  await expect(dialog).toContainText(labels.commitSplit.unstagedNotice);
  expect(prompts.at(-1)).toContain('new split 2');
  expect(prompts.at(-1)).not.toContain('new split 0');
  expect(prompts.at(-1)).not.toContain('new split 1');
  const retryReads = await page.evaluate(start => window.__L8GIT_TEST_CALLS__!.slice(start), beforeRetry);
  expect(retryReads.filter(call => call.command === 'git_commit_split_snapshot')).toHaveLength(2);
  expect(retryReads.filter(call => call.command === 'unstage_files')).toEqual([{ command: 'unstage_files', args: { path: fixturePath, files: ['.'] } }]);
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__L8GIT_SPLIT_FIXTURE__!.committed)).toBe(3);
  const all = await checkedCalls(page);
  expect(all).toHaveLength(4);
  expect((all[2].args?.expected as Record<string, unknown>).head).toBe((rejected[1].args?.expected as Record<string, unknown>).head);
  expect((all[2].args?.expected as Record<string, unknown>).indexFingerprint).not.toBe((rejected[1].args?.expected as Record<string, unknown>).indexFingerprint);
  expect(all[2].args?.selections).toEqual([{ file: 'example.txt', patches: [expect.stringContaining('new split 2')] }]);
  expect(all[3].args?.selections).toEqual([{ file: 'new-notes.txt', patches: null }]);
});

test('cancellation waits for an in-flight checked group and stops before the next commit', async ({ page }) => {
  const { dialog } = await openSplit(page);
  await page.evaluate(() => { window.__L8GIT_SPLIT_FIXTURE__!.holdGroup = 1; });
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__L8GIT_SPLIT_FIXTURE__!.pendingGroup)).toBe(1);
  await dialog.getByRole('button', { name: labels.commitSplit.cancelRun, exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__L8GIT_SPLIT_FIXTURE__!.committed)).toBe(0);
  expect(await checkedCalls(page)).toHaveLength(1);
  await page.evaluate(() => { window.__L8GIT_SPLIT_FIXTURE__!.releaseGroup!(); });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Split result')).toHaveText('{"committed":1,"cancelled":true}');
  expect(await checkedCalls(page)).toHaveLength(1);
  const remaining = await page.evaluate(() => window.__L8GIT_TEST_INVOKE__!('repo_status', { path: '/tmp/l8git-audit-fixture' })) as { path: string; staged: boolean; additions_unstaged: number }[];
  expect(remaining.map(entry => [entry.path, entry.staged, entry.additions_unstaged])).toEqual([['example.txt', false, 1], ['new-notes.txt', false, 1]]);
});

test('an agent worktree split belongs to the active base repository and drops a late proposal after its owner changes', async ({ page }) => {
  const { dialog } = await openSplit(page, 'split-worktree');
  await expect(dialog).toContainText('4 change units across 2 files');
  await dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Split result')).toHaveText('{"committed":2,"cancelled":false}');
  const calls = await checkedCalls(page);
  expect(calls).toHaveLength(2);
  expect(calls.every(call => call.args?.path === fixturePath)).toBe(true);

  const pending = await openSplit(page, 'split-worktree', true);
  await expect.poll(() => pending.planning.started).toBe(true);
  await page.evaluate(() => { window.__L8GIT_SPLIT_FIXTURE__!.changeOwner('/tmp/unrelated-owner'); });
  const response = page.waitForResponse(value => value.url().endsWith('/__fixture-ai/v1/responses'));
  pending.planning.release();
  await (await response).finished();
  // Drain rendering after the fulfilled response, rather than ending before a late proposal could publish.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(pending.dialog.getByRole('button', { name: labels.commitSplit.apply, exact: true })).toBeDisabled();
  await expect(pending.dialog.getByRole('textbox', { name: labels.commitPanel.messageLabel, exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Split result')).toBeEmpty();
  expect(await checkedCalls(page)).toEqual([]);
});
