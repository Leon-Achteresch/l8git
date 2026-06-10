import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  group: string;
  rows: ShortcutRow[];
}

function useShortcutGroups(): ShortcutGroup[] {
  const { t } = useTranslation();
  return [
    {
      group: t("hotkeysOverlay.groupGlobal"),
      rows: [
        { keys: ["F5", `${MOD}+R`], description: t("hotkeys.reloadActive") },
        { keys: [`${MOD}+Shift+R`], description: t("hotkeys.reloadAll") },
        { keys: [`${MOD}+O`], description: t("hotkeys.openRepo") },
        { keys: [`${MOD}+K`], description: t("hotkeysOverlay.commandPalette") },
        { keys: [`${MOD}+,`], description: t("hotkeys.settings") },
        { keys: [`${MOD}+/`], description: t("hotkeysOverlay.showShortcuts") },
        { keys: [`Ctrl+\``], description: t("hotkeysOverlay.toggleTerminal") },
      ],
    },
    {
      group: t("hotkeysOverlay.groupNavigation"),
      rows: [
        { keys: [`${MOD}+1`], description: t("hotkeys.sidebarCommit") },
        { keys: [`${MOD}+2`], description: t("hotkeys.sidebarHistory") },
        { keys: [`${MOD}+3`], description: t("hotkeys.sidebarPr") },
        { keys: [`${MOD}+4`], description: t("hotkeys.sidebarCi") },
        { keys: [`${MOD}+5`], description: t("hotkeys.sidebarStash") },
        { keys: [`${MOD}+6`], description: t("hotkeysOverlay.sidebarSubmodules") },
        { keys: [`${MOD}+7`], description: t("hotkeysOverlay.sidebarWorktrees") },
        { keys: [`${MOD}+8`], description: t("hotkeysOverlay.sidebarHooks") },
      ],
    },
    {
      group: t("hotkeysOverlay.groupCommitDiff"),
      rows: [
        { keys: ["S"], description: t("hotkeys.commitStageUnstageUnstaged") },
        { keys: ["["], description: t("hotkeys.commitPrevHunk") },
        { keys: ["]"], description: t("hotkeys.commitNextHunk") },
        { keys: ["Esc"], description: t("hotkeys.commitClearSelection") },
        { keys: [`${MOD}+Enter`], description: t("hotkeysOverlay.submitCommit") },
      ],
    },
    {
      group: t("hotkeysOverlay.groupSearch"),
      rows: [
        { keys: ["↵"], description: t("appSearch.footerJumpHistory") },
        { keys: [`${MOD}+↵`], description: t("appSearch.footerCheckout") },
      ],
    },
  ];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HotkeysOverlay({ open, onClose }: Props) {
  const { t } = useTranslation();
  const groups = useShortcutGroups();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hotkeysOverlay.title")}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-5 overflow-y-auto max-h-[70vh] pr-1">
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {g.group}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {g.rows.map((row) => (
                    <tr key={row.description} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5 pr-4 text-muted-foreground">{row.description}</td>
                      <td className="py-1.5 text-right">
                        <span className="inline-flex gap-1">
                          {row.keys.map((k) => (
                            <kbd
                              key={k}
                              className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
