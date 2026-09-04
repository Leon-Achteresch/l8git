import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
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

  const terminalKey = IS_MAC ? "⌃`" : "Ctrl+`";

  return [
    {
      group: t("hotkeysOverlay.groupGlobal"),
      rows: [
        ...rowsFor("global"),
        { keys: [terminalKey], description: t("hotkeysOverlay.toggleTerminal") },
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
          <DialogDescription>{t("hotkeysOverlay.subtitle", { defaultValue: "Every action is reachable without a mouse. Press Esc to close." })}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          {groups.map((g) => (
            <section key={g.group} aria-label={g.group}>
              <h3 className="mb-2 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {g.group}
              </h3>
              <table className="w-full text-sm">
                <caption className="sr-only">{g.group}</caption>
                <tbody>
                  {g.rows.map((row) => (
                    <tr key={row.description} className="border-b border-border/30 last:border-0">
                      <td scope="row" className="py-1.5 pr-4 text-muted-foreground">{row.description}</td>
                      <td className="py-1.5 text-right">
                        <span className="inline-flex gap-1">
                          {row.keys.map((k) => (
                            <Kbd
                              key={k}
                              className="px-1.5 py-0.5 font-mono text-[11px]"
                            >
                              {k}
                            </Kbd>
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
