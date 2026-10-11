export type CommitPanelOrientation = "horizontal" | "vertical";
export type CommitPanelLayout = { files: number; diff: number };

export const COMMIT_PANEL_LAYOUT_KEYS = {
  horizontal: "l8git.commit-panel.layout.v2",
  vertical: "l8git.commit-panel.layout.vertical.v1",
} as const;

export const DEFAULT_COMMIT_PANEL_LAYOUTS: Record<CommitPanelOrientation, CommitPanelLayout> = {
  horizontal: { files: 32, diff: 68 },
  vertical: { files: 42, diff: 58 },
};

export function workspaceScale(value: number): number {
  return Number.isFinite(value) ? Math.min(1.5, Math.max(0.7, value)) : 1;
}

/** Container width is measured before transforms; text scale increases the space it needs. */
export function commitPanelOrientation(
  width: number,
  scale: number,
  previous: CommitPanelOrientation = "horizontal",
): CommitPanelOrientation {
  if (!Number.isFinite(width) || width <= 0) return previous;
  const breakpoint = 720 * workspaceScale(scale);
  // A small exit margin keeps scrollbars or fractional measurements from flipping the split.
  return width < breakpoint || (previous === "vertical" && width < breakpoint + 24)
    ? "vertical"
    : "horizontal";
}

export function repositorySidebarLayout({
  availableWidth,
  preferredWidth,
  minimumWidth,
  scale,
}: {
  availableWidth: number;
  preferredWidth: number;
  minimumWidth: number;
  scale: number;
}): { compact: boolean; width: number } {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return { compact: false, width: preferredWidth };
  }
  const usableContent = 480 * workspaceScale(scale);
  const compact = availableWidth < minimumWidth + usableContent;
  return {
    compact,
    width: compact
      ? Math.min(availableWidth, Math.round(64 * workspaceScale(scale)))
      : Math.max(minimumWidth, Math.min(preferredWidth, availableWidth - usableContent)),
  };
}

export function validCommitPanelLayout(value: unknown): CommitPanelLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { files, diff } = value as Partial<CommitPanelLayout>;
  if (typeof files !== "number" || typeof diff !== "number" ||
    !Number.isFinite(files) || !Number.isFinite(diff) || files <= 0 || diff <= 0 ||
    Math.abs(files + diff - 100) > 0.01) return null;
  return { files, diff };
}

export function readCommitPanelLayout(raw: string | null): CommitPanelLayout | null {
  if (!raw) return null;
  try { return validCommitPanelLayout(JSON.parse(raw)); } catch { return null; }
}

/** Constraint updates and automatic stacking must never replace a user's resize choices. */
export function commitPanelLayoutToPersist(value: unknown, isUserInteraction: boolean): CommitPanelLayout | null {
  return isUserInteraction ? validCommitPanelLayout(value) : null;
}
