import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const TERMINAL_MIN_HEIGHT = 120;
export const TERMINAL_MAX_HEIGHT = 720;
export const TERMINAL_DEFAULT_HEIGHT = 260;

export type TerminalTab = {
  id: string;
  title: string;
  createdAt: number;
};

type TerminalState = {
  visibleByPath: Record<string, boolean>;
  tabsByPath: Record<string, TerminalTab[]>;
  activeByPath: Record<string, string | null>;
  panelHeight: number;
  setVisible: (path: string, visible: boolean) => void;
  toggleVisible: (path: string) => void;
  isVisible: (path: string) => boolean;
  setPanelHeight: (height: number) => void;
  openTab: (path: string, title?: string) => string;
  closeTab: (path: string, id: string) => void;
  setActiveTab: (path: string, id: string) => void;
  renameTab: (path: string, id: string, title: string) => void;
};

const clampHeight = (v: number) =>
  Math.min(TERMINAL_MAX_HEIGHT, Math.max(TERMINAL_MIN_HEIGHT, Math.round(v)));

let tabSeq = 1;
function nextTabId(): string {
  const id = `t${Date.now().toString(36)}-${tabSeq++}`;
  return id;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      visibleByPath: {},
      tabsByPath: {},
      activeByPath: {},
      panelHeight: TERMINAL_DEFAULT_HEIGHT,
      setVisible: (path, visible) =>
        set((s) => ({
          visibleByPath: { ...s.visibleByPath, [path]: visible },
        })),
      toggleVisible: (path) => {
        const cur = !!get().visibleByPath[path];
        get().setVisible(path, !cur);
      },
      isVisible: (path) => !!get().visibleByPath[path],
      setPanelHeight: (height) => set({ panelHeight: clampHeight(height) }),
      openTab: (path, title) => {
        const id = nextTabId();
        set((s) => {
          const tabs = s.tabsByPath[path] ?? [];
          const tab: TerminalTab = {
            id,
            title: title?.trim() || "Terminal",
            createdAt: Date.now(),
          };
          return {
            tabsByPath: { ...s.tabsByPath, [path]: [...tabs, tab] },
            activeByPath: { ...s.activeByPath, [path]: id },
            visibleByPath: { ...s.visibleByPath, [path]: true },
          };
        });
        return id;
      },
      closeTab: (path, id) =>
        set((s) => {
          const tabs = s.tabsByPath[path] ?? [];
          const idx = tabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;
          const remaining = tabs.filter((t) => t.id !== id);
          let nextActiveId: string | null = s.activeByPath[path] ?? null;
          if (nextActiveId === id) {
            const fallback = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
            nextActiveId = fallback ? fallback.id : null;
          }
          const visible =
            remaining.length === 0 ? false : !!s.visibleByPath[path];
          return {
            tabsByPath: { ...s.tabsByPath, [path]: remaining },
            activeByPath: { ...s.activeByPath, [path]: nextActiveId },
            visibleByPath: { ...s.visibleByPath, [path]: visible },
          };
        }),
      setActiveTab: (path, id) =>
        set((s) => ({ activeByPath: { ...s.activeByPath, [path]: id } })),
      renameTab: (path, id, title) =>
        set((s) => {
          const tabs = s.tabsByPath[path];
          if (!tabs) return s;
          return {
            tabsByPath: {
              ...s.tabsByPath,
              [path]: tabs.map((t) => (t.id === id ? { ...t, title } : t)),
            },
          };
        }),
    }),
    {
      name: 'l8git-terminal',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ panelHeight: s.panelHeight }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Pick<TerminalState, 'panelHeight'>>;
        return {
          ...current,
          panelHeight: clampHeight(p.panelHeight ?? current.panelHeight),
        };
      },
    },
  ),
);
