import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { AgentThreadListHeader } from "@/components/agents/chat/agent-thread-list-header";
import {
  AgentThreadRow,
  isWorking,
} from "@/components/agents/chat/agent-thread-row";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import {
  SharedLayoutBgItem,
  SharedLayoutBgRoot,
} from "@/components/motion/shared-layout-bg";
import { Button } from "@/components/ui/button";
import { useScrollMargin } from "@/hooks/use-scroll-margin";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import {
  flattenThreads,
  type SidebarThread,
} from "@/lib/agents/thread-grouping";
import { SPRING_PRESS } from "@/lib/motion/ease";

export type { SidebarThread } from "@/lib/agents/thread-grouping";

const HEADER_ESTIMATE_PX = 28;
const ROW_ESTIMATE_PX = 58;
const OVERSCAN = 8;

const workingSince = new Map<string, number>();

function useWorkingSince(threads: SidebarThread[]): Map<string, number> {
  useEffect(() => {
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
  }, [threads]);
  return workingSince;
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
  scrollRef,
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
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpenThread: (provider: NativeAgentProvider, threadId: string) => void;
  onCreateThread: () => void;
  onRenameThread: (threadKey: string | null) => void;
  onSetPinned: (
    provider: NativeAgentProvider,
    threadId: string,
    pinned: boolean,
  ) => Promise<void>;
  onArchiveThread: (
    provider: NativeAgentProvider,
    threadId: string,
    archived: boolean,
  ) => Promise<void>;
  onToggleArchived: () => void;
  onShowMore: () => void;
}) {
  const { t } = useTranslation();
  const since = useWorkingSince(threads);

  const relativeDate = useMemo(() => {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
    });
    return (timestamp: number) => {
      const seconds = Math.round(Date.now() / 1000 - timestamp);
      if (seconds < 60) return formatter.format(0, "second");
      if (seconds < 3600)
        return formatter.format(-Math.round(seconds / 60), "minute");
      if (seconds < 86400)
        return formatter.format(-Math.round(seconds / 3600), "hour");
      if (seconds < 604800)
        return formatter.format(-Math.round(seconds / 86400), "day");
      return dateFormatter.format(timestamp * 1000);
    };
  }, [locale]);

  const visible = useMemo(() => threads.slice(0, limit), [limit, threads]);
  const items = useMemo(() => flattenThreads(visible), [visible]);

  const { scrollMargin, listRef } = useScrollMargin(scrollRef);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index]?.kind === "header" ? HEADER_ESTIMATE_PX : ROW_ESTIMATE_PX,
    overscan: OVERSCAN,
    useAnimationFrameWithResizeObserver: true,
    getItemKey: (index) => items[index]?.key ?? index,
    scrollMargin,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const measureRow = useCallback(
    (node: HTMLElement | null) => virtualizer.measureElement(node),
    [virtualizer],
  );

  if (loading) {
    return (
      <section className="min-w-0 px-2 pb-4">
        <AgentThreadListHeader
          showArchived={showArchived}
          archivedCount={archivedCount}
          onToggleArchived={onToggleArchived}
        />
        <div
          className="space-y-1.5 pt-1"
          aria-label={t("agentChat.loadingConversations")}
        >
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <m.div
              animate={pulseKeyframes}
              transition={{ ...pulseTransition, delay: index * 0.07 }}
              key={index}
              className="flex h-14 items-center gap-2.5 rounded-[var(--ag-r-md)] border border-transparent px-2.5"
            >
              <span className="size-7 shrink-0 rounded-[10px] bg-[var(--ag-hover)]" />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block h-2.5 w-[68%] rounded-full bg-[var(--ag-hover)]" />
                <span className="block h-2 w-[38%] rounded-full bg-[var(--ag-hover)]" />
              </span>
            </m.div>
          ))}
        </div>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className="min-w-0 px-2 pb-4">
        <AgentThreadListHeader
          showArchived={showArchived}
          archivedCount={archivedCount}
          onToggleArchived={onToggleArchived}
        />
        {hasQuery ? (
          <AgentsEnter className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <span className="mb-2 grid size-9 place-items-center rounded-xl bg-[var(--ag-surface-2)] text-[var(--ag-text-3)]">
              <MessageSquare className="size-4" />
            </span>
            <p className="text-[12px] font-medium text-[var(--ag-text-2)]">
              {t("agentChat.noMatchingChats")}
            </p>
          </AgentsEnter>
        ) : showArchived ? (
          <AgentsEnter className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <span className="mb-2 grid size-9 place-items-center rounded-xl bg-[var(--ag-surface-2)] text-[var(--ag-text-3)]">
              <MessageSquare className="size-4" />
            </span>
            <p className="text-[12px] font-medium text-[var(--ag-text-2)]">
              {t("agentChat.noArchivedChats")}
            </p>
          </AgentsEnter>
        ) : (
          <AgentsEnter className="px-1 py-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCreateThread}
              className="ag-card flex h-11 w-full items-center justify-center gap-2 border-[var(--ag-line)] bg-[var(--ag-surface)] text-[12px] font-medium text-[var(--ag-text)] shadow-[var(--ag-shadow-raise)] hover:border-[var(--ag-line-strong)]"
            >
              <MessageSquarePlus className="size-4 text-[var(--git-branch)]" />
              {t("agentChat.firstConversation")}
            </Button>
          </AgentsEnter>
        )}
      </section>
    );
  }

  return (
    <section className="min-w-0 px-2 pb-4">
      <AgentThreadListHeader
        showArchived={showArchived}
        archivedCount={archivedCount}
        onToggleArchived={onToggleArchived}
      />

      <SharedLayoutBgRoot
        inset={4}
        pillClassName="rounded-[var(--ag-r-md)]"
        className="relative"
      >
        <div
          ref={listRef}
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            if (!item) return null;
            return (
              <div
                key={virtualItem.key}
                ref={measureRow}
                data-index={virtualItem.index}
                className="absolute inset-x-0 top-0"
                style={{
                  transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {item.kind === "header" ? (
                  <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-3">
                    <h3 className="ag-label text-[10px] font-semibold uppercase tracking-wider text-[var(--ag-text-3)]">
                      {t(`agentChat.${item.group}`)}
                    </h3>
                    <div className="h-px flex-1 bg-[var(--ag-line)]" />
                  </div>
                ) : (
                  <SharedLayoutBgItem id={item.key}>
                    <AgentThreadRow
                      path={path}
                      thread={item.thread}
                      active={
                        item.thread.id === activeThreadId &&
                        item.thread.provider === activeProvider
                      }
                      relativeDate={relativeDate(item.thread.updatedAt)}
                      workingSince={since.get(item.key)}
                      renaming={renamingThreadKey === item.key}
                      onOpen={onOpenThread}
                      onRename={onRenameThread}
                      onSetPinned={onSetPinned}
                      onArchive={onArchiveThread}
                    />
                  </SharedLayoutBgItem>
                )}
              </div>
            );
          })}
        </div>
      </SharedLayoutBgRoot>

      {threads.length > limit ? (
        <m.button
          type="button"
          onClick={onShowMore}
          whileTap={{ scale: 0.98 }}
          transition={SPRING_PRESS}
          className="ag-row mt-2 flex h-8 w-full items-center justify-center rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] text-[11px] font-medium text-[var(--ag-text-2)] hover:border-[var(--ag-line-strong)] hover:text-[var(--ag-text)]"
        >
          {t("agentChat.showMoreConversations", {
            count: Math.min(100, threads.length - limit),
          })}
        </m.button>
      ) : null}
    </section>
  );
}
