import { Archive, LoaderCircle, MoreHorizontal, Pencil, Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentThreadSummary } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

export function AgentThreadRow({
  path,
  thread,
  active,
  relativeDate,
  renaming,
  onOpen,
  onRenamingChange,
  onSetPinned,
  onArchive,
}: {
  path: string;
  thread: AgentThreadSummary;
  active: boolean;
  relativeDate: string;
  renaming: boolean;
  onOpen: () => void;
  onRenamingChange: (renaming: boolean) => void;
  onSetPinned: (pinned: boolean) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <article
      className={cn(
        "group/thread relative flex items-center rounded-[10px] transition-colors",
        active
          ? "agents-active-rail bg-foreground/[0.06] pl-1"
          : "hover:bg-foreground/[0.032]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 rounded-[10px] px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground/90">
          <AgentInlineTitle
            path={path}
            threadId={thread.id}
            title={thread.title}
            editing={renaming}
            onEditingChange={onRenamingChange}
            className="min-w-0 flex-1"
            inputClassName="text-[11px]"
          />
          {thread.status !== "idle" && thread.status !== "notLoaded" ? (
            <LoaderCircle className="agents-accent-text size-2.5 shrink-0 animate-spin" />
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground/65">
          {thread.isPinned ? <Pin className="size-2.5" /> : null}
          <span>{relativeDate}</span>
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mr-1 rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover/thread:opacity-100 data-[state=open]:opacity-100"
            aria-label={t("agentChat.manageConversation")}
          >
            <MoreHorizontal className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
          <DropdownMenuItem
            className="rounded-lg"
            onClick={() => void onSetPinned(!thread.isPinned).catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : String(error)),
            )}
          >
            {thread.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {thread.isPinned ? t("agentChat.unpin") : t("agentChat.pin")}
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-lg" onClick={() => onRenamingChange(true)}>
            <Pencil className="size-3.5" />
            {t("agentChat.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="rounded-lg"
            onClick={() => void onArchive().catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : String(error)),
            )}
          >
            <Archive className="size-3.5" />
            {t("agentChat.archive")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}
