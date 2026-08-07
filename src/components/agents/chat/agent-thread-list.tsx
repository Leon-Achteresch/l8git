import { MessageSquare } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { AgentThreadRow } from "@/components/agents/chat/agent-thread-row";
import type { AgentThreadSummary } from "@/lib/agents/types";
import { SPRING_PANEL } from "@/lib/motion/ease";

export function AgentThreadList({
  path,
  threads,
  activeThreadId,
  loading,
  hasQuery,
  limit,
  renamingThreadId,
  locale,
  onOpenThread,
  onCreateThread,
  onRenameThread,
  onSetPinned,
  onArchiveThread,
  onShowMore,
}: {
  path: string;
  threads: AgentThreadSummary[];
  activeThreadId: string | null;
  loading: boolean;
  hasQuery: boolean;
  limit: number;
  renamingThreadId: string | null;
  locale: string;
  onOpenThread: (threadId: string) => void;
  onCreateThread: () => void;
  onRenameThread: (threadId: string | null) => void;
  onSetPinned: (threadId: string, pinned: boolean) => Promise<void>;
  onArchiveThread: (threadId: string) => Promise<void>;
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
    <section className="px-3 pb-4">
      <div className="mb-1.5 flex items-center px-2">
        <h2 className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
          Recent chats
        </h2>
        <span className="ml-auto text-[9px] tabular-nums text-muted-foreground/65">
          {threads.length}
        </span>
      </div>

      {loading ? (
        <div className="space-y-1" aria-label={t("agentChat.loadingConversations")}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-11 animate-pulse rounded-[10px] bg-foreground/[0.035]" />
          ))}
        </div>
      ) : threads.length === 0 && hasQuery ? (
        <p className="rounded-[10px] px-2.5 py-3 text-[10px] text-muted-foreground">No matching chats</p>
      ) : threads.length === 0 ? (
        <button
          type="button"
          onClick={onCreateThread}
          className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-3 text-left text-[10px] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.035] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquare className="agents-accent-text size-3" />
          {t("agentChat.firstConversation")}
        </button>
      ) : (
        <div className="space-y-0.5">
          {threads.slice(0, limit).map((thread, index) => (
            <m.div
              key={thread.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_PANEL, delay: Math.min(index, 8) * 0.025 }}
            >
              <AgentThreadRow
                path={path}
                thread={thread}
                active={thread.id === activeThreadId}
                relativeDate={relativeDate(thread.updatedAt)}
                renaming={renamingThreadId === thread.id}
                onOpen={() => onOpenThread(thread.id)}
                onRenamingChange={(renaming) => onRenameThread(renaming ? thread.id : null)}
                onSetPinned={(pinned) => onSetPinned(thread.id, pinned)}
                onArchive={() => onArchiveThread(thread.id)}
              />
            </m.div>
          ))}
          {threads.length > limit ? (
            <button
              type="button"
              onClick={onShowMore}
              className="mt-1 w-full rounded-[10px] px-2 py-2 text-center text-[10px] font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.035] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("agentChat.showMoreConversations", { count: Math.min(100, threads.length - limit) })}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
