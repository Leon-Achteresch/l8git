import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentSidebarActions } from "@/components/agents/chat/agent-sidebar-actions";
import { AgentThreadList } from "@/components/agents/chat/agent-thread-list";
import { AgentUsageSummary } from "@/components/agents/chat/agent-usage-summary";
import {
  chatStoreFor,
  useAgentChatStore,
  useProviderChatStore,
} from "@/lib/agents/active-chat-store";
import { useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import {
  useAgentProviderStore,
  type NativeAgentProvider,
} from "@/lib/agents/provider-store";
import {
  detectInstalledAgents,
  useInstalledAgents,
} from "@/lib/agent-integrations";
import type { AgentThreadSummary } from "@/lib/agents/types";

const INITIAL_THREAD_LIMIT = 60;
const THREAD_PAGE_SIZE = 100;
const taggedThreads = new WeakMap<
  AgentThreadSummary,
  AgentThreadSummary & { provider: NativeAgentProvider }
>();

function flattenCatalog(threadsByPath: Record<string, AgentThreadSummary[]>) {
  return Object.values(threadsByPath).flat();
}

function anyLoading(loadingPaths: Record<string, boolean>) {
  return Object.values(loadingPaths).some(Boolean);
}

function tagProvider(
  threads: AgentThreadSummary[],
  provider: NativeAgentProvider,
) {
  return threads.flatMap((thread) => {
    if (thread === null || typeof thread !== "object") return [];
    const known = taggedThreads.get(thread);
    if (
      known &&
      known.additions === thread.additions &&
      known.deletions === thread.deletions
    ) {
      return [known];
    }
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
  const { i18n } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const setProvider = useAgentProviderStore((state) => state.setProvider);
  const setSelectedPath = useAgentRepoStore((state) => state.setPath);
  const codexByPath = useProviderChatStore("codex", (state) => state.threadsByPath);
  const claudeByPath = useProviderChatStore("claude", (state) => state.threadsByPath);
  const cursorByPath = useProviderChatStore("cursor", (state) => state.threadsByPath);
  const openCodeByPath = useProviderChatStore("opencode", (state) => state.threadsByPath);
  const codexLoadingPaths = useProviderChatStore("codex", (state) => state.loadingPaths);
  const claudeLoadingPaths = useProviderChatStore("claude", (state) => state.loadingPaths);
  const cursorLoadingPaths = useProviderChatStore("cursor", (state) => state.loadingPaths);
  const openCodeLoadingPaths = useProviderChatStore("opencode", (state) => state.loadingPaths);
  const codexThreads = useMemo(() => flattenCatalog(codexByPath), [codexByPath]);
  const claudeThreads = useMemo(() => flattenCatalog(claudeByPath), [claudeByPath]);
  const cursorThreads = useMemo(() => flattenCatalog(cursorByPath), [cursorByPath]);
  const openCodeThreads = useMemo(() => flattenCatalog(openCodeByPath), [openCodeByPath]);
  const loading =
    anyLoading(codexLoadingPaths) ||
    anyLoading(claudeLoadingPaths) ||
    anyLoading(cursorLoadingPaths) ||
    anyLoading(openCodeLoadingPaths);
  const activeThreadByPath = useAgentChatStore(
    (state) => state.activeThreadByPath,
  );
  const createThread = useAgentChatStore((state) => state.createThread);
  const installed = useInstalledAgents((state) => state.installed);

  useEffect(() => {
    detectInstalledAgents();
  }, []);

  const visibleProviders = useMemo(() => {
    if (!installed) return AGENT_PROVIDERS;
    const filtered = AGENT_PROVIDERS.filter((entry) =>
      installed.has(entry.value),
    );
    return filtered.length > 0 ? filtered : AGENT_PROVIDERS;
  }, [installed]);

  useEffect(() => {
    if (
      visibleProviders.length > 0 &&
      !visibleProviders.some((entry) => entry.value === provider)
    ) {
      setProvider(visibleProviders[0].value);
    }
  }, [provider, setProvider, visibleProviders]);

  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
  const paginationKey = `${normalizedQuery}\u0000${showArchived}`;
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
    async (
      threadProvider: NativeAgentProvider,
      threadId: string,
      threadPath: string,
    ) => {
      setSelectedPath(threadPath);
      setProvider(threadProvider);
      try {
        await chatStoreFor(threadProvider)
          .getState()
          .openThread(threadPath, threadId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [setProvider, setSelectedPath],
  );

  const handleOpenThread = useCallback(
    (
      threadProvider: NativeAgentProvider,
      threadId: string,
      threadPath: string,
    ) => void openThread(threadProvider, threadId, threadPath),
    [openThread],
  );

  const handleSetPinned = useCallback(
    (
      threadProvider: NativeAgentProvider,
      threadId: string,
      pinned: boolean,
      threadPath: string,
    ) =>
      chatStoreFor(threadProvider)
        .getState()
        .setThreadPinned(threadPath, threadId, pinned),
    [],
  );

  const handleArchive = useCallback(
    (
      threadProvider: NativeAgentProvider,
      threadId: string,
      archived: boolean,
      threadPath: string,
    ) =>
      archived
        ? chatStoreFor(threadProvider)
            .getState()
            .archiveThread(threadPath, threadId)
        : chatStoreFor(threadProvider)
            .getState()
            .unarchiveThread(threadPath, threadId),
    [],
  );

  return (
    <aside className="ag-rail flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="ag-line min-w-0 overflow-hidden border-b py-2.5">
        <AgentSidebarActions
          query={query}
          onQueryChange={setQuery}
          onNewThread={() => void newThread()}
          onOpenOverview={onOpenOverview}
          showArchived={showArchived}
          archivedCount={archivedCount}
          onToggleArchived={() => setShowArchived((value) => !value)}
        />
      </div>

      <div
        ref={scrollRef}
        className="ag-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div className="pt-1">
          <AgentThreadList
            path={selectedPath}
            threads={visibleThreads}
            activeProvider={provider}
            activeThreadId={activeThreadByPath[selectedPath] ?? null}
            loading={selectedThreads.length === 0 && loading}
            hasQuery={Boolean(normalizedQuery)}
            limit={threadLimit}
            renamingThreadKey={renamingThreadKey}
            locale={i18n.language}
            showArchived={showArchived}
            scrollRef={scrollRef}
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
