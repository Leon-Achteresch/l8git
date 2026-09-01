import { LayoutGrid } from "lucide-react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentRepoPicker } from "@/components/agents/chat/agent-repo-picker";
import { AgentSidebarActions } from "@/components/agents/chat/agent-sidebar-actions";
import { AgentThreadList } from "@/components/agents/chat/agent-thread-list";
import { AgentUsageSummary } from "@/components/agents/chat/agent-usage-summary";
import { Segment, Segmented } from "@/components/motion/segmented";
import {
  chatStoreFor,
  useAgentChatStore,
  useProviderChatStore,
} from "@/lib/agents/active-chat-store";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import {
  useAgentProviderStore,
  type NativeAgentProvider,
} from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";

const INITIAL_THREAD_LIMIT = 60;
const THREAD_PAGE_SIZE = 100;
const EMPTY_THREADS: AgentThreadSummary[] = [];
const taggedThreads = new WeakMap<
  AgentThreadSummary,
  AgentThreadSummary & { provider: NativeAgentProvider }
>();

function tagProvider(
  threads: AgentThreadSummary[],
  provider: NativeAgentProvider,
) {
  // Der Cache braucht Objekt-Keys. Ein kaputter Eintrag (alter persistierter
  // Katalog, unvollstaendige Provider-Antwort) wuerde die Sidebar sonst mit
  // "Invalid value used as weak map key" abschiessen, statt nur zu fehlen.
  return threads.flatMap((thread) => {
    if (thread === null || typeof thread !== "object") return [];
    const known = taggedThreads.get(thread);
    if (known) return [known];
    const tagged = { ...thread, provider };
    taggedThreads.set(thread, tagged);
    return [tagged];
  });
}

