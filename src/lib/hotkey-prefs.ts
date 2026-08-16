import { normalizeHotkey, validateHotkey, type Hotkey } from '@tanstack/hotkeys';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type HotkeyActionGroup =
  | 'global'
  | 'navigation'
  | 'history'
  | 'commit'
  | 'branch';

const ACTION_DEFS = [
  {
    id: 'commandPalette',
    group: 'global',
    defaultHotkey: 'Mod+K',
    labelKey: 'hotkeys.commandPalette',
  },
  {
    id: 'reloadActive',
    group: 'global',
    defaultHotkey: 'Mod+R',
    labelKey: 'hotkeys.reloadActive',
  },
  {
    id: 'reloadActiveAlt',
    group: 'global',
    defaultHotkey: 'F5',
    labelKey: 'hotkeys.reloadActiveAlt',
  },
  {
    id: 'reloadAll',
    group: 'global',
    defaultHotkey: 'Mod+Shift+R',
    labelKey: 'hotkeys.reloadAll',
  },
  {
    id: 'openRepo',
    group: 'global',
    defaultHotkey: 'Mod+O',
    labelKey: 'hotkeys.openRepo',
  },
  {
    id: 'settings',
    group: 'global',
    defaultHotkey: 'Mod+,',
    labelKey: 'hotkeys.settings',
  },
  {
    id: 'showShortcuts',
    group: 'global',
    defaultHotkey: 'Mod+/',
    labelKey: 'hotkeys.showShortcuts',
  },
  {
    id: 'sidebarSlot1',
    group: 'navigation',
    defaultHotkey: 'Mod+1',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 1 },
  },
  {
    id: 'sidebarSlot2',
    group: 'navigation',
    defaultHotkey: 'Mod+2',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 2 },
  },
  {
    id: 'sidebarSlot3',
    group: 'navigation',
    defaultHotkey: 'Mod+3',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 3 },
  },
  {
    id: 'sidebarSlot4',
    group: 'navigation',
    defaultHotkey: 'Mod+4',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 4 },
  },
  {
    id: 'sidebarSlot5',
    group: 'navigation',
    defaultHotkey: 'Mod+5',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 5 },
  },
  {
    id: 'sidebarSlot6',
    group: 'navigation',
    defaultHotkey: 'Mod+6',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 6 },
  },
  {
    id: 'sidebarSlot7',
    group: 'navigation',
    defaultHotkey: 'Mod+7',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 7 },
  },
  {
    id: 'sidebarSlot8',
    group: 'navigation',
    defaultHotkey: 'Mod+8',
    labelKey: 'hotkeys.sidebarSlot',
    labelParams: { index: 8 },
  },
  {
    id: 'historyCheckoutCommit',
    group: 'history',
    defaultHotkey: 'C',
    labelKey: 'hotkeys.historyCheckoutCommit',
  },
  {
    id: 'historyRebaseInteractive',
    group: 'history',
    defaultHotkey: 'R',
    labelKey: 'hotkeys.historyRebaseInteractive',
  },
  {
    id: 'historyCopyHash',
    group: 'history',
    defaultHotkey: 'Y',
    labelKey: 'hotkeys.historyCopyHash',
  },
  {
    id: 'commitStageToggle',
    group: 'commit',
    defaultHotkey: 'S',
    labelKey: 'hotkeys.commitStageToggle',
  },
  {
    id: 'commitPrevHunk',
    group: 'commit',
    defaultHotkey: '[',
    labelKey: 'hotkeys.commitPrevHunk',
  },
  {
    id: 'commitNextHunk',
    group: 'commit',
    defaultHotkey: ']',
    labelKey: 'hotkeys.commitNextHunk',
  },
  {
    id: 'commitClearSelection',
    group: 'commit',
    defaultHotkey: 'Escape',
    labelKey: 'hotkeys.commitClearSelection',
  },
  {
    id: 'branchNew',
    group: 'branch',
    defaultHotkey: 'N',
    labelKey: 'hotkeys.branchNew',
  },
  {
    id: 'branchCheckout',
    group: 'branch',
    defaultHotkey: 'Enter',
    labelKey: 'hotkeys.branchCheckout',
  },
] as const;

