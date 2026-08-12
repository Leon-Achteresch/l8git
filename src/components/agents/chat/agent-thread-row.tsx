import {
  Archive,
  ArchiveRestore,
  Copy,
  GitFork,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";

export function isWorking(status: string): boolean {
  return status !== "idle" && status !== "notLoaded";
}

type MenuItemProps = {
  variant?: "destructive";
  className?: string;
  onSelect?: () => void;
  children: ReactNode;
};

function elapsedLabel(startedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function WorkingFor({ since }: { since: number }) {
  const [label, setLabel] = useState(() => elapsedLabel(since));
  useEffect(() => {
    setLabel(elapsedLabel(since));
    const timer = window.setInterval(() => setLabel(elapsedLabel(since)), 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  return <>{label}</>;
}

export const AgentThreadRow = memo(function AgentThreadRow({
  path,
  thread,
  active,
  relativeDate,
  workingSince,
  renaming,
  onOpen,
  onRename,
  onSetPinned,
  onArchive,
}: {
  path: string;
  thread: AgentThreadSummary & { provider: NativeAgentProvider };
  active: boolean;
  relativeDate: string;
  workingSince?: number;
  renaming: boolean;
  onOpen: (provider: NativeAgentProvider, threadId: string) => void;
  onRename: (threadKey: string | null) => void;
  onSetPinned: (provider: NativeAgentProvider, threadId: string, pinned: boolean) => Promise<void>;
  onArchive: (provider: NativeAgentProvider, threadId: string, archived: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const working = isWorking(thread.status);
  const providerMeta = agentProviderMeta(thread.provider);
  const ProviderLogo = providerMeta.Logo;
  const { provider, id: threadId } = thread;
  const open = useCallback(() => onOpen(provider, threadId), [onOpen, provider, threadId]);
  const setRenaming = useCallback(
    (value: boolean) => onRename(value ? `${provider}:${threadId}` : null),
    [onRename, provider, threadId],
  );
  const setPinned = useCallback(
    (pinned: boolean) => onSetPinned(provider, threadId, pinned),
    [onSetPinned, provider, threadId],
  );
  const archive = useCallback(
    (archived: boolean) => onArchive(provider, threadId, archived),
    [onArchive, provider, threadId],
  );

  const run = (action: () => Promise<unknown>, success?: string) => {
    void action()
      .then(() => {
        if (success) toast.success(success);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
      );
  };

  const copy = (value: string, success: string) => {
    run(async () => navigator.clipboard?.writeText(value), success);
  };

  const actions = (
    Item: ComponentType<MenuItemProps>,
    Separator: ComponentType<Record<string, never>>,
    itemClassName: string,
  ) => (
    <>
      <Item className={itemClassName} onSelect={() => setPinned(!thread.isPinned)}>
        {thread.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {thread.isPinned ? t("agentChat.unpin") : t("agentChat.pin")}
      </Item>
      <Item className={itemClassName} onSelect={() => setRenaming(true)}>
        <Pencil className="size-3.5" />
        {t("agentChat.rename")}
      </Item>
      <Item
        className={itemClassName}
        onSelect={() =>
          run(() => chatStoreFor(thread.provider).getState().forkThread(path, thread.id))
        }
      >
        <GitFork className="size-3.5" />
        {t("agentChat.thread.fork")}
      </Item>
      <Separator />
      <Item className={itemClassName} onSelect={() => copy(thread.title, t("agentChat.titleCopied"))}>
        <Copy className="size-3.5" />
        {t("agentChat.copyTitle")}
      </Item>
      <Item className={itemClassName} onSelect={() => copy(thread.id, t("agentChat.idCopied"))}>
        <Copy className="size-3.5" />
        {t("agentChat.copyId")}
      </Item>
      <Separator />
      <Item
        variant={thread.archived ? undefined : "destructive"}
        className={itemClassName}
        onSelect={() => run(() => archive(!thread.archived))}
      >
        {thread.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
        {thread.archived ? t("agentChat.unarchive") : t("agentChat.archive")}
      </Item>
      <Item
        variant="destructive"
        className={itemClassName}
        onSelect={() => {
          if (!window.confirm(t("agentChat.confirmDeleteThread", { title: thread.title }))) return;
          run(() => chatStoreFor(thread.provider).getState().deleteThread(path, thread.id));
        }}
      >
        <Trash2 className="size-3.5" />
        {t("agentChat.deletePermanently")}
      </Item>
    </>
  );

  const row = (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
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
            onEditingChange={setRenaming}
            className="min-w-0 flex-1 truncate text-[12px]"
            inputClassName="text-[12px]"
          />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {working ? (
            <>
              <span className="ag-dot" data-state="working" aria-hidden="true" />
              <span className="text-[10px] font-medium tabular-nums text-[var(--git-modified)]">
                {t("agentChat.working")}
                {workingSince ? <> <WorkingFor since={workingSince} /></> : null}
              </span>
              <span className="ag-faint text-[10px]">·</span>
            </>
          ) : null}
          <span className="ag-faint truncate text-[10px] tabular-nums">{relativeDate}</span>
        </span>
      </span>
    </div>
  );

  return (
    <div className="group/thread relative">
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {actions(ContextMenuItem, ContextMenuSeparator, "")}
        </ContextMenuContent>
      </ContextMenu>

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
        <DropdownMenuContent align="end" className="ag-menu w-52 p-1.5">
          {actions(
            DropdownMenuItem,
            DropdownMenuSeparator,
            "ag-menu-item text-[12px] focus:bg-[var(--ag-hover)]",
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
