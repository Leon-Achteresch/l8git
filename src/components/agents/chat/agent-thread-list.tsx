import { Archive, ArchiveRestore, MessageSquare } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { AgentThreadRow } from "@/components/agents/chat/agent-thread-row";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";
import { SPRING_PANEL } from "@/lib/motion/ease";

export type SidebarThread = AgentThreadSummary & { provider: NativeAgentProvider };

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
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
  const relativeDate = (timestamp: number) => {
    const seconds = Math.round(Date.now() / 1000 - timestamp);
    if (seconds < 60) return formatter.format(0, "second");
    if (seconds < 3600) return formatter.format(-Math.round(seconds / 60), "minute");
    if (seconds < 86400) return formatter.format(-Math.round(seconds / 3600), "hour");
    if (seconds < 604800) return formatter.format(-Math.round(seconds / 86400), "day");
    return dateFormatter.format(timestamp * 1000);
  };

  return (
    <section className="px-2 pb-4">
      <div className="flex items-center justify-between px-2 pb-1.5">
        <h2 className="ag-label">
          {showArchived ? t("agentChat.archived") : t("agentChat.recents")}
        </h2>
        {showArchived || archivedCount > 0 ? (
          <button
            type="button"
            onClick={onToggleArchived}
            data-active={showArchived}
            className="ag-icon-btn size-5"
            aria-pressed={showArchived}
            aria-label={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
            title={showArchived ? t("agentChat.recents") : t("agentChat.showArchived")}
          >
            {showArchived ? <ArchiveRestore className="size-3" /> : <Archive className="size-3" />}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-px" aria-label={t("agentChat.loadingConversations")}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-11 animate-pulse rounded-[9px] bg-[var(--ag-hover)]" />
          ))}
        </div>
      ) : threads.length === 0 && hasQuery ? (
        <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noMatchingChats")}</p>
      ) : threads.length === 0 && showArchived ? (
        <p className="ag-faint px-2 py-3 text-[11px]">{t("agentChat.noArchivedChats")}</p>
      ) : threads.length === 0 ? (
        <button type="button" onClick={onCreateThread} className="ag-row h-9 text-[11px]">
          <MessageSquare className="size-3.5 shrink-0" />
          {t("agentChat.firstConversation")}
        </button>
      ) : (
        <div className="space-y-px">
          {threads.slice(0, limit).map((thread, index) => {
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
                  renaming={renamingThreadKey === threadKey}
                  onOpen={() => onOpenThread(thread.provider, thread.id)}
                  onRenamingChange={(renaming) => onRenameThread(renaming ? threadKey : null)}
                  onSetPinned={(pinned) => onSetPinned(thread.provider, thread.id, pinned)}
                  onArchive={(archived) => onArchiveThread(thread.provider, thread.id, archived)}
                />
              </m.div>
            );
          })}
          {threads.length > limit ? (
            <button
              type="button"
              onClick={onShowMore}
              className="ag-row mt-1 h-8 justify-center text-[11px] font-medium"
            >
              {t("agentChat.showMoreConversations", { count: Math.min(100, threads.length - limit) })}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
