import { Archive, ArchiveRestore, MessageSquare } from "lucide-react";
import { m } from "motion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AgentThreadRow, isWorking } from "@/components/agents/chat/agent-thread-row";
import { Button } from "@/components/ui/button";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { pulseKeyframes, pulseTransition } from "@/components/motion/kit";

export type SidebarThread = AgentThreadSummary & { provider: NativeAgentProvider };

type GroupKey = "pinned" | "today" | "yesterday" | "last7Days" | "older";

function groupOf(thread: SidebarThread, startOfToday: number): GroupKey {
  if (thread.isPinned) return "pinned";
  const updated = thread.updatedAt * 1000;
  if (updated >= startOfToday) return "today";
  if (updated >= startOfToday - 86_400_000) return "yesterday";
  if (updated >= startOfToday - 6 * 86_400_000) return "last7Days";
  return "older";
}

function groupThreads(threads: SidebarThread[]): Array<{ key: GroupKey; threads: SidebarThread[] }> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startOfToday = start.getTime();
  const buckets = new Map<GroupKey, SidebarThread[]>();
  for (const thread of threads) {
    const key = groupOf(thread, startOfToday);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(thread);
    else buckets.set(key, [thread]);
  }
  const order: GroupKey[] = ["pinned", "today", "yesterday", "last7Days", "older"];
  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({ key, threads: buckets.get(key) ?? [] }));
}

const workingSince = new Map<string, number>();

function trackWorking(threads: SidebarThread[]): void {
  const live = new Set<string>();
  for (const thread of threads) {
    if (!isWorking(thread.status)) continue;
    const key = `${thread.provider}:${thread.id}`;
    live.add(key);
    if (!workingSince.has(key)) workingSince.set(key, Date.now());
  }
  for (const key of [...workingSince.keys()]) {
    if (!live.has(key)) workingSince.delete(key);
  }
}

export function AgentThreadList({
  path,
  threads,
  activeProvider,
  activeThreadId,
  loading,
  hasQuery,
  limit,
  renamingThreadKey,
  locale,
  showArchived,
  archivedCount,
  onOpenThread,
  onCreateThread,
  onRenameThread,
  onSetPinned,
  onArchiveThread,
  onToggleArchived,
  onShowMore,
}: {
  path: string;
  threads: SidebarThread[];
  activeProvider: NativeAgentProvider;
  activeThreadId: string | null;
  loading: boolean;
  hasQuery: boolean;
  limit: number;
  renamingThreadKey: string | null;
  locale: string;
  showArchived: boolean;
  archivedCount: number;
  onOpenThread: (provider: NativeAgentProvider, threadId: string) => void;
  onCreateThread: () => void;
  onRenameThread: (threadKey: string | null) => void;
  onSetPinned: (provider: NativeAgentProvider, threadId: string, pinned: boolean) => Promise<void>;
  onArchiveThread: (provider: NativeAgentProvider, threadId: string, archived: boolean) => Promise<void>;
  onToggleArchived: () => void;
  onShowMore: () => void;
}) {
  const { t } = useTranslation();
  trackWorking(threads);

  const relativeDate = useMemo(() => {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const dateFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
    return (timestamp: number) => {
      const seconds = Math.round(Date.now() / 1000 - timestamp);
      if (seconds < 60) return formatter.format(0, "second");
      if (seconds < 3600) return formatter.format(-Math.round(seconds / 60), "minute");
      if (seconds < 86400) return formatter.format(-Math.round(seconds / 3600), "hour");
      if (seconds < 604800) return formatter.format(-Math.round(seconds / 86400), "day");
      return dateFormatter.format(timestamp * 1000);
    };
  }, [locale]);

  const groups = useMemo(() => groupThreads(threads.slice(0, limit)), [threads, limit]);

  return (
    <section className="px-2 pb-4">
      <div className="flex h-5 items-center justify-between px-2">
        <h2 className="ag-label">{showArchived ? t("agentChat.archived") : ""}</h2>
        {showArchived || archivedCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onToggleArchived}
            data-active={showArchived}
            className="ag-icon-btn size-5 rounded-full"
            aria-pressed={showArchived}
            aria-label={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
            title={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
          >
            {showArchived ? <ArchiveRestore className="size-3" /> : <Archive className="size-3" />}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-px" aria-label={t("agentChat.loadingConversations")}>
          {[0, 1, 2, 3].map((index) => (
            <m.div animate={pulseKeyframes} transition={pulseTransition} key={index} className="h-11 rounded-[9px] bg-[var(--ag-hover)]" />
          ))}
        </div>
      ) : threads.length === 0 && hasQuery ? (
        <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noMatchingChats")}</p>
      ) : threads.length === 0 && showArchived ? (
        <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noArchivedChats")}</p>
      ) : threads.length === 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={onCreateThread} className="ag-row h-9 text-[11px]">
          <MessageSquare className="size-3.5 shrink-0" />
          {t("agentChat.firstConversation")}
        </Button>
      ) : (
        <div>
          {groups.map((group, groupIndex) => (
            <div key={group.key} className={groupIndex === 0 ? "space-y-px" : "mt-3 space-y-px"}>
              <h3 className="ag-label px-2 pb-1">{t(`agentChat.${group.key}`)}</h3>
              {group.threads.map((thread, index) => {
                const threadKey = `${thread.provider}:${thread.id}`;
                return (
                  <m.div
                    key={threadKey}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_PANEL, delay: Math.min(index, 8) * 0.025 }}
                  >
                    <AgentThreadRow
                      path={path}
                      thread={thread}
                      active={thread.id === activeThreadId && thread.provider === activeProvider}
                      relativeDate={relativeDate(thread.updatedAt)}
                      workingSince={workingSince.get(threadKey)}
                      renaming={renamingThreadKey === threadKey}
                      onOpen={onOpenThread}
                      onRename={onRenameThread}
                      onSetPinned={onSetPinned}
                      onArchive={onArchiveThread}
                    />
                  </m.div>
                );
              })}
            </div>
          ))}
          {threads.length > limit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onShowMore}
              className="ag-row mt-1 h-8 justify-center text-[11px] font-medium"
            >
              {t("agentChat.showMoreConversations", { count: Math.min(100, threads.length - limit) })}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
