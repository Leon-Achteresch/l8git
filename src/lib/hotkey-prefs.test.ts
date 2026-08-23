import { describe, expect, it } from 'vitest';

import {
  HOTKEY_ACTIONS,
  HOTKEY_DEFAULTS,
  computeHotkeyConflicts,
  resolveHotkeyBindings,
  sanitizeHotkeyOverrides,
} from './hotkey-prefs';

describe('hotkey-prefs', () => {
  it('ships a default binding for every action', () => {
    for (const action of HOTKEY_ACTIONS) {
      expect(HOTKEY_DEFAULTS[action.id]).toBe(action.defaultHotkey);
    }
  });

  it('reports no conflicts for the shipped defaults', () => {
    expect(computeHotkeyConflicts(HOTKEY_DEFAULTS)).toEqual({});
  });

  it('detects duplicates inside the same scope', () => {
    const bindings = resolveHotkeyBindings({ historyCopyHash: 'C' });
    expect(bindings.historyCopyHash).toBe('C');
    expect(computeHotkeyConflicts(bindings).historyCopyHash).toEqual([
      'historyCheckoutCommit',
    ]);
    expect(computeHotkeyConflicts(bindings).historyCheckoutCommit).toEqual([
      'historyCopyHash',
    ]);
  });

  it('detects duplicates between a global and a panel binding', () => {
    const bindings = resolveHotkeyBindings({ openRepo: 'C' });
    expect(computeHotkeyConflicts(bindings).openRepo).toEqual([
      'historyCheckoutCommit',
    ]);
  });

  it('allows the same key in two different panel scopes', () => {
    const bindings = resolveHotkeyBindings({ branchNew: 'S' });
    expect(computeHotkeyConflicts(bindings).branchNew).toBeUndefined();
    expect(computeHotkeyConflicts(bindings).commitStageToggle).toBeUndefined();
  });

  it('drops unknown ids and invalid combinations when loading', () => {
    expect(
      sanitizeHotkeyOverrides({
        openRepo: 'Mod+P',
        bogusAction: 'Mod+P',
        settings: 42,
        showShortcuts: '',
      })
    ).toEqual({ openRepo: 'Mod+P' });
  });

  it('returns an empty map for malformed persisted state', () => {
    expect(sanitizeHotkeyOverrides(null)).toEqual({});
    expect(sanitizeHotkeyOverrides('nope')).toEqual({});
  });
});
