import {
  Copy,
  GitFork,
  MoreHorizontal,
  Pencil,
  Pin,
  Ticket,
  TicketX,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import { AgentJiraLinkDialog } from "@/components/agents/chat/agent-jira-link-dialog";
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
import { jiraThreadKey, useJiraLinks, useJiraStore } from "@/lib/jira/jira-store";
import type { JiraTicketLink } from "@/lib/jira/types";
import { AgDot } from "@/components/agents/ui/ag-dot";
import { Archive as ArchiveData, ArchiveRestore as ArchiveRestoreData, Pin as PinData, PinOff as PinOffData } from "lucide";
import { MorphIcon } from "@/components/ui/morph-icon";

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
    const timer = window.setInterval(() => {
      if (!document.hidden) setLabel(elapsedLabel(since));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [since]);
  return <>{label}</>;
}

/**
 * Status colour follows Jira's own three status categories rather than the
 * status name, which is per-project and unbounded.
 */
function statusTone(link: JiraTicketLink): string {
  const category = link.statusCategory.toLowerCase();
  if (category.includes("done") || category.includes("complete")) return "text-[var(--git-added)]";
  if (category.includes("progress")) return "text-[var(--git-modified)]";
  return "text-[var(--ag-text-3)]";
}

function JiraBadge({ links }: { links: JiraTicketLink[] }) {
  const [first, ...rest] = links;
  if (!first) return null;
  const title = [first.summary ? `${first.key}: ${first.summary}` : first.key, first.status]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="ml-auto flex min-w-0 shrink items-center gap-1 pl-1.5"
      title={rest.length ? `${title} (+${rest.length})` : title}
    >
      <Ticket className="size-2.5 shrink-0 text-[var(--ag-text-3)]" />
      <span className="truncate text-[10px] font-medium text-[var(--ag-text-2)]">{first.key}</span>
      {first.status ? (
        <span className={`truncate text-[10px] ${statusTone(first)}`}>{first.status}</span>
      ) : null}
      {rest.length ? <span className="ag-faint text-[10px]">+{rest.length}</span> : null}
    </span>
  );
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
  const [hovered, setHovered] = useState(false);
  const [linking, setLinking] = useState(false);
  const jiraEnabled = useJiraStore((state) => state.enabled);
  const unlinkTicket = useJiraStore((state) => state.unlinkTicket);
  const jiraKey = jiraThreadKey(thread.provider, thread.id);
  const jiraLinks = useJiraLinks(jiraKey);
  // Renaming is driven from the menu, but can also arrive as a prop, so it
  // arms the row on its own.
  const armed = hovered || renaming;
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
        <MorphIcon icon={thread.isPinned ? PinOffData : PinData} className="size-3.5" />
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
      {jiraEnabled ? (
        <>
          <Separator />
          <Item className={itemClassName} onSelect={() => setLinking(true)}>
            <Ticket className="size-3.5" />
            {t("jira.linkTicket")}
          </Item>
          {jiraLinks.map((link) => (
            <Item
              key={link.key}
              className={itemClassName}
              onSelect={() => unlinkTicket(jiraKey, link.key)}
            >
              <TicketX className="size-3.5" />
              {t("jira.unlink", { key: link.key })}
            </Item>
          ))}
        </>
      ) : null}
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
        <MorphIcon icon={thread.archived ? ArchiveRestoreData : ArchiveData} className="size-3.5" />
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
      className="ag-row ag-row-shared min-h-11 min-w-0 items-start overflow-hidden py-2 pr-8"
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
              <AgDot state="working" />
              <span className="text-[10px] font-medium tabular-nums text-[var(--git-modified)]">
                {t("agentChat.working")}
                {workingSince ? <> <WorkingFor since={workingSince} /></> : null}
              </span>
              <span className="ag-faint text-[10px]">·</span>
            </>
          ) : null}
          <span className="ag-faint truncate text-[10px] tabular-nums">{relativeDate}</span>
          {jiraEnabled ? <JiraBadge links={jiraLinks} /> : null}
        </span>
      </span>
    </div>
  );

  // A sidebar can hold hundreds of rows, and mounting two Radix menu roots per
  // row costs more than the row itself. Both menus stay out of the tree until
  // the pointer or keyboard focus actually reaches this row.
  return (
    <div
      className="group/thread relative"
      onPointerEnter={() => setHovered(true)}
      onFocusCapture={() => setHovered(true)}
      onContextMenu={() => setHovered(true)}
    >
      {armed ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {actions(ContextMenuItem, ContextMenuSeparator, "")}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}

      {linking ? (
        <AgentJiraLinkDialog threadKey={jiraKey} open onOpenChange={setLinking} />
      ) : null}

      {armed ? (
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
      ) : null}
    </div>
  );
});
