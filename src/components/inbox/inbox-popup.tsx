import { Eye, GitPullRequest, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  NotificationAvatar,
  NotificationCenter,
  NotificationStatusVisual,
  type NotificationBadgeTone,
  type NotificationCenterGroup,
  type NotificationCenterItem,
  type NotificationCenterTab,
} from "@/components/inbox/notification-center";
import {
  buildInboxNotifications,
  countInboxTabs,
  countUnread,
  filterInboxNotifications,
  groupInboxNotifications,
  type InboxNotification,
  type InboxNotificationCategory,
} from "@/components/inbox/inbox-notifications";
import { useInboxPaths } from "@/components/inbox/use-inbox-paths";
import { useInboxTargets } from "@/components/inbox/use-inbox-targets";
import { formatRelative } from "@/lib/format";
import { useInboxStore } from "@/lib/inbox-store";
import { useUiStore } from "@/lib/ui-store";

const GROUP_ICON: Record<InboxNotificationCategory, typeof Eye> = {
  review: Eye,
  ci: TriangleAlert,
  mine: GitPullRequest,
};

const SECTION_KEY: Record<InboxNotificationCategory, string> = {
  mine: "myPrs",
  review: "reviewRequested",
  ci: "redRuns",
};

export function InboxPopup() {
  const { t } = useTranslation();
  const setInboxOpen = useUiStore((s) => s.setInboxOpen);
  const paths = useInboxPaths();
  const sections = useInboxStore((s) => s.sections);
  const errors = useInboxStore((s) => s.errors);
  const loading = useInboxStore((s) => s.loading);
  const lastLoadedAt = useInboxStore((s) => s.lastLoadedAt);
  const refresh = useInboxStore((s) => s.refresh);
  const readKeys = useInboxStore((s) => s.readKeys);
  const markRead = useInboxStore((s) => s.markRead);
  const markAllRead = useInboxStore((s) => s.markAllRead);
  const { openPr, openCi } = useInboxTargets();

  const [activeTab, setActiveTab] = useState<NotificationCenterTab>("all");

  const notifications = useMemo(() => buildInboxNotifications(sections), [sections]);
  const byId = useMemo(() => new Map(notifications.map((n) => [n.key, n])), [notifications]);
  const tabCounts = useMemo(() => countInboxTabs(notifications), [notifications]);
  const unreadCount = useMemo(() => countUnread(notifications, readKeys), [notifications, readKeys]);
  const visible = useMemo(() => filterInboxNotifications(notifications, activeTab), [notifications, activeTab]);

  const openNotification = (notification: InboxNotification) => {
    markRead(notification.key);
    setInboxOpen(false);
    if (notification.kind === "pr") openPr(notification.pr.path, notification.pr.number);
    else openCi(notification.ci.path);
  };

  const toItem = (notification: InboxNotification): NotificationCenterItem => {
    const unread = !readKeys.includes(notification.key);
    if (notification.kind === "pr") {
      const pr = notification.pr;
      return {
        id: pr.key,
        title: `#${pr.number} ${pr.title}`,
        description: `${pr.author} · ${pr.sourceBranch} → ${pr.targetBranch}`,
        timestamp: formatRelative(pr.updatedAt),
        tooltip: `${pr.path} · #${pr.number}`,
        unread,
        visual: <NotificationAvatar name={pr.author} />,
        badges: [
          pr.isDraft ? { label: t("inbox.badges.draft") } : null,
          pr.checks !== "unknown"
            ? {
                label: t(`inbox.checks.${pr.checks}`),
                tone: (
                  pr.checks === "success" ? "success" : pr.checks === "failure" ? "danger" : "info"
                ) as NotificationBadgeTone,
              }
            : null,
          pr.reviewers.length > 0
            ? {
                label: t("inbox.badges.reviewers", { count: pr.reviewers.length }),
                title: pr.reviewers.join(", "),
              }
            : null,
        ].filter((badge): badge is NonNullable<typeof badge> => badge !== null),
        externalUrl: pr.htmlUrl || undefined,
        externalLabel: t("inbox.openExternal"),
      };
    }
    const run = notification.ci;
    return {
      id: run.key,
      title: run.name,
      description: `${run.branch} · #${run.runNumber} · ${run.event}`,
      timestamp: formatRelative(run.updatedAt),
      tooltip: `${run.path} · #${run.runNumber}`,
      unread,
      visual: (
        <NotificationStatusVisual
          icon={TriangleAlert}
          className="bg-red-500/10 text-red-600 dark:text-red-300"
        />
      ),
      badges: [
        {
          label: t(`inbox.conclusion.${run.conclusion}`, { defaultValue: run.conclusion }),
          tone: "danger" as const,
        },
      ],
      externalUrl: run.htmlUrl || undefined,
      externalLabel: t("inbox.openExternal"),
    };
  };

  const groups: NotificationCenterGroup[] = useMemo(() => {
    const items = visible.map(toItem);
    if (activeTab !== "all") {
      const def = groupInboxNotifications(visible).find((group) => group.category === activeTab);
      const category = (def?.category ?? activeTab) as InboxNotificationCategory;
      return [
        {
          id: category,
          title: t(`inbox.sections.${SECTION_KEY[category]}`),
          icon: GROUP_ICON[category],
          count: items.length,
          items,
        },
      ];
    }
    const grouped = groupInboxNotifications(visible);
    return grouped.map((group) => ({
      id: group.category,
      title: t(`inbox.sections.${SECTION_KEY[group.category]}`),
      icon: GROUP_ICON[group.category],
      count: group.items.length,
      items: group.items.map(toItem),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activeTab, readKeys, t]);

  const unreadHeadline =
    unreadCount === 0
      ? t("inbox.noUnread")
      : t("inbox.unread", { count: unreadCount });
  const headline = `${unreadHeadline} · ${t("inbox.subtitle", { count: paths.length })}${lastLoadedAt ? ` · ${t("inbox.updated", { time: formatRelative(new Date(lastLoadedAt).toISOString()) })}` : ""}`;

  const emptyHint =
    activeTab === "all"
      ? t("inbox.allCaughtUpHint")
      : t(`inbox.empty.${SECTION_KEY[activeTab as InboxNotificationCategory]}`);

  return (
    <NotificationCenter
          title={t("inbox.title")}
          headline={headline}
          tabsLabel={t("inbox.tabsLabel")}
          tabs={[
            { id: "all", label: t("inbox.tabs.all"), count: tabCounts.all },
            { id: "mine", label: t("inbox.tabs.mine"), count: tabCounts.mine },
            { id: "review", label: t("inbox.tabs.review"), count: tabCounts.review },
            { id: "ci", label: t("inbox.tabs.ci"), count: tabCounts.ci },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          groups={groups}
          markAllReadLabel={t("inbox.markAllRead")}
          onMarkAllRead={() => markAllRead(notifications.map((notification) => notification.key))}
          markAllReadDisabled={unreadCount === 0}
          refreshLabel={t("inbox.refresh")}
          onRefresh={() => void refresh(paths)}
          loading={loading}
          unreadLabel={t("inbox.unreadLabel")}
          emptyTitle={t("inbox.allCaughtUp")}
          emptyHint={emptyHint}
          errorBanner={
            errors.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {t("inbox.repoErrors", { count: errors.length })}
                </span>
                <ul className="mt-1 space-y-0.5">
                  {errors.map((error) => (
                    <li key={error.path} className="truncate" title={`${error.path}: ${error.message}`}>
                      {error.repoName}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : undefined
          }
          onOpen={(id) => {
            const notification = byId.get(id);
            if (notification) openNotification(notification);
          }}
          onAction={(id) => {
            const notification = byId.get(id);
            if (notification) openNotification(notification);
          }}
        />
  );
}
