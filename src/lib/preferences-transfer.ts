import type { PersistOptions } from 'zustand/middleware';
import { useWorkspacePrefs } from './workspace-prefs';
import { useWorkspaceStore, type Workspace } from './workspace-store';
import { useSidebarPrefs, ALL_SIDEBAR_TABS } from './sidebar-prefs';
import { useHotkeyPrefs, sanitizeHotkeyOverrides } from './hotkey-prefs';
import { useAiPromptPrefs, sanitizePromptOverrides } from './ai/prompt-prefs';
import { useRepoGroupsStore, type ForestNode } from './repo-groups-store';
import { useHistoryPrefs } from './history-prefs';
import { sanitizeHistoryFilter, sanitizeHistoryPresets, validateHistoryDates, MAX_HISTORY_PRESETS } from './history-filters';

export function exportPreferences() {
  const { uiScale, uiDensity, navLabels, previewAiContext } = useWorkspacePrefs.getState();
  const { tabOrder, hiddenTabs, displayMode, tabSize, tabLayout } = useSidebarPrefs.getState();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState();
  return { format: 'l8git-preferences', version: 1, layout: { uiScale, uiDensity, navLabels, previewAiContext }, sidebar: { tabOrder, hiddenTabs, displayMode, tabSize, tabLayout }, workspaces, activeWorkspaceId, shortcuts: useHotkeyPrefs.getState().overrides, prompts: useAiPromptPrefs.getState().overrides, repoPrompts: useAiPromptPrefs.getState().repoOverrides, groups: useRepoGroupsStore.getState().forest, history: useHistoryPrefs.getState().repositories };
}
export type PreferencesExport = ReturnType<typeof exportPreferences>;
const record = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Invalid settings object');
  return x as Record<string, unknown>;
};
const string = (x: unknown) => { if (typeof x !== 'string' || x.length > 50_000) throw new Error('Invalid text'); return x; };
const strings = (x: unknown): string[] => { if (!Array.isArray(x) || x.length > 1000) throw new Error('Invalid list'); return x.map(string); };
const choice = <T extends string>(x: unknown, allowed: readonly T[]): T => { if (!allowed.includes(x as T)) throw new Error('Invalid setting value'); return x as T; };
const bool = (x: unknown) => { if (typeof x !== 'boolean') throw new Error('Invalid boolean'); return x; };
function historyPreferences(input: unknown): PreferencesExport['history'] {
  const entries = Object.entries(record(input));
  if (entries.length > 1000) throw new Error('Too many repository history settings');
  const filter = (input: unknown) => {
    const raw = record(input);
    const refs = strings(raw.refs);
    if (refs.some(ref => !ref.trim() || ref.trim().startsWith('-') || /[\x00-\x1f\x7f]/.test(ref))) throw new Error('Invalid history reference');
    const value = sanitizeHistoryFilter({ refs, ...Object.fromEntries(['author', 'since', 'until', 'query', 'file'].map(key => [key, string(raw[key])])) });
    if (validateHistoryDates(value)) throw new Error('Invalid history date range');
    return value;
  };
  return Object.fromEntries(entries.map(([path, input]) => {
    string(path);
    if (!path) throw new Error('Missing repository history path');
    const raw = record(input);
    if (!Array.isArray(raw.presets) || raw.presets.length > MAX_HISTORY_PRESETS) throw new Error('Invalid saved searches');
    const presets = raw.presets.map(input => {
      const preset = record(input);
      const id = string(preset.id), name = string(preset.name);
      if (!id || !name.trim() || name.length > 80 || typeof preset.updatedAt !== 'number' || !Number.isFinite(preset.updatedAt)) throw new Error('Invalid saved search');
      return { id, name, updatedAt: preset.updatedAt, filter: filter(preset.filter) };
    });
    const sanitized = sanitizeHistoryPresets(presets);
    if (sanitized.length !== presets.length) throw new Error('Invalid or duplicate saved searches');
    return [path, { filter: filter(raw.filter), presets: sanitized }];
  }));
}
function forest(input: unknown, depth = 0): ForestNode[] {
  if (depth > 12 || !Array.isArray(input) || input.length > 1000) throw new Error('Invalid repository groups');
  return input.map(item => {
    const n = record(item);
    if (n.type === 'repo') return { type: 'repo', path: string(n.path) };
    if (n.type !== 'group' || typeof n.hue !== 'number' || !Number.isFinite(n.hue)) throw new Error('Invalid group');
    return { type: 'group', id: string(n.id), name: string(n.name), hue: Math.min(360, Math.max(0, n.hue)), collapsed: bool(n.collapsed), children: forest(n.children, depth + 1) };
  });
}
/** Construct an allowlisted snapshot. Unknown fields, credentials and commands are never applied. */
export function parsePreferences(raw: string): PreferencesExport {
  if (raw.length > 2_000_000) throw new Error('File exceeds 2 MB');
  const root = record(JSON.parse(raw));
  if (root.format !== 'l8git-preferences' || root.version !== 1) throw new Error('Unsupported preferences format');
  const l = record(root.layout), s = record(root.sidebar);
  if (typeof l.uiScale !== 'number' || !Number.isFinite(l.uiScale) || l.uiScale < .7 || l.uiScale > 1.5) throw new Error('Invalid UI scale');
  const order = strings(s.tabOrder).map(v => choice(v, ALL_SIDEBAR_TABS));
  if (new Set(order).size !== ALL_SIDEBAR_TABS.length || order.length !== ALL_SIDEBAR_TABS.length) throw new Error('Invalid tab order');
  if (!Array.isArray(root.workspaces) || root.workspaces.length < 1 || root.workspaces.length > 100) throw new Error('Invalid workspaces');
  const workspaces: Workspace[] = root.workspaces.map(item => { const w = record(item); return { id: string(w.id), name: string(w.name), repoPaths: strings(w.repoPaths) }; });
  if (new Set(workspaces.map(w => w.id)).size !== workspaces.length) throw new Error('Duplicate workspace');
  const activeWorkspaceId = string(root.activeWorkspaceId);
  if (!workspaces.some(w => w.id === activeWorkspaceId)) throw new Error('Unknown active workspace');
  return { format: 'l8git-preferences', version: 1, layout: { uiScale: l.uiScale, uiDensity: choice(l.uiDensity, ['compact','comfortable']), navLabels: bool(l.navLabels), previewAiContext: bool(l.previewAiContext) }, sidebar: { tabOrder: order, hiddenTabs: strings(s.hiddenTabs).map(v => choice(v, ALL_SIDEBAR_TABS)), displayMode: choice(s.displayMode, ['full','icons_only','labels_only']), tabSize: choice(s.tabSize, ['compact','normal','large']), tabLayout: choice(s.tabLayout, ['list','grid']) }, workspaces, activeWorkspaceId, shortcuts: sanitizeHotkeyOverrides(root.shortcuts), prompts: sanitizePromptOverrides(root.prompts), repoPrompts: Object.fromEntries(Object.entries(record(root.repoPrompts ?? {})).map(([key, value]) => [string(key), string(value)])), groups: forest(root.groups), history: root.history === undefined ? useHistoryPrefs.getState().repositories : historyPreferences(root.history) };
}
function prepareChange<S, P>(store: { getState: () => S; setState: (state: Partial<S>) => void; persist: { getOptions: () => Partial<PersistOptions<S, P>>; setOptions: (options: Partial<PersistOptions<S, P>>) => void } }, patch: Partial<S>) {
  const options = store.persist.getOptions();
  if (!options.name) throw new Error('Missing settings storage');
  const previous = store.getState();
  const next = { ...previous, ...patch };
  const raw = JSON.stringify({ state: options.partialize ? options.partialize(next) : next, version: options.version ?? 0 });
  const update = (value: S) => {
    // The desktop import commits storage first, then updates all views synchronously.
    store.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    try { store.setState(value); } finally { store.persist.setOptions({ storage: options.storage }); }
  };
  return { key: options.name, raw, previousRaw: localStorage.getItem(options.name), apply: () => update(next), rollback: () => update(previous) };
}
export function applyPreferences(snapshot: PreferencesExport) {
  const value = parsePreferences(JSON.stringify(snapshot));
  const changes = [
    prepareChange(useWorkspacePrefs, value.layout),
    prepareChange(useSidebarPrefs, value.sidebar),
    prepareChange(useHotkeyPrefs, { overrides: value.shortcuts }),
    prepareChange(useAiPromptPrefs, { overrides: value.prompts, repoOverrides: value.repoPrompts }),
    prepareChange(useWorkspaceStore, { workspaces: value.workspaces, activeWorkspaceId: value.activeWorkspaceId }),
    prepareChange(useRepoGroupsStore, { forest: value.groups }),
    prepareChange(useHistoryPrefs, { repositories: value.history }),
  ];
  const written: typeof changes = [];
  try {
    for (const change of changes) { localStorage.setItem(change.key, change.raw); written.push(change); }
  } catch (error) {
    for (const change of written.reverse()) {
      if (change.previousRaw === null) localStorage.removeItem(change.key);
      else localStorage.setItem(change.key, change.previousRaw);
    }
    throw error;
  }
  for (const change of changes) change.apply();
}
