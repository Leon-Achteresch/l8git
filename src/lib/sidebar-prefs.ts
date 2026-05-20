import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SidebarTab } from './ui-store';

export type TabDisplayMode = 'full' | 'icons_only' | 'labels_only';
export type TabSize = 'compact' | 'normal' | 'large';
export type SidebarSectionId = 'local' | 'remote' | 'tags';
export type TabLayout = 'list' | 'grid';
export type GridColumns = 2 | 3 | 4;

export const ALL_SIDEBAR_TABS: SidebarTab[] = [
  'commit',
  'history',
  'pr',
  'ci',
  'stash',
  'submodules',
  'worktrees',
  'hooks',
];

const DEFAULTS = {
  tabOrder: [...ALL_SIDEBAR_TABS] as SidebarTab[],
  hiddenTabs: [] as SidebarTab[],
  displayMode: 'full' as TabDisplayMode,
  tabSize: 'normal' as TabSize,
  tabLayout: 'list' as TabLayout,
  gridColumns: 2 as GridColumns,
  showBranchFilter: true,
  defaultOpenSections: ['local', 'remote', 'tags'] as SidebarSectionId[],
};

type SidebarPrefsState = {
  tabOrder: SidebarTab[];
  hiddenTabs: SidebarTab[];
  displayMode: TabDisplayMode;
  tabSize: TabSize;
  tabLayout: TabLayout;
  gridColumns: GridColumns;
  showBranchFilter: boolean;
  defaultOpenSections: SidebarSectionId[];

  setTabOrder: (order: SidebarTab[]) => void;
  toggleTabVisibility: (tab: SidebarTab) => void;
  setDisplayMode: (mode: TabDisplayMode) => void;
  setTabSize: (size: TabSize) => void;
  setTabLayout: (layout: TabLayout) => void;
  setGridColumns: (cols: GridColumns) => void;
  setShowBranchFilter: (v: boolean) => void;
  setDefaultOpenSections: (sections: SidebarSectionId[]) => void;
  resetToDefaults: () => void;
};

export const useSidebarPrefs = create<SidebarPrefsState>()(
  persist(
    set => ({
      ...DEFAULTS,
      setTabOrder: order => set({ tabOrder: order }),
      toggleTabVisibility: tab =>
        set(s => ({
          hiddenTabs: s.hiddenTabs.includes(tab)
            ? s.hiddenTabs.filter(t => t !== tab)
            : [...s.hiddenTabs, tab],
        })),
      setDisplayMode: mode => set({ displayMode: mode }),
      setTabSize: size => set({ tabSize: size }),
      setTabLayout: layout => set({ tabLayout: layout }),
      setGridColumns: cols => set({ gridColumns: cols }),
      setShowBranchFilter: v => set({ showBranchFilter: v }),
      setDefaultOpenSections: sections => set({ defaultOpenSections: sections }),
      resetToDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'l8git-sidebar-prefs',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<typeof DEFAULTS>;
        const savedOrder = (p.tabOrder ?? DEFAULTS.tabOrder).filter(t =>
          ALL_SIDEBAR_TABS.includes(t as SidebarTab),
        ) as SidebarTab[];
        const newTabs = ALL_SIDEBAR_TABS.filter(t => !savedOrder.includes(t));
        return {
          ...current,
          tabOrder: [...savedOrder, ...newTabs],
          hiddenTabs: (p.hiddenTabs ?? DEFAULTS.hiddenTabs).filter(t =>
            ALL_SIDEBAR_TABS.includes(t as SidebarTab),
          ) as SidebarTab[],
          displayMode: p.displayMode ?? DEFAULTS.displayMode,
          tabSize: p.tabSize ?? DEFAULTS.tabSize,
          tabLayout: p.tabLayout ?? DEFAULTS.tabLayout,
          gridColumns: p.gridColumns ?? DEFAULTS.gridColumns,
          showBranchFilter: p.showBranchFilter ?? DEFAULTS.showBranchFilter,
          defaultOpenSections: p.defaultOpenSections ?? DEFAULTS.defaultOpenSections,
        };
      },
    },
  ),
);
