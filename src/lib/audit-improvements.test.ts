import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadCache, mapConcurrent } from './async-cache';
import { budgetContext } from './ai/context';
import { reviewAiContext, useAiContextReview } from './ai/context-review';
import { safeCommandDiagnostics } from './diagnostics';
import { exportPreferences, parsePreferences, applyPreferences } from './preferences-transfer';
import { useWorkspacePrefs } from './workspace-prefs';
import { useHistoryPrefs } from './history-prefs';
import { EMPTY_HISTORY_FILTER } from './history-filters';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }), removeItem: vi.fn((key: string) => { data.delete(key); }) };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return { data, ...storage };
});

beforeEach(() => { vi.restoreAllMocks(); storage.data.clear(); });

describe('shared reads', () => {
  it('deduplicates concurrent forced reads and lets failed requests retry', async () => {
    const cache = createReadCache<number>(30_000);
    const fail = vi.fn(async () => { throw new Error('offline'); });
    const first = cache.get('repo', fail);
    expect(cache.get('repo', fail, true)).toBe(first);
    await expect(first).rejects.toThrow('offline');
    expect(await cache.get('repo', async () => 42)).toBe(42);
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('limits concurrency and preserves input order', async () => {
    let active = 0, peak = 0;
    const results = await mapConcurrent([1, 2, 3, 4, 5], 2, async value => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});

describe('AI context controls', () => {
  it('keeps later files represented when the first file exceeds the budget', () => {
    const diff = `diff --git a/large.ts b/large.ts\n${'+large\n'.repeat(1000)}diff --git a/small.ts b/small.ts\n+critical change\n`;
    const result = budgetContext(diff, 1000);
    expect(result.length).toBeLessThanOrEqual(1000);
    expect(result).toContain('small.ts');
    expect(result).toContain('+critical change');
    expect(result).toContain('shortened');
  });
  it('respects very small budgets even when filenames exceed the limit', () => {
    const diff = `diff --git a/${'x'.repeat(1000)} b/${'x'.repeat(1000)}\n+data\n`;
    for (const budget of [0, 3, 63, 64, 100, 500]) expect(budgetContext(diff, budget).length).toBeLessThanOrEqual(budget);
  });
  it('sends the edited payload and clears a canceled preview', async () => {
    const review = reviewAiContext({ system: 'system', prompt: 'secret diff' });
    useAiContextReview.getState().pending!.resolve({ system: 'system', prompt: 'reviewed diff' });
    await expect(review).resolves.toEqual({ system: 'system', prompt: 'reviewed diff' });
    const abort = new AbortController();
    const canceled = reviewAiContext({ system: '', prompt: 'private' }, abort.signal);
    abort.abort();
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    expect(useAiContextReview.getState().pending).toBeNull();
  });
});

describe('local portability', () => {
  it('transfers named history searches and keeps them when importing an older snapshot', () => {
    const previous = useHistoryPrefs.getState().repositories;
    const filter = { ...EMPTY_HISTORY_FILTER, author: 'Reviewer', file: ' src/example.ts ' };
    useHistoryPrefs.setState({ repositories: { '/repo': { filter, presets: [{ id: 'preset', name: 'My reviews', filter, updatedAt: 123 }] } } });
    try {
      const exported = exportPreferences();
      expect(parsePreferences(JSON.stringify(exported)).history).toEqual(exported.history);
      const { history: _, ...legacy } = exported;
      expect(parsePreferences(JSON.stringify(legacy)).history).toEqual(exported.history);
      const unknown = { ...exported, history: { '/repo': { ...exported.history['/repo'], secret: 'SHOULD_NOT_TRANSFER', command: 'DONT_RUN' } } };
      expect(JSON.stringify(parsePreferences(JSON.stringify(unknown)))).not.toMatch(/SHOULD_NOT_TRANSFER|DONT_RUN/);
      expect(() => parsePreferences(JSON.stringify({ ...exported, history: { '/repo': { filter: { ...filter, since: '2026-02-30' }, presets: [] } } }))).toThrow('date range');
      expect(() => parsePreferences(JSON.stringify({ ...exported, history: { '/repo': { filter: { ...filter, refs: ['--all'] }, presets: [] } } }))).toThrow('reference');
    } finally { useHistoryPrefs.setState({ repositories: previous }); }
  });
  it('allowlists imports and never exports credential or executable settings', () => {
    const clean = exportPreferences();
    const parsed = parsePreferences(JSON.stringify({ ...clean, apiKey: 'SECRET', layout: { ...clean.layout, terminalCommand: 'danger' } }));
    expect(JSON.stringify(parsed)).not.toMatch(/SECRET|danger|apiKey|terminalCommand/);
    expect(parsed).toEqual(clean);
  });
  it('rejects invalid snapshots before changing state', () => {
    const before = exportPreferences();
    expect(() => applyPreferences({ ...before, activeWorkspaceId: 'missing' })).toThrow();
    expect(exportPreferences()).toEqual(before);
  });
  it('rolls back persisted writes when storage fills without changing the visible preferences', () => {
    const before = exportPreferences();
    storage.data.set('l8git-workspace-prefs', 'original');
    storage.setItem.mockImplementationOnce((key, value) => { storage.data.set(key, value); }).mockImplementationOnce(() => { throw new Error('quota'); });
    expect(() => applyPreferences({ ...before, layout: { ...before.layout, uiDensity: 'compact' } })).toThrow('quota');
    expect(storage.data.get('l8git-workspace-prefs')).toBe('original');
    expect(exportPreferences()).toEqual(before);
  });
  it('applies a valid import to persisted and visible state', () => {
    const before = exportPreferences();
    applyPreferences({ ...before, layout: { ...before.layout, uiDensity: 'compact' } });
    expect(useWorkspacePrefs.getState().uiDensity).toBe('compact');
    expect(JSON.parse(storage.data.get('l8git-workspace-prefs')!).state.uiDensity).toBe('compact');
    applyPreferences(before);
  });
  it('omits paths, credentials and arbitrary arguments from diagnostics', () => {
    const result = safeCommandDiagnostics([{ seq: 1, repoPath: '/private/client', args: ['push', 'https://secret:token@example.com/private'], exitOk: false, durationMs: 54, startedAt: '2026-09-05T12:00:00Z' }]);
    expect(JSON.stringify(result)).not.toMatch(/secret|token|client|example|private/);
    expect(result[0]).toMatchObject({ command: 'push', ok: false });
  });
});


describe('file exclusion from AI context', () => {
  it('removes every copy of a patch and keeps subsequent instructions and files', async () => {
    const { excludeDiffFile } = await import('./ai/context');
    const patch = 'diff --git a/secret.txt b/secret.txt\nindex 123..456 100644\n--- a/secret.txt\n+++ b/secret.txt\n@@ -1 +1 @@\n-old\n+private\n';
    const safe = 'diff --git a/safe.txt b/safe.txt\n--- a/safe.txt\n+++ b/safe.txt\n@@ -1 +1 @@\n-old\n+safe\n';
    const result = excludeDiffFile('Instructions\n' + patch + safe + '\n</diff>\nKeep this instruction.\n' + patch + '\nReturn JSON.', 'secret.txt');
    expect(result).not.toContain('private');
    expect(result).not.toContain('secret.txt');
    expect(result).toContain(safe);
    expect(result).toContain('Keep this instruction.');
    expect(result).toContain('Return JSON.');
  });
});
