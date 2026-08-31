import type { IslandProviderUsage, IslandUsageWindow } from "@/lib/island/types";

export const USAGE_PROVIDER_IDS = ["codex", "claude", "opencode", "cursor"] as const;

export const USAGE_SHORT_NAME: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
};

export function usageRowsOrAll(rows: IslandProviderUsage[]): IslandProviderUsage[] {
  if (rows.length) return rows;
  return USAGE_PROVIDER_IDS.map((id) => ({
    id,
    primary: { usedPercent: 0, windowDurationMins: null, resetsAt: null },
    secondary: null,
  }));
}

export function usageWindowKnown(window: IslandUsageWindow | null): boolean {
  return (
    !!window &&
    (window.usedPercent > 0 ||
      window.resetsAt != null ||
      window.windowDurationMins != null)
  );
}

export function usageRowKnown(row: IslandProviderUsage): boolean {
  return usageWindowKnown(row.primary) || usageWindowKnown(row.secondary);
}

export function usageRingColor(percent: number): string {
  if (percent >= 70) return "#ef4444";
  if (percent >= 40) return "#a3e635";
  return "#2dd4bf";
}

export function usageBarHot(percent: number): boolean {
  return percent >= 50;
}

export function usageResetsLabel(
  window: IslandUsageWindow,
  now: number,
  format: (timestamp: number) => string,
  resetsIn: (mins: number) => string,
): string | null {
  if (window.resetsAt == null) return null;
  const mins = Math.round((window.resetsAt * 1000 - now) / 60_000);
  if (mins > 0 && mins < 180) return resetsIn(mins);
  return format(window.resetsAt * 1000);
}
