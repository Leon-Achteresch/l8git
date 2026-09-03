import {
  Archive as ArchiveData,
  ArchiveRestore as ArchiveRestoreData,
  Pin as PinData,
  PinOff as PinOffData,
} from "lucide";
import {
  Copy,
  GitBranch,
  GitFork,
  MoreHorizontal,
  Pencil,
  Pin,
  Ticket,
  TicketX,
  Trash2,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentInlineTitle } from "@/components/agents/chat/agent-inline-title";
import { AgentJiraLinkDialog } from "@/components/agents/chat/agent-jira-link-dialog";
import { AgentThreadJiraBadge } from "@/components/agents/chat/agent-thread-jira-badge";
import { AgentThreadWorkingTimer } from "@/components/agents/chat/agent-thread-working-timer";
import { AgentWorkingRing } from "@/components/agents/ui/agent-working-ring";
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
import { MorphIcon } from "@/components/ui/morph-icon";
import { chatStoreFor, useProviderChatStore } from "@/lib/agents/active-chat-store";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { diffFromConversation } from "@/lib/agents/thread-diff";
import type { AgentThreadSummary } from "@/lib/agents/types";
import {
  jiraThreadKey,
  useJiraLinks,
  useJiraStore,
} from "@/lib/jira/jira-store";
import { SPRING_PRESS } from "@/lib/motion/ease";

export function isWorking(status: string): boolean {
  return status !== "idle" && status !== "notLoaded";
}

type MenuItemProps = {
  variant?: "destructive";
  className?: string;
  onSelect?: () => void;
  children: ReactNode;
};

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
  onSetPinned: (
    provider: NativeAgentProvider,
    threadId: string,
    pinned: boolean,
  ) => Promise<void>;
  onArchive: (
    provider: NativeAgentProvider,
    threadId: string,
    archived: boolean,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [linking, setLinking] = useState(false);
  const jiraEnabled = useJiraStore((state) => state.enabled);
  const unlinkTicket = useJiraStore((state) => state.unlinkTicket);
  const jiraKey = jiraThreadKey(thread.provider, thread.id);
  const jiraLinks = useJiraLinks(jiraKey);
  const armed = hovered || renaming;
  const working = isWorking(thread.status);
  const providerMeta = agentProviderMeta(thread.provider);
  const ProviderLogo = providerMeta.Logo;
  const { provider, id: threadId } = thread;
  const modelName = useProviderChatStore(provider, (state) => {
    const modelId = state.conversations[threadId]?.model;
    if (!modelId) return null;
    return state.models.find((model) => model.id === modelId)?.label ?? modelId;
  });
  const conversation = useProviderChatStore(
    provider,
    (state) => state.conversations[threadId],
  );
  const worktree = useAgentWorktreeStore((state) => state.worktrees[thread.path]);
  const liveDiff = useMemo(() => diffFromConversation(conversation), [conversation]);
  const additions = liveDiff?.additions ?? thread.additions ?? 0;
  const deletions = liveDiff?.deletions ?? thread.deletions ?? 0;
  const branch = worktree?.branch ?? "";
  const hasDiff = additions > 0 || deletions > 0;

  const open = useCallback(
    () => onOpen(provider, threadId),
    [onOpen, provider, threadId],
  );
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
      <Item
        className={itemClassName}
        onSelect={() => setPinned(!thread.isPinned)}
      >
        <MorphIcon
          icon={thread.isPinned ? PinOffData : PinData}
          className="size-3.5"
        />
        {thread.isPinned ? t("agentChat.unpin") : t("agentChat.pin")}
      </Item>
      <Item className={itemClassName} onSelect={() => setRenaming(true)}>
        <Pencil className="size-3.5" />
        {t("agentChat.rename")}
      </Item>
      <Item
        className={itemClassName}
        onSelect={() =>
          run(() =>
            chatStoreFor(thread.provider).getState().forkThread(path, thread.id),
          )
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
      <Item
        className={itemClassName}
        onSelect={() => copy(thread.title, t("agentChat.titleCopied"))}
      >
        <Copy className="size-3.5" />
        {t("agentChat.copyTitle")}
      </Item>
      <Item
        className={itemClassName}
        onSelect={() => copy(thread.id, t("agentChat.idCopied"))}
      >
        <Copy className="size-3.5" />
        {t("agentChat.copyId")}
      </Item>
      <Separator />
      <Item
        variant={thread.archived ? undefined : "destructive"}
        className={itemClassName}
        onSelect={() => run(() => archive(!thread.archived))}
      >
        <MorphIcon
          icon={thread.archived ? ArchiveRestoreData : ArchiveData}
          className="size-3.5"
        />
        {thread.archived ? t("agentChat.unarchive") : t("agentChat.archive")}
      </Item>
      <Item
        variant="destructive"
        className={itemClassName}
        onSelect={() => {
          if (
            !window.confirm(
              t("agentChat.confirmDeleteThread", { title: thread.title }),
            )
          )
            return;
          run(() =>
            chatStoreFor(thread.provider)
              .getState()
              .deleteThread(path, thread.id),
          );
        }}
      >
        <Trash2 className="size-3.5" />
        {t("agentChat.deletePermanently")}
      </Item>
    </>
  );

  const row = (
    <m.div
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
      data-agent-thread={thread.id}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={SPRING_PRESS}
      className="ag-row ag-thread"
    >
      <span className="ag-thread-line">
        {thread.isPinned ? (
          <Pin className="size-2.5 shrink-0 text-[var(--git-branch)]" />
        ) : null}
        <AgentInlineTitle
          path={path}
          provider={thread.provider}
          threadId={thread.id}
          title={thread.title}
          editing={renaming}
          onEditingChange={setRenaming}
          className="ag-thread-name"
          inputClassName="text-[13px]"
        />
        <span className="ag-thread-meta ag-thread-meta-time">
          {working && workingSince ? (
            <AgentThreadWorkingTimer since={workingSince} />
          ) : (
            relativeDate
          )}
        </span>
      </span>
      <span className="ag-thread-line ag-thread-foot">
        <span className="ag-thread-mark">
          <ProviderLogo />
          {working ? (
            <span className="ag-thread-busy">
              <AgentWorkingRing size={18} thickness={1.5} className="size-full" />
            </span>
          ) : null}
        </span>
        <span className="ag-thread-repo">{modelName ?? providerMeta.label}</span>
        {branch ? (
          <>
            <GitBranch className="ag-thread-logo shrink-0 opacity-70" />
            <span className="ag-thread-repo">{branch}</span>
          </>
        ) : null}
        {jiraEnabled ? <AgentThreadJiraBadge links={jiraLinks} /> : null}
        {hasDiff ? (
          <span className="ag-thread-trail">
            <span className="ag-thread-diff">
              {additions > 0 ? (
                <span className="ag-thread-diff-add">+{additions}</span>
              ) : null}
              {deletions > 0 ? (
                <span className="ag-thread-diff-del">-{deletions}</span>
              ) : null}
            </span>
          </span>
        ) : null}
      </span>
    </m.div>
  );

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
        <AgentJiraLinkDialog
          threadKey={jiraKey}
          open
          onOpenChange={setLinking}
        />
      ) : null}

      {armed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ag-icon-btn absolute right-1.5 bottom-1.5 size-6 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