export const AgentChatSidebar = memo(function AgentChatSidebar({
  selectedPath,
  onOpenOverview,
}: {
  selectedPath: string;
  onOpenOverview?: () => void;
}) {
  const { i18n, t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const setProvider = useAgentProviderStore((state) => state.setProvider);
  const codexThreads = useProviderChatStore(
    "codex",
    (state) => state.threadsByPath[selectedPath] ?? EMPTY_THREADS,
  );
  const claudeThreads = useProviderChatStore(
    "claude",
    (state) => state.threadsByPath[selectedPath] ?? EMPTY_THREADS,
  );
  const cursorThreads = useProviderChatStore(
    "cursor",
    (state) => state.threadsByPath[selectedPath] ?? EMPTY_THREADS,
  );
  const openCodeThreads = useProviderChatStore(
    "opencode",
    (state) => state.threadsByPath[selectedPath] ?? EMPTY_THREADS,
  );
  const codexLoading = useProviderChatStore("codex", (state) =>
    Boolean(state.loadingPaths[selectedPath]),
  );
  const claudeLoading = useProviderChatStore("claude", (state) =>
    Boolean(state.loadingPaths[selectedPath]),
  );
  const cursorLoading = useProviderChatStore("cursor", (state) =>
    Boolean(state.loadingPaths[selectedPath]),
  );
  const openCodeLoading = useProviderChatStore("opencode", (state) =>
    Boolean(state.loadingPaths[selectedPath]),
  );
  const activeThreadByPath = useAgentChatStore(
    (state) => state.activeThreadByPath,
  );
  const createThread = useAgentChatStore((state) => state.createThread);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
  // NUL-separated so a path or query containing the separator cannot make
  // two different filter contexts share a key (and with the escape rather
  // than a raw byte, so the file stays text to git and grep).
  const paginationKey = `${selectedPath}\u0000${normalizedQuery}\u0000${showArchived}`;
  const [threadPagination, setThreadPagination] = useState({
    key: paginationKey,
    limit: INITIAL_THREAD_LIMIT,
  });
  const threadLimit =
    threadPagination.key === paginationKey
      ? threadPagination.limit
      : INITIAL_THREAD_LIMIT;
  const selectedThreads = useMemo(
    () =>
      [
        ...tagProvider(codexThreads, "codex"),
        ...tagProvider(claudeThreads, "claude"),
        ...tagProvider(cursorThreads, "cursor"),
        ...tagProvider(openCodeThreads, "opencode"),
      ].sort(
        (left, right) =>
          Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)) ||
          right.updatedAt - left.updatedAt,
      ),
    [claudeThreads, codexThreads, cursorThreads, openCodeThreads],
  );
  const archivedCount = useMemo(
    () => selectedThreads.filter((thread) => thread.archived).length,
    [selectedThreads],
  );
  const visibleThreads = useMemo(
    () =>
      selectedThreads.filter(
        (thread) =>
          Boolean(thread.archived) === showArchived &&
          (!normalizedQuery ||
            thread.title.toLocaleLowerCase().includes(normalizedQuery) ||
            thread.preview.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [normalizedQuery, selectedThreads, showArchived],
  );
  const newThread = useCallback(async () => {
    try {
      await createThread(selectedPath);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [createThread, selectedPath]);

  const openThread = useCallback(
    async (threadProvider: NativeAgentProvider, threadId: string) => {
      setProvider(threadProvider);
      try {
        await chatStoreFor(threadProvider)
          .getState()
          .openThread(selectedPath, threadId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [selectedPath, setProvider],
  );

  const handleOpenThread = useCallback(
    (threadProvider: NativeAgentProvider, threadId: string) =>
      void openThread(threadProvider, threadId),
    [openThread],
  );

  const handleSetPinned = useCallback(
    (threadProvider: NativeAgentProvider, threadId: string, pinned: boolean) =>
      chatStoreFor(threadProvider)
        .getState()
        .setThreadPinned(selectedPath, threadId, pinned),
    [selectedPath],
  );

  const handleArchive = useCallback(
    (
      threadProvider: NativeAgentProvider,
      threadId: string,
      archived: boolean,
    ) =>
      archived
        ? chatStoreFor(threadProvider)
            .getState()
            .archiveThread(selectedPath, threadId)
        : chatStoreFor(threadProvider)
            .getState()
            .unarchiveThread(selectedPath, threadId),
    [selectedPath],
  );

  const handleProviderChange = useCallback(
    (value: string) => setProvider(value as NativeAgentProvider),
    [setProvider],
  );

  return (
    <aside className="ag-rail flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="ag-line flex h-12 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b px-3.5">
        <AgentRepoPicker selectedPath={selectedPath} />
        {onOpenOverview ? (
          <button
            type="button"
            onClick={onOpenOverview}
            className="ag-icon-btn size-6 shrink-0"
            aria-label={t("agentOverview.title")}
            title={t("agentOverview.title")}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        ) : null}
      </header>

      <div className="ag-line flex min-w-0 shrink-0 justify-center overflow-hidden border-b px-2 py-2">
        <Segmented
          value={provider}
          onValueChange={handleProviderChange}
          aria-label={t("agentChat.settings.agent")}
          className="w-full min-w-0"
        >
          {AGENT_PROVIDERS.map(({ value, label, Logo }) => (
            <Segment
              key={value}
              value={value}
              title={label}
              aria-label={label}
              className="min-w-0 px-1.5 py-1"
            >
              <Logo className="size-3.5 shrink-0" />
              {value === provider ? (
                <span className="min-w-0 truncate">{label}</span>
              ) : null}
            </Segment>
          ))}
        </Segmented>
      </div>

      <div className="ag-line min-w-0 overflow-hidden border-b py-2">
        <AgentSidebarActions
          query={query}
          onQueryChange={setQuery}
          onNewThread={() => void newThread()}
        />
      </div>

      {/* Plain scroller rather than the Radix ScrollArea: the thread list is
          virtualized and the virtualizer needs the scroll element itself. */}
      <div
        ref={scrollRef}
        className="ag-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div className="pt-3">
          <AgentThreadList
            path={selectedPath}
            threads={visibleThreads}
            activeProvider={provider}
            activeThreadId={activeThreadByPath[selectedPath] ?? null}
            loading={
              codexLoading || claudeLoading || cursorLoading || openCodeLoading
            }
            hasQuery={Boolean(normalizedQuery)}
            limit={threadLimit}
            renamingThreadKey={renamingThreadKey}
            locale={i18n.language}
            showArchived={showArchived}
            archivedCount={archivedCount}
            scrollRef={scrollRef}
            onToggleArchived={() => setShowArchived((value) => !value)}
            onOpenThread={handleOpenThread}
            onCreateThread={() => void newThread()}
            onRenameThread={setRenamingThreadKey}
            onSetPinned={handleSetPinned}
            onArchiveThread={handleArchive}
            onShowMore={() =>
              setThreadPagination({
                key: paginationKey,
                limit: threadLimit + THREAD_PAGE_SIZE,
              })
            }
          />
        </div>
      </div>

      <AgentUsageSummary />
    </aside>
  );
});
