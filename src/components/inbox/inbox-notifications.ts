import type { InboxCiItem, InboxPrItem, InboxSections } from "@/lib/inbox";

export type InboxNotificationTab = "all" | "mine" | "review" | "ci";

export type InboxNotificationCategory = Exclude<InboxNotificationTab, "all">;

export type InboxNotification =
  | { key: string; category: "mine" | "review"; kind: "pr"; pr: InboxPrItem }
  | { key: string; category: "ci"; kind: "ci"; ci: InboxCiItem };

export const INBOX_TABS: InboxNotificationTab[] = ["all", "mine", "review", "ci"];

export const INBOX_GROUP_ORDER: InboxNotificationCategory[] = ["review", "ci", "mine"];

function prTime(item: InboxPrItem): number {
  const value = Date.parse(item.updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

function ciTime(item: InboxCiItem): number {
  const value = Date.parse(item.updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

export function notificationTime(notification: InboxNotification): number {
  switch (notification.kind) {
    case "pr":
      return prTime(notification.pr);
    case "ci":
      return ciTime(notification.ci);
  }
}

function dedupePrs(mine: InboxPrItem[], review: InboxPrItem[]): { mine: InboxPrItem[]; review: InboxPrItem[] } {
  const reviewKeys = new Set(review.map((item) => item.key));
  return { mine: mine.filter((item) => !reviewKeys.has(item.key)), review };
}

export function buildInboxNotifications(sections: InboxSections): InboxNotification[] {
  const { mine, review } = dedupePrs(sections.myPrs, sections.reviewRequested);
  const notifications: InboxNotification[] = [
    ...review.map((pr): InboxNotification => ({ key: pr.key, category: "review", kind: "pr", pr })),
    ...mine.map((pr): InboxNotification => ({ key: pr.key, category: "mine", kind: "pr", pr })),
    ...sections.redRuns.map((ci): InboxNotification => ({ key: ci.key, category: "ci", kind: "ci", ci })),
  ];
  return notifications.sort((a, b) => notificationTime(b) - notificationTime(a));
}

export type InboxTabCounts = Record<InboxNotificationTab, number>;

export function countInboxTabs(notifications: InboxNotification[]): InboxTabCounts {
  const counts: InboxTabCounts = { all: notifications.length, mine: 0, review: 0, ci: 0 };
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
  const buckets = new Map<InboxNotificationCategory, InboxNotification[]>();
  for (const category of INBOX_GROUP_ORDER) buckets.set(category, []);
  for (const notification of notifications) buckets.get(notification.category)?.push(notification);
  return INBOX_GROUP_ORDER.flatMap((category) => {
    const items = buckets.get(category) ?? [];
    return items.length > 0 ? [{ category, items }] : [];
  });
}

export function countUnread(notifications: InboxNotification[], readKeys: string[]): number {
  const read = new Set(readKeys);
  return notifications.filter((notification) => !read.has(notification.key)).length;
}
