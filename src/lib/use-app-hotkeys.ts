import { useRouter } from "@tanstack/react-router";
import { useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useHotkeyBindings, type HotkeyActionId } from "@/lib/hotkey-prefs";
import { usePickRepo } from "@/lib/use-pick-repo";
import { useRepoStore } from "@/lib/repo-store";
import { useSidebarPrefs } from "@/lib/sidebar-prefs";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";

const TAB_HOTKEY_SLOT_IDS = [
  "sidebarSlot1",
  "sidebarSlot2",
  "sidebarSlot3",
  "sidebarSlot4",
  "sidebarSlot5",
  "sidebarSlot6",
  "sidebarSlot7",
  "sidebarSlot8",
] as const satisfies readonly HotkeyActionId[];

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
    case "tools": return t("hotkeys.sidebarTools");
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
  const bindings = useHotkeyBindings();

  const list = useMemo((): Array<UseHotkeyDefinition> => {
    const refreshActive = () => {
      if (activePath) void refreshOpenRepo(activePath);
    };
    const visibleTabs = tabOrder.filter((tab) => !hiddenTabs.includes(tab));
    const sidebarHotkeys: UseHotkeyDefinition[] = visibleTabs
      .slice(0, TAB_HOTKEY_SLOT_IDS.length)
      .map((tab, i) => ({
        hotkey: bindings[TAB_HOTKEY_SLOT_IDS[i]],
        callback: () => setSidebarTab(tab),
        options: {
          enabled: !!activePath,
          meta: { name: tabLabel(tab, t) },
        },
      }));

    return [
      {
        hotkey: bindings.reloadActiveAlt,
        callback: refreshActive,
        options: {
          enabled: !!activePath,
          meta: { name: t("hotkeys.reloadActiveAlt") },
        },
      },
      {
        hotkey: bindings.reloadActive,
        callback: refreshActive,
        options: {
          enabled: !!activePath,
          meta: { name: t("hotkeys.reloadActive") },
        },
      },
      {
        hotkey: bindings.reloadAll,
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
        hotkey: bindings.openRepo,
        callback: () => {
          void pickRepo();
        },
        options: { meta: { name: t("hotkeys.openRepo") } },
      },
      {
        hotkey: bindings.settings,
        callback: () => {
          void router.navigate({ to: "/settings" });
        },
        options: { meta: { name: t("hotkeys.settings") } },
      },
      {
        hotkey: bindings.showShortcuts,
        callback: () => onShowShortcuts?.(),
        options: { meta: { name: t("hotkeys.showShortcuts") } },
      },
    ];
  }, [
    activePath,
    bindings,
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
