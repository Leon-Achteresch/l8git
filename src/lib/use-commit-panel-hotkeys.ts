import { useHotkeys } from "@tanstack/react-hotkeys";
import { useTranslation } from "react-i18next";
import {
  buildHunkPatch,
  buildPatchesForSelection,
  type ParsedDiff,
} from "./unified-diff";

/**
 * Registers keyboard shortcuts for the commit panel diff viewer.
 *
 * Hotkeys:
 *   s         – Stage or unstage: selected lines → focused hunk → whole file
 *   [         – Focus previous hunk
 *   ]         – Focus next hunk
 *   Escape    – Clear line selection
 *
 * All callbacks are synced on every render by TanStack Hotkeys,
 * so they always capture the latest state values.
 */
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
  /** Base enable flag – should be false when no row is selected or diff is loading. */
  enabled: boolean;
  onClearSelection: () => void;
  onFocusPrevHunk: () => void;
  onFocusNextHunk: () => void;
  onStage: (patch: string) => void;
  onUnstage: (patch: string) => void;
  onToggleFile: () => void;
}) {
  const { t } = useTranslation();
  const hunkCount = parsedDiff?.hunks.length ?? 0;

  // NOTE: TanStack Hotkeys syncs callbacks + options on every render –
  // no useMemo needed; closures are always fresh.
  useHotkeys([
    {
      hotkey: "S",
      callback: () => {
        console.log("[commit-hotkeys] 's' fired", {
          enabled,
          sector,
          parsedDiff: parsedDiff ? `${parsedDiff.hunks.length} hunks` : null,
          selectedLines: selectedLines.size,
          focusedHunkIdx,
        });

        if (!sector) {
          console.log("[commit-hotkeys] s → no sector, toggleFile");
          onToggleFile();
          return;
        }

        const applyPatch = sector === "unstaged" ? onStage : onUnstage;

        if (selectedLines.size > 0 && parsedDiff) {
          const patches = buildPatchesForSelection(parsedDiff, selectedLines);
          console.log(
            "[commit-hotkeys] s → selection patches:",
            patches.length,
            patches.map((p) => p.slice(0, 80)),
          );
          for (const p of patches) applyPatch(p);
          onClearSelection();
        } else if (focusedHunkIdx >= 0 && parsedDiff) {
          const patch = buildHunkPatch(parsedDiff, focusedHunkIdx);
          console.log(
            "[commit-hotkeys] s → hunk",
            focusedHunkIdx,
            "patch:",
            patch.slice(0, 120),
          );
          if (patch) applyPatch(patch);
        } else {
          console.log("[commit-hotkeys] s → toggleFile (fallback)");
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
      hotkey: "[",
      callback: () => {
        console.log("[commit-hotkeys] '[' fired → prev hunk, current:", focusedHunkIdx);
        onFocusPrevHunk();
      },
      options: {
        enabled: enabled && hunkCount > 0,
        meta: { name: t("hotkeys.commitPrevHunk") },
      },
    },
    {
      hotkey: "]",
      callback: () => {
        console.log("[commit-hotkeys] ']' fired → next hunk, current:", focusedHunkIdx);
        onFocusNextHunk();
      },
      options: {
        enabled: enabled && hunkCount > 0,
        meta: { name: t("hotkeys.commitNextHunk") },
      },
    },
    {
      hotkey: "Escape",
      callback: () => {
        console.log("[commit-hotkeys] 'Escape' fired → clear selection", selectedLines.size);
        onClearSelection();
      },
      options: {
        enabled: enabled && selectedLines.size > 0,
        meta: { name: t("hotkeys.commitClearSelection") },
      },
    },
  ]);
}
