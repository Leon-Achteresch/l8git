import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, ArchiveRestore, MessageSquare } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { AgentThreadRow, isWorking } from "@/components/agents/chat/agent-thread-row";
import { Button } from "@/components/ui/button";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import {
  flattenThreads,
  type SidebarThread,
} from "@/lib/agents/thread-grouping";
import { pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import { useScrollMargin } from "@/hooks/use-scroll-margin";
import {
  SharedLayoutBgItem,
  SharedLayoutBgRoot,
} from "@/components/motion/shared-layout-bg";

export type { SidebarThread } from "@/lib/agents/thread-grouping";

// Starting guesses for the virtualizer; real heights replace them on measure.
const HEADER_ESTIMATE_PX = 24;
const ROW_ESTIMATE_PX = 48;
const OVERSCAN = 8;

const workingSince = new Map<string, number>();

/**
 * Remembers when each thread started working so the row can show an elapsed
 * timer. Runs in an effect — a render-phase mutation would fire again on every
 * unrelated re-render and, under StrictMode, twice per commit.
 */
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
  /** Scroll container the virtualizer measures against. */
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpenThread: (provider: NativeAgentProvider, threadId: string) => void;
  onCreateThread: () => void;
  onRenameThread: (threadKey: string | null) => void;
  onSetPinned: (provider: NativeAgentProvider, threadId: string, pinned: boolean) => Promise<void>;
  onArchiveThread: (provider: NativeAgentProvider, threadId: string, archived: boolean) => Promise<void>;
  onToggleArchived: () => void;
  onShowMore: () => void;
}) {
  const { t } = useTranslation();
  const since = useWorkingSince(threads);

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
    // The list is offset inside the scroller by the header/search chrome above
    // it; without this the virtualizer places rows a fixed distance too high.
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
        <ListHeader
          showArchived={showArchived}
          archivedCount={archivedCount}
          onToggleArchived={onToggleArchived}
        />
        <div className="space-y-px" aria-label={t("agentChat.loadingConversations")}>
          {[0, 1, 2, 3].map((index) => (
            <m.div
              animate={pulseKeyframes}
              transition={pulseTransition}
              key={index}
              className="h-11 rounded-[9px] bg-[var(--ag-hover)]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className="min-w-0 px-2 pb-4">
        <ListHeader
          showArchived={showArchived}
          archivedCount={archivedCount}
          onToggleArchived={onToggleArchived}
        />
        {hasQuery ? (
          <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noMatchingChats")}</p>
        ) : showArchived ? (
          <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noArchivedChats")}</p>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCreateThread}
            className="ag-row h-9 text-[11px]"
          >
            <MessageSquare className="size-3.5 shrink-0" />
            {t("agentChat.firstConversation")}
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="min-w-0 px-2 pb-4">
      <ListHeader
        showArchived={showArchived}
        archivedCount={archivedCount}
        onToggleArchived={onToggleArchived}
      />

      {/* layoutRoot (inside SharedLayoutBgRoot) scopes the hover pill's layout
          projection to this list, so scrolling the rail cannot smear its
          scroll offset into the pill's travel. */}
      <SharedLayoutBgRoot inset={4} className="relative">
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
                  <h3 className="ag-label px-2 pb-1 pt-2">{t(`agentChat.${item.group}`)}</h3>
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
    </section>
  );
}

function ListHeader({
  showArchived,
  archivedCount,
  onToggleArchived,
}: {
  showArchived: boolean;
  archivedCount: number;
  onToggleArchived: () => void;
}) {
  const { t } = useTranslation();
  return (
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
  );
}
