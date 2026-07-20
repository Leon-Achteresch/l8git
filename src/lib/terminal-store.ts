import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { terminalLeafId } from '@/lib/terminal/leaf-id';

// Loaded on demand: a static import would drag the whole xterm renderer
// stack into the entry chunk just to close tabs.
function disposeSessionLazy(leafId: string): void {
  void import('@/lib/terminal/use-terminal-session').then((m) =>
    m.disposeSession(leafId),
  );
}
function disposeSessionsForPathLazy(path: string): void {
  void import('@/lib/terminal/use-terminal-session').then((m) =>
    m.disposeSessionsForPath(path),
  );
}

export const TERMINAL_MIN_HEIGHT = 120;
export const TERMINAL_MAX_HEIGHT = 720;
export const TERMINAL_DEFAULT_HEIGHT = 260;

export const TERMINAL_MIN_WIDTH = 240;
export const TERMINAL_MAX_WIDTH = 1200;
export const TERMINAL_DEFAULT_WIDTH = 420;

export type TerminalPosition = 'bottom' | 'right';

export type TerminalTab = {
  id: string;
  title: string;
  createdAt: number;
  /** When set, the tab runs this command instead of the default embedded shell. */
  command?: string;
};

type TerminalState = {
  visibleByPath: Record<string, boolean>;
  tabsByPath: Record<string, TerminalTab[]>;
  activeByPath: Record<string, string | null>;
  panelHeight: number;
  panelWidth: number;
  position: TerminalPosition;
  setVisible: (path: string, visible: boolean) => void;
  toggleVisible: (path: string) => void;
  isVisible: (path: string) => boolean;
  setPanelHeight: (height: number) => void;
  setPanelWidth: (width: number) => void;
  setPosition: (position: TerminalPosition) => void;
  openTab: (path: string, title?: string, command?: string) => string;
  closeTab: (path: string, id: string) => void;
  closeAllForPath: (path: string) => void;
  setActiveTab: (path: string, id: string) => void;
  renameTab: (path: string, id: string, title: string) => void;
};

const clampHeight = (v: number) =>
  Math.min(TERMINAL_MAX_HEIGHT, Math.max(TERMINAL_MIN_HEIGHT, Math.round(v)));

const clampWidth = (v: number) =>
  Math.min(TERMINAL_MAX_WIDTH, Math.max(TERMINAL_MIN_WIDTH, Math.round(v)));

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
      panelWidth: TERMINAL_DEFAULT_WIDTH,
      position: 'bottom',
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
      setPanelWidth: (width) => set({ panelWidth: clampWidth(width) }),
      setPosition: (position) => set({ position }),
      openTab: (path, title, command) => {
        const id = nextTabId();
        set((s) => {
          const tabs = s.tabsByPath[path] ?? [];
          const tab: TerminalTab = {
            id,
            title: title?.trim() || "Terminal",
            createdAt: Date.now(),
            command: command?.trim() || undefined,
          };
          return {
            tabsByPath: { ...s.tabsByPath, [path]: [...tabs, tab] },
            activeByPath: { ...s.activeByPath, [path]: id },
            visibleByPath: { ...s.visibleByPath, [path]: true },
          };
        });
        return id;
      },
      closeTab: (path, id) => {
        disposeSessionLazy(terminalLeafId(path, id));
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
        });
      },
      closeAllForPath: (path) => {
        disposeSessionsForPathLazy(path);
        set((s) => {
          const { [path]: _tabs, ...tabsByPath } = s.tabsByPath;
          const { [path]: _active, ...activeByPath } = s.activeByPath;
          const { [path]: _visible, ...visibleByPath } = s.visibleByPath;
          return { tabsByPath, activeByPath, visibleByPath };
        });
      },
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
      partialize: (s) => ({
        panelHeight: s.panelHeight,
        panelWidth: s.panelWidth,
        position: s.position,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<
          Pick<TerminalState, 'panelHeight' | 'panelWidth' | 'position'>
        >;
        return {
          ...current,
          panelHeight: clampHeight(p.panelHeight ?? current.panelHeight),
          panelWidth: clampWidth(p.panelWidth ?? current.panelWidth),
          position: p.position === 'right' ? 'right' : 'bottom',
        };
      },
    },
  ),
);
