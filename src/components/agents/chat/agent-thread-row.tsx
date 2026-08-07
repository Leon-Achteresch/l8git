import { Archive, MoreHorizontal, Pencil, Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";

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
  thread: AgentThreadSummary & { provider: NativeAgentProvider };
  active: boolean;
  relativeDate: string;
  renaming: boolean;
  onOpen: () => void;
  onRenamingChange: (renaming: boolean) => void;
  onSetPinned: (pinned: boolean) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const working = thread.status !== "idle" && thread.status !== "notLoaded";
  const providerMeta = agentProviderMeta(thread.provider);
  const ProviderLogo = providerMeta.Logo;

  return (
    <div className="group/thread relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen();
        }}
        aria-current={active ? "page" : undefined}
        data-active={active}
        className="ag-row min-h-11 items-start py-2 pr-8"
      >
        <span
          className="mt-0.5 grid size-4 shrink-0 place-items-center"
          title={providerMeta.label}
          aria-label={providerMeta.label}
        >
          <ProviderLogo className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {thread.isPinned ? <Pin className="ag-faint size-2.5 shrink-0" /> : null}
            <AgentInlineTitle
              path={path}
              provider={thread.provider}
              threadId={thread.id}
              title={thread.title}
              editing={renaming}
              onEditingChange={onRenamingChange}
              className="min-w-0 flex-1 truncate text-[12px]"
              inputClassName="text-[12px]"
            />
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {working ? (
              <>
                <span className="ag-dot" data-state="working" aria-hidden="true" />
                <span className="text-[10px] font-medium text-[var(--git-modified)]">
                  {t("agentChat.working")}
                </span>
                <span className="ag-faint text-[10px]">·</span>
              </>
            ) : null}
            <span className="ag-faint truncate text-[10px] tabular-nums">{relativeDate}</span>
          </span>
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="ag-icon-btn absolute right-1 top-1.5 size-6 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={t("agentChat.manageConversation")}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ag-menu w-44 p-1.5">
          <DropdownMenuItem
            className="ag-menu-item text-[12px] focus:bg-[var(--ag-hover)]"
            onClick={() => void onSetPinned(!thread.isPinned).catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : String(error)),
            )}
          >
            {thread.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {thread.isPinned ? t("agentChat.unpin") : t("agentChat.pin")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="ag-menu-item text-[12px] focus:bg-[var(--ag-hover)]"
            onClick={() => onRenamingChange(true)}
          >
            <Pencil className="size-3.5" />
            {t("agentChat.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="ag-menu-item text-[12px]"
            onClick={() => void onArchive().catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : String(error)),
            )}
          >
            <Archive className="size-3.5" />
            {t("agentChat.archive")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
