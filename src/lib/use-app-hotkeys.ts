import { useRouter } from "@tanstack/react-router";
import { useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { usePickRepo } from "@/lib/use-pick-repo";
import { useRepoStore } from "@/lib/repo-store";
import { useSidebarPrefs } from "@/lib/sidebar-prefs";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";

const TAB_HOTKEY_SLOTS = ["Mod+1", "Mod+2", "Mod+3", "Mod+4", "Mod+5", "Mod+6", "Mod+7", "Mod+8"] as const;

function tabLabel(tab: SidebarTab, t: (k: string) => string): string {
  switch (tab) {
    case "commit": return t("hotkeys.sidebarCommit");
    case "history": return t("hotkeys.sidebarHistory");
    case "pr": return t("hotkeys.sidebarPr");
    case "ci": return t("hotkeys.sidebarCi");
    case "stash": return t("hotkeys.sidebarStash");
    case "submodules": return t("hotkeys.sidebarSubmodules");
    case "worktrees": return t("hotkeys.sidebarWorktrees");
    case "hooks": return t("hotkeys.sidebarHooks");
  }
}

export function useAppHotkeys({ onShowShortcuts }: { onShowShortcuts?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pickRepo = usePickRepo();
  const activePath = useRepoStore((s) => s.activePath);
  const refreshOpenRepo = useRepoStore((s) => s.refreshOpenRepo);
  const reloadAll = useRepoStore((s) => s.reloadAll);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const tabOrder = useSidebarPrefs((s) => s.tabOrder);
  const hiddenTabs = useSidebarPrefs((s) => s.hiddenTabs);

  const list = useMemo((): Array<UseHotkeyDefinition> => {
    const refreshActive = () => {
      if (activePath) void refreshOpenRepo(activePath);
    };
    const visibleTabs = tabOrder.filter((tab) => !hiddenTabs.includes(tab));
    const sidebarHotkeys: UseHotkeyDefinition[] = visibleTabs
      .slice(0, TAB_HOTKEY_SLOTS.length)
      .map((tab, i) => ({
        hotkey: TAB_HOTKEY_SLOTS[i],
        callback: () => setSidebarTab(tab),
        options: {
          enabled: !!activePath,
          meta: { name: tabLabel(tab, t) },
        },
      }));

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
      ...sidebarHotkeys,
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
      {
        hotkey: "Mod+/",
        callback: () => onShowShortcuts?.(),
        options: { meta: { name: t("hotkeys.showShortcuts") } },
      },
    ];
  }, [
    activePath,
    hiddenTabs,
    onShowShortcuts,
    pickRepo,
    refreshOpenRepo,
    reloadAll,
    reloadStatus,
    router,
    setSidebarTab,
    t,
    tabOrder,
    i18n.language,
  ]);

  useHotkeys(list, { preventDefault: true, conflictBehavior: "warn" });
}
