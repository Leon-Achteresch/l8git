import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { useTranslation } from "react-i18next";

import {
  HOTKEY_ACTIONS,
  useHotkeyBindings,
  type HotkeyActionGroup,
} from "@/lib/hotkey-prefs";

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
  const bindings = useHotkeyBindings();

  const rowsFor = (group: HotkeyActionGroup): ShortcutRow[] =>
    HOTKEY_ACTIONS.filter((action) => action.group === group).map((action) => ({
      keys: [formatForDisplay(bindings[action.id])],
      description: t(action.labelKey, action.labelParams ?? {}),
    }));

  return [
    {
      group: t("hotkeysOverlay.groupGlobal"),
      rows: [
        ...rowsFor("global"),
        { keys: [`Ctrl+\``], description: t("hotkeysOverlay.toggleTerminal") },
      ],
    },
    {
      group: t("hotkeysOverlay.groupNavigation"),
      rows: rowsFor("navigation"),
    },
    {
      group: t("hotkeysOverlay.groupCommitDiff"),
      rows: [
        ...rowsFor("commit"),
        { keys: [`${MOD}+Enter`], description: t("hotkeysOverlay.submitCommit") },
      ],
    },
    {
      group: t("hotkeys.group.history"),
      rows: rowsFor("history"),
    },
    {
      group: t("hotkeys.group.branch"),
      rows: rowsFor("branch"),
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
