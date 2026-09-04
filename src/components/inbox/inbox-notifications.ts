import type { AgentOverviewEntry } from "@/lib/agents/overview";
import type { InboxCiItem, InboxPrItem, InboxSections } from "@/lib/inbox";

export type InboxNotificationTab = "all" | "mine" | "review" | "ci" | "agents";

export type InboxNotificationCategory = Exclude<InboxNotificationTab, "all">;

export type InboxNotification =
  | { key: string; category: "mine" | "review"; kind: "pr"; pr: InboxPrItem }
  | { key: string; category: "ci"; kind: "ci"; ci: InboxCiItem }
  | { key: string; category: "agents"; kind: "agent"; agent: AgentOverviewEntry };

export const INBOX_TABS: InboxNotificationTab[] = ["all", "mine", "review", "ci", "agents"];

/** Priority order for grouped display: most actionable first. */
export const INBOX_GROUP_ORDER: InboxNotificationCategory[] = ["review", "ci", "agents", "mine"];

function prTime(item: InboxPrItem): number {
  const value = Date.parse(item.updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

function ciTime(item: InboxCiItem): number {
  const value = Date.parse(item.updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

function agentTime(entry: AgentOverviewEntry): number {
  return Number.isFinite(entry.updatedAt) && entry.updatedAt > 0 ? entry.updatedAt * 1000 : 0;
}

export function notificationTime(notification: InboxNotification): number {
  switch (notification.kind) {
    case "pr":
      return prTime(notification.pr);
    case "ci":
      return ciTime(notification.ci);
    case "agent":
      return agentTime(notification.agent);
  }
}

function dedupePrs(mine: InboxPrItem[], review: InboxPrItem[]): { mine: InboxPrItem[]; review: InboxPrItem[] } {
  const reviewKeys = new Set(review.map((item) => item.key));
  return { mine: mine.filter((item) => !reviewKeys.has(item.key)), review };
}

export function buildInboxNotifications(
  sections: InboxSections,
  agents: AgentOverviewEntry[],
): InboxNotification[] {
  const { mine, review } = dedupePrs(sections.myPrs, sections.reviewRequested);
  const notifications: InboxNotification[] = [
    ...review.map((pr): InboxNotification => ({ key: pr.key, category: "review", kind: "pr", pr })),
    ...mine.map((pr): InboxNotification => ({ key: pr.key, category: "mine", kind: "pr", pr })),
    ...sections.redRuns.map((ci): InboxNotification => ({ key: ci.key, category: "ci", kind: "ci", ci })),
    ...agents.map(
      (agent): InboxNotification => ({ key: `agent:${agent.key}`, category: "agents", kind: "agent", agent }),
    ),
  ];
  return notifications.sort((a, b) => notificationTime(b) - notificationTime(a));
}

export type InboxTabCounts = Record<InboxNotificationTab, number>;

export function countInboxTabs(notifications: InboxNotification[]): InboxTabCounts {
  const counts: InboxTabCounts = { all: notifications.length, mine: 0, review: 0, ci: 0, agents: 0 };
  for (const notification of notifications) counts[notification.category] += 1;
  return counts;
}

export function filterInboxNotifications(
  notifications: InboxNotification[],
  tab: InboxNotificationTab,
): InboxNotification[] {
  if (tab === "all") return notifications;
  return notifications.filter((notification) => notification.category === tab);
}

export type InboxNotificationGroup = {
  category: InboxNotificationCategory;
  items: InboxNotification[];
};

export function groupInboxNotifications(notifications: InboxNotification[]): InboxNotificationGroup[] {
  return INBOX_GROUP_ORDER.map((category) => ({
    category,
    items: notifications.filter((notification) => notification.category === category),
  })).filter((group) => group.items.length > 0);
}

export function countUnread(notifications: InboxNotification[], readKeys: string[]): number {
  return notifications.filter((notification) => !readKeys.includes(notification.key)).length;
}
