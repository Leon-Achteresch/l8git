import { createFileRoute } from "@tanstack/react-router";
import { Bot, Eye, GitPullRequest, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useAgentOverviewEntries } from "@/lib/agents/use-agent-overview";
import { formatRelative } from "@/lib/format";
import { INBOX_REFRESH_INTERVAL_MS, useInboxStore } from "@/lib/inbox-store";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});

const GROUP_ICON: Record<InboxNotificationCategory, typeof Eye> = {
  review: Eye,
  ci: TriangleAlert,
  agents: Bot,
  mine: GitPullRequest,
};

function agentRelativeTime(updatedAtSeconds: number): string {
  if (!Number.isFinite(updatedAtSeconds) || updatedAtSeconds <= 0) return "";
  return formatRelative(new Date(updatedAtSeconds * 1000).toISOString());
}

function InboxPage() {
  const { t } = useTranslation();
  const paths = useInboxPaths();
  const sections = useInboxStore((s) => s.sections);
  const errors = useInboxStore((s) => s.errors);
  const loading = useInboxStore((s) => s.loading);
  const lastLoadedAt = useInboxStore((s) => s.lastLoadedAt);
  const refresh = useInboxStore((s) => s.refresh);
  const readKeys = useInboxStore((s) => s.readKeys);
  const markRead = useInboxStore((s) => s.markRead);
  const markAllRead = useInboxStore((s) => s.markAllRead);
  const { openPr, openCi, openAgentThread } = useInboxTargets();

  const [activeTab, setActiveTab] = useState<NotificationCenterTab>("all");

  const agentEntries = useAgentOverviewEntries();
  const activeAgents = useMemo(
    () => agentEntries.filter((entry) => entry.status !== "idle"),
    [agentEntries],
  );

  useEffect(() => {
    void refresh(paths);
    let stale = false;
    const timer = window.setInterval(() => {
      if (document.hidden) {
        stale = true;
        return;
      }
      void refresh(paths);
    }, INBOX_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden && stale) {
        stale = false;
        void refresh(paths);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paths, refresh]);

  const notifications = useMemo(
    () => buildInboxNotifications(sections, activeAgents),
    [sections, activeAgents],
  );
  const byId = useMemo(() => new Map(notifications.map((n) => [n.key, n])), [notifications]);
  const tabCounts = useMemo(() => countInboxTabs(notifications), [notifications]);
  const unreadCount = useMemo(() => countUnread(notifications, readKeys), [notifications, readKeys]);
  const visible = useMemo(() => filterInboxNotifications(notifications, activeTab), [notifications, activeTab]);

  const openNotification = (notification: InboxNotification) => {
    markRead(notification.key);
    if (notification.kind === "pr") openPr(notification.pr.path, notification.pr.number);
    else if (notification.kind === "ci") openCi(notification.ci.path);
    else openAgentThread(notification.agent);
  };

  const toItem = (notification: InboxNotification): NotificationCenterItem => {
    const unread = !readKeys.includes(notification.key);
    const openAction = { id: "open", label: t("inbox.open"), variant: "primary" } as const;
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
        actions: [openAction],
        externalUrl: pr.htmlUrl || undefined,
        externalLabel: t("inbox.openExternal"),
      };
    }
    if (notification.kind === "ci") {
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
        actions: [openAction],
        externalUrl: run.htmlUrl || undefined,
        externalLabel: t("inbox.openExternal"),
      };
    }
    const entry = notification.agent;
    const awaiting = entry.status === "awaitingApproval";
    return {
      id: `agent:${entry.key}`,
      title: entry.title,
      description: `${t(`agentOverview.status.${entry.status}`)} · ${entry.provider}${entry.branch ? ` · ${entry.branch}` : ""}`,
      timestamp: agentRelativeTime(entry.updatedAt),
      tooltip: entry.path,
      unread,
      visual: (
        <NotificationStatusVisual
          icon={Bot}
          className={
            entry.status === "failed"
              ? "bg-red-500/10 text-red-600 dark:text-red-300"
              : "bg-violet-500/10 text-violet-600 dark:text-violet-300"
          }
        />
      ),
      badges:
        entry.pendingRequests > 0
          ? [
              {
                label: t("inbox.badges.pendingRequests", { count: entry.pendingRequests }),
                tone: "warning" as const,
              },
            ]
          : awaiting
            ? [{ label: t("agentOverview.status.awaitingApproval"), tone: "warning" as const }]
            : [],
      actions: [openAction],
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
          title: t(`inbox.sections.${category === "mine" ? "myPrs" : category === "review" ? "reviewRequested" : category === "ci" ? "redRuns" : "agents"}`),
          icon: GROUP_ICON[category],
          count: items.length,
          items,
        },
      ];
    }
    const grouped = groupInboxNotifications(visible);
    return grouped.map((group) => ({
      id: group.category,
      title: t(
        `inbox.sections.${group.category === "mine" ? "myPrs" : group.category === "review" ? "reviewRequested" : group.category === "ci" ? "redRuns" : "agents"}`,
      ),
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
      : t(
          `inbox.empty.${activeTab === "mine" ? "myPrs" : activeTab === "review" ? "reviewRequested" : activeTab === "ci" ? "redRuns" : "agents"}`,
        );

  return (
    <main className="mx-auto w-full max-w-[880px] px-6 py-6">
      <NotificationCenter
        title={t("inbox.title")}
        headline={headline}
        tabsLabel={t("inbox.tabsLabel")}
        tabs={[
          { id: "all", label: t("inbox.tabs.all"), count: tabCounts.all },
          { id: "mine", label: t("inbox.tabs.mine"), count: tabCounts.mine },
          { id: "review", label: t("inbox.tabs.review"), count: tabCounts.review },
          { id: "ci", label: t("inbox.tabs.ci"), count: tabCounts.ci },
          { id: "agents", label: t("inbox.tabs.agents"), count: tabCounts.agents },
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
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {t("inbox.repoErrors", { count: errors.length })}
              </span>
              <ul className="mt-1 space-y-0.5">
                {errors.map((error) => (
                  <li key={error.path} className="truncate" title={`${error.path}: ${error.message}`}>
                    {error.repoName} — {error.message}
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
    </main>
  );
}
