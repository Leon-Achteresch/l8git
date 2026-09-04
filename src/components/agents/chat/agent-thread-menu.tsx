import { Archive, Boxes, GitFork, GitPullRequestArrow, MoreHorizontal, SquareTerminal, Trash2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";

const AgentBackgroundTerminalsDialog = lazy(() => import(
  "@/components/agents/chat/agent-background-terminals-dialog"
).then((module) => ({ default: module.AgentBackgroundTerminalsDialog })));

export function AgentThreadMenu({
  path,
  threadId,
  busy,
}: {
  path: string;
  threadId: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const startReview = useAgentChatStore((state) => state.startReview);
  const compactThread = useAgentChatStore((state) => state.compactThread);
  const forkThread = useAgentChatStore((state) => state.forkThread);
  const archiveThread = useAgentChatStore((state) => state.archiveThread);
  const deleteThread = useAgentChatStore((state) => state.deleteThread);
  const [terminalsOpen, setTerminalsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          aria-label={t("agentChat.thread.actions")}
          title={t("agentChat.thread.actions")}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="overflow-hidden rounded-[var(--ag-r-lg)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-pop)] w-52 p-1.5">
        <DropdownMenuItem
          className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]"
          disabled={busy}
          onClick={() => void run(() => startReview(threadId))}
        >
          <GitPullRequestArrow className="size-3.5" />
          {t("agentChat.thread.review")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]"
          disabled={busy}
          onClick={() => void run(() => forkThread(path, threadId))}
        >
          <GitFork className="size-3.5" />
          {t("agentChat.thread.fork")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]"
          disabled={busy}
          onClick={() =>
            void run(
              () => compactThread(threadId),
              t("agentChat.thread.compactionStarted"),
            )
          }
        >
          <Boxes className="size-3.5" />
          {t("agentChat.thread.compact")}
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]" onClick={() => setTerminalsOpen(true)}>
          <SquareTerminal className="size-3.5" />
          Background terminals
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px] focus:bg-[var(--ag-hover)]"
          disabled={busy}
          onClick={() => void run(() => archiveThread(path, threadId))}
        >
          <Archive className="size-3.5" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="flex w-full items-center gap-2.5 rounded-[var(--ag-r-sm)] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-[var(--ag-hover)] focus-visible:bg-[var(--ag-hover)] disabled:pointer-events-none disabled:opacity-40 text-[12px]"
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" />
          Delete permanently…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Suspense fallback={null}>
      {terminalsOpen ? (
        <AgentBackgroundTerminalsDialog
          threadId={threadId}
          open
          onOpenChange={setTerminalsOpen}
        />
      ) : null}
    </Suspense>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            {provider === "claude"
              ? "The Claude transcript is removed from Claude Code and moved to ~/.claude/l8git-trash for recovery."
              : provider === "opencode"
                ? "The OpenCode session is closed and deleted via the opencode CLI. This cannot be undone."
                : "The Codex transcript and descendant sessions are permanently deleted. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void run(() => deleteThread(path, threadId))}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