export type HotkeyActionId = (typeof ACTION_DEFS)[number]['id'];

export type HotkeyActionDef = {
  id: HotkeyActionId;
  group: HotkeyActionGroup;
  defaultHotkey: Hotkey;
  labelKey: string;
  labelParams?: Record<string, string | number>;
};

export const HOTKEY_ACTIONS: readonly HotkeyActionDef[] = ACTION_DEFS;

export const HOTKEY_ACTION_GROUPS: readonly HotkeyActionGroup[] = [
  'global',
  'navigation',
  'history',
  'commit',
  'branch',
];

export const HOTKEY_DEFAULTS = Object.fromEntries(
  ACTION_DEFS.map(def => [def.id, def.defaultHotkey])
) as Record<HotkeyActionId, Hotkey>;

const ACTION_IDS = new Set<string>(ACTION_DEFS.map(def => def.id));

const GROUP_BY_ID = new Map<HotkeyActionId, HotkeyActionGroup>(
  ACTION_DEFS.map(def => [def.id, def.group])
);

export type HotkeyBindings = Record<HotkeyActionId, Hotkey>;

export type HotkeyOverrides = Partial<HotkeyBindings>;

export function sanitizeHotkeyOverrides(input: unknown): HotkeyOverrides {
  if (!input || typeof input !== 'object') return {};
  const out: HotkeyOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ACTION_IDS.has(key)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    if (!validateHotkey(value).valid) continue;
    out[key as HotkeyActionId] = value as Hotkey;
  }
  return out;
}

export function resolveHotkeyBindings(
  overrides: HotkeyOverrides
): HotkeyBindings {
  return { ...HOTKEY_DEFAULTS, ...overrides };
}

function canonical(hotkey: Hotkey): string {
  try {
    return normalizeHotkey(hotkey);
  } catch {
    return hotkey;
  }
}

function scopeOf(group: HotkeyActionGroup): HotkeyActionGroup {
  return group === 'navigation' ? 'global' : group;
}

export function computeHotkeyConflicts(
  bindings: HotkeyBindings
): Record<string, HotkeyActionId[]> {
  const byCombo = new Map<string, HotkeyActionId[]>();
  for (const def of ACTION_DEFS) {
    const combo = canonical(bindings[def.id]);
    const list = byCombo.get(combo);
    if (list) list.push(def.id);
    else byCombo.set(combo, [def.id]);
  }

  const conflicts: Record<string, HotkeyActionId[]> = {};
  for (const ids of byCombo.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const scope = scopeOf(GROUP_BY_ID.get(id) ?? 'global');
      const partners = ids.filter(other => {
        if (other === id) return false;
        const otherScope = scopeOf(GROUP_BY_ID.get(other) ?? 'global');
        return (
          scope === otherScope || scope === 'global' || otherScope === 'global'
        );
      });
      if (partners.length > 0) conflicts[id] = partners;
    }
  }
  return conflicts;
}

type HotkeyPrefsState = {
  overrides: HotkeyOverrides;
  setBinding: (id: HotkeyActionId, hotkey: Hotkey) => void;
  resetBinding: (id: HotkeyActionId) => void;
  resetAll: () => void;
};

export const useHotkeyPrefs = create<HotkeyPrefsState>()(
  persist(
    set => ({
      overrides: {},
      setBinding: (id, hotkey) =>
        set(s => ({ overrides: { ...s.overrides, [id]: hotkey } })),
      resetBinding: id =>
        set(s => {
          const { [id]: _removed, ...rest } = s.overrides;
          return { overrides: rest };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'l8git-hotkey-prefs',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        overrides: sanitizeHotkeyOverrides(
          (persisted as { overrides?: unknown } | null)?.overrides
        ),
      }),
    }
  )
);

export function useHotkeyBindings(): HotkeyBindings {
  const overrides = useHotkeyPrefs(s => s.overrides);
  return useMemo(() => resolveHotkeyBindings(overrides), [overrides]);
}

export function useHotkeyConflicts(): Record<string, HotkeyActionId[]> {
  const bindings = useHotkeyBindings();
  return useMemo(() => computeHotkeyConflicts(bindings), [bindings]);
}
