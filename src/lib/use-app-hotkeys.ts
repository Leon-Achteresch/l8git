import { useRouter } from "@tanstack/react-router";
import { useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
  const { t, i18n } = useTranslation();
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
          meta: { name: t("hotkeys.reloadActive") },
        },
      },
      {
        hotkey: "Mod+R",
        callback: refreshActive,
        options: {
          enabled: !!activePath,
          meta: { name: t("hotkeys.reloadActive") },
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
        options: { meta: { name: t("hotkeys.reloadAll") } },
      },
      ...SIDEBAR_SHORTCUTS.map(([hotkey, tab]) => ({
        hotkey,
        callback: () => setSidebarTab(tab),
        options: {
          enabled: !!activePath,
          meta: {
            name:
              tab === "commit"
                ? t("hotkeys.sidebarCommit")
                : tab === "history"
                  ? t("hotkeys.sidebarHistory")
                  : tab === "pr"
                    ? t("hotkeys.sidebarPr")
                    : tab === "ci"
                      ? t("hotkeys.sidebarCi")
                      : t("hotkeys.sidebarStash"),
          },
        },
      })),
      {
        hotkey: "Mod+O",
        callback: () => {
          void pickRepo();
        },
        options: { meta: { name: t("hotkeys.openRepo") } },
      },
      {
        hotkey: "Mod+,",
        callback: () => {
          void router.navigate({ to: "/settings" });
        },
        options: { meta: { name: t("hotkeys.settings") } },
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
    t,
    i18n.language,
  ]);

  useHotkeys(list, { preventDefault: true, conflictBehavior: "warn" });
}
