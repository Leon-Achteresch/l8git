import { useHotkeys } from "@tanstack/react-hotkeys";
import { useTranslation } from "react-i18next";
import { useHotkeyBindings } from "./hotkey-prefs";
import {
  buildHunkPatch,
  buildPatchesForSelection,
  type ParsedDiff,
} from "./unified-diff";

export function useCommitPanelHotkeys({
  parsedDiff,
  focusedHunkIdx,
  selectedLines,
  sector,
  enabled,
  onClearSelection,
  onFocusPrevHunk,
  onFocusNextHunk,
  onStage,
  onUnstage,
  onToggleFile,
}: {
  parsedDiff: ParsedDiff | null;
  focusedHunkIdx: number;
  selectedLines: ReadonlySet<string>;
  sector: "staged" | "unstaged" | null;
  enabled: boolean;
  onClearSelection: () => void;
  onFocusPrevHunk: () => void;
  onFocusNextHunk: () => void;
  onStage: (patches: string[]) => void;
  onUnstage: (patches: string[]) => void;
  onToggleFile: () => void;
}) {
  const { t } = useTranslation();
  const bindings = useHotkeyBindings();
  const hunkCount = parsedDiff?.hunks.length ?? 0;

  useHotkeys([
    {
      hotkey: bindings.commitStageToggle,
      callback: () => {
        if (!sector) {
          onToggleFile();
          return;
        }

        const applyPatches = sector === "unstaged" ? onStage : onUnstage;

        if (selectedLines.size > 0 && parsedDiff) {
          const patches = buildPatchesForSelection(parsedDiff, selectedLines);
          if (patches.length > 0) applyPatches(patches);
          onClearSelection();
        } else if (focusedHunkIdx >= 0 && parsedDiff) {
          const patch = buildHunkPatch(parsedDiff, focusedHunkIdx);
          if (patch) applyPatches([patch]);
        } else {
          onToggleFile();
        }
      },
      options: {
        enabled,
        meta: {
          name:
            sector === "staged"
              ? t("hotkeys.commitStageUnstageStaged")
              : t("hotkeys.commitStageUnstageUnstaged"),
        },
      },
    },
    {
      hotkey: bindings.commitPrevHunk,
      callback: () => onFocusPrevHunk(),
      options: {
        enabled: enabled && hunkCount > 0,
        meta: { name: t("hotkeys.commitPrevHunk") },
      },
    },
    {
      hotkey: bindings.commitNextHunk,
      callback: () => onFocusNextHunk(),
      options: {
        enabled: enabled && hunkCount > 0,
        meta: { name: t("hotkeys.commitNextHunk") },
      },
    },
    {
      hotkey: bindings.commitClearSelection,
      callback: () => onClearSelection(),
      options: {
        enabled: enabled && selectedLines.size > 0,
        meta: { name: t("hotkeys.commitClearSelection") },
      },
    },
  ]);
}
