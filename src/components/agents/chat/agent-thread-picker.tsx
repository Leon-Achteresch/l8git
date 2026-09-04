import { Check, ChevronsUpDown, LayoutGrid, MessageSquare, Plus } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { chatStoreFor, useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

const EMPTY_THREADS: AgentThreadSummary[] = [];

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  const seconds = Math.round(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "gerade eben";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function AgentThreadPicker({
  path,
  currentThreadId,
  onOpenOverview,
}: {
  path: string;
  currentThreadId: string | null;
  onOpenOverview?: () => void;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const threads = useAgentChatStore(
    (state) => state.threadsByPath?.[path] ?? EMPTY_THREADS,
  );
  const createThread = useAgentChatStore((state) => state.createThread);

  const activeThreads = useMemo(
    () => threads.filter((thread) => !thread.archived).slice(0, 8),
    [threads],
  );

  const handleCreate = useCallback(async () => {
    try {
      if (!createThread) return;
      await createThread(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [createThread, path]);

  const handleSelect = useCallback(
    (threadId: string) => {
      if (threadId === currentThreadId) return;
      void chatStoreFor(provider)
        .getState()
        .openThread(path, threadId)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
    },
    [currentThreadId, path, provider],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
          aria-label={t("agentChat.manageConversation")}
        >
          <ChevronsUpDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onClick={() => void handleCreate()} className="gap-2 font-medium">
          <Plus className="size-4" />
          <span>{t("agentChat.newConversation")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("agentChat.recents")}
        </DropdownMenuLabel>
        {activeThreads.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            {t("agentChat.firstConversation")}
          </div>
        ) : (
          activeThreads.map((thread) => {
            const active = thread.id === currentThreadId;
            return (
              <DropdownMenuItem
                key={thread.id}
                onClick={() => handleSelect(thread.id)}
                className={cn("flex items-center gap-2 text-xs", active && "bg-muted font-medium")}
              >
                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{thread.title || t("agentChat.conversation")}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatTimestamp(thread.updatedAt)}
                </span>
                {active ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
        {onOpenOverview ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenOverview} className="gap-2 text-xs">
              <LayoutGrid className="size-3.5" />
              <span>{t("agentOverview.title", "Alle Threads anzeigen")}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
