import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import {
  AgentThreadRow,
  isWorking,
} from "@/components/agents/chat/agent-thread-row";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import { Button } from "@/components/ui/button";
import { useScrollMargin } from "@/hooks/use-scroll-margin";
import { compactAge } from "@/lib/agents/compact-age";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import {
  flattenThreads,
  type SidebarThread,
} from "@/lib/agents/thread-grouping";
import { SPRING_PRESS } from "@/lib/motion/ease";

export type { SidebarThread } from "@/lib/agents/thread-grouping";

const HEADER_ESTIMATE_PX = 28;
const ROW_ESTIMATE_PX = 52;
const OVERSCAN = 8;

const workingSince = new Map<string, number>();

function useWorkingSince(threads: SidebarThread[]): Map<string, number> {
  useEffect(() => {
    const live = new Set<string>();
    for (const thread of threads) {
      if (!isWorking(thread.status)) continue;
      const key = `${thread.provider}:${thread.path}:${thread.id}`;
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
  scrollRef,
  onOpenThread,
  onCreateThread,
  onRenameThread,
  onSetPinned,
  onArchiveThread,
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
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpenThread: (
    provider: NativeAgentProvider,
    threadId: string,
    path: string,
  ) => void;
  onCreateThread: () => void;
  onRenameThread: (threadKey: string | null) => void;
  onSetPinned: (
    provider: NativeAgentProvider,
    threadId: string,
    pinned: boolean,
    path: string,
  ) => Promise<void>;
  onArchiveThread: (
    provider: NativeAgentProvider,
    threadId: string,
    archived: boolean,
    path: string,
  ) => Promise<void>;
  onShowMore: () => void;
}) {
  const { t } = useTranslation();
  const since = useWorkingSince(threads);

  const relativeDate = useMemo(
    () => (timestamp: number) => compactAge(timestamp, locale),
    [locale],
  );

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

  if (loading && threads.length === 0) {
    return (
      <section className="min-w-0 px-2 pb-4">
        <div
          className="space-y-1.5 pt-1"
          aria-label={t("agentChat.loadingConversations")}
        >
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <m.div
              animate={pulseKeyframes}
              transition={{ ...pulseTransition, delay: index * 0.07 }}
              key={index}
              className="flex min-h-[3.75rem] flex-col justify-center gap-1 rounded-[10px] px-2 py-1.5"
            >
              <span className="flex items-center justify-between">
                <span className="h-2 w-24 rounded-full bg-[var(--ag-hover)]" />
                <span className="h-2 w-8 rounded-full bg-[var(--ag-hover)]" />
              </span>
              <span className="block h-2.5 w-[72%] rounded-full bg-[var(--ag-hover)]" />
              <span className="block h-2 w-[44%] rounded-full bg-[var(--ag-hover)]" />
            </m.div>
          ))}
        </div>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className="min-w-0 px-2 pb-4">
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
              className="rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] flex h-11 w-full items-center justify-center gap-2 border-[var(--ag-line)] bg-[var(--ag-surface)] text-[12px] font-medium text-[var(--ag-text)] shadow-[var(--ag-shadow-raise)] hover:border-[var(--ag-line-strong)]"
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
                  <h3 className="text-[10px] font-medium tracking-[0.02em] text-[var(--ag-text-3)] text-[10px] font-semibold uppercase tracking-wider text-[var(--ag-text-3)]">
                    {t(`agentChat.${item.group}`)}
                  </h3>
                  <div className="h-px flex-1 bg-[var(--ag-line)]" />
                </div>
              ) : (
                <AgentThreadRow
                  path={item.thread.path}
                  thread={item.thread}
                  active={
                    item.thread.id === activeThreadId &&
                    item.thread.provider === activeProvider &&
                    item.thread.path === path
                  }
                  relativeDate={relativeDate(item.thread.updatedAt)}
                  workingSince={since.get(item.key)}
                  renaming={renamingThreadKey === item.key}
                  onOpen={(provider, threadId) =>
                    onOpenThread(provider, threadId, item.thread.path)
                  }
                  onRename={onRenameThread}
                  onSetPinned={(provider, threadId, pinned) =>
                    onSetPinned(provider, threadId, pinned, item.thread.path)
                  }
                  onArchive={(provider, threadId, archived) =>
                    onArchiveThread(provider, threadId, archived, item.thread.path)
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {threads.length > limit ? (
        <m.button
          type="button"
          onClick={onShowMore}
          whileTap={{ scale: 0.98 }}
          transition={SPRING_PRESS}
          className="relative flex w-full min-w-0 items-center gap-2 rounded-[var(--ag-r-md)] px-2 text-left text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform,box-shadow] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:bg-[var(--ag-press)] focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[var(--ag-surface)] data-[active=true]:text-[var(--ag-text)] data-[active=true]:shadow-[var(--ag-shadow-raise)] mt-2 flex h-8 w-full items-center justify-center rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] text-[11px] font-medium text-[var(--ag-text-2)] hover:border-[var(--ag-line-strong)] hover:text-[var(--ag-text)]"
        >
          {t("agentChat.showMoreConversations", {
            count: Math.min(100, threads.length - limit),
          })}
        </m.button>
      ) : null}
    </section>
  );
}
