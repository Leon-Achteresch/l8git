import { useRouter } from "@tanstack/react-router";
import { useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import { useMemo } from "react";

import { usePickRepo } from "@/lib/use-pick-repo";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";

const SIDEBAR_SHORTCUTS: [
  "Mod+1" | "Mod+2" | "Mod+3" | "Mod+4" | "Mod+5",
  SidebarTab,
][] = [
  ["Mod+1", "commit"],
  ["Mod+2", "history"],
  ["Mod+3", "pr"],
  ["Mod+4", "ci"],
  ["Mod+5", "stash"],
];

export function useAppHotkeys() {
  const router = useRouter();
  const pickRepo = usePickRepo();
  const activePath = useRepoStore((s) => s.activePath);
  const refreshOpenRepo = useRepoStore((s) => s.refreshOpenRepo);
  const reloadAll = useRepoStore((s) => s.reloadAll);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  const list = useMemo((): Array<UseHotkeyDefinition> => {
    const refreshActive = () => {
      if (activePath) void refreshOpenRepo(activePath);
    };
    return [
      {
        hotkey: "F5",
        callback: refreshActive,
        options: {
          enabled: !!activePath,
          meta: { name: "Aktives Repo neu laden" },
        },
      },
      {
        hotkey: "Mod+R",
        callback: refreshActive,
        options: {
          enabled: !!activePath,
          meta: { name: "Aktives Repo neu laden" },
        },
      },
      {
        hotkey: "Mod+Shift+R",
        callback: () => {
          void (async () => {
            await reloadAll();
            if (activePath) await reloadStatus(activePath);
          })();
        },
        options: { meta: { name: "Alle Repos neu laden" } },
      },
      ...SIDEBAR_SHORTCUTS.map(([hotkey, tab]) => ({
        hotkey,
        callback: () => setSidebarTab(tab),
        options: {
          enabled: !!activePath,
          meta: { name: `Sidebar: ${tab}` },
        },
      })),
      {
        hotkey: "Mod+O",
        callback: () => {
          void pickRepo();
        },
        options: { meta: { name: "Lokales Repository öffnen" } },
      },
      {
        hotkey: "Mod+,",
        callback: () => {
          void router.navigate({ to: "/settings" });
        },
        options: { meta: { name: "Einstellungen" } },
      },
    ];
  }, [
    activePath,
    pickRepo,
    refreshOpenRepo,
    reloadAll,
    reloadStatus,
    router,
    setSidebarTab,
  ]);

  useHotkeys(list, { preventDefault: true, conflictBehavior: "warn" });
}
