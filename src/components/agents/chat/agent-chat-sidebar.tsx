import { LayoutGrid } from "lucide-react";
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

import { AgentRepoPicker } from "@/components/agents/chat/agent-repo-picker";
import { AgentSidebarActions } from "@/components/agents/chat/agent-sidebar-actions";
import { AgentThreadList } from "@/components/agents/chat/agent-thread-list";
import { isWorking } from "@/components/agents/chat/agent-thread-row";
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
import {
  detectInstalledAgents,
  useInstalledAgents,
} from "@/lib/agent-integrations";
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
  const paginationKey = `${selectedPath}\u0000${normalizedQuery}\u0000${showArchived}`;
  const [threadPagination, setThreadPagination] = useState({
    key: paginationKey,
    limit: INITIAL_THREAD_LIMIT,
  });
  const threadLimit =
    threadPagination.key === paginationKey
      ? threadPagination.limit
      : INITIAL_THREAD_LIMIT;

  const workingCountByProvider = useMemo(() => {
    const countWorking = (threads: AgentThreadSummary[]) =>
      threads.filter((item) => isWorking(item.status)).length;
    return {
      codex: countWorking(codexThreads),
      claude: countWorking(claudeThreads),
      cursor: countWorking(cursorThreads),
      opencode: countWorking(openCodeThreads),
    };
  }, [codexThreads, claudeThreads, cursorThreads, openCodeThreads]);

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
      <header className="ag-line flex h-13 min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden border-b px-3">
        <AgentRepoPicker selectedPath={selectedPath} />
        {onOpenOverview ? (
          <button
            type="button"
            onClick={onOpenOverview}
            className="ag-icon-btn size-7 shrink-0 rounded-[var(--ag-r-sm)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)] hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-surface)]"
            aria-label={t("agentOverview.title")}
            title={t("agentOverview.title")}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        ) : null}
      </header>

      <div className="ag-line flex min-w-0 shrink-0 justify-center overflow-hidden border-b p-2">
        <Segmented
          value={provider}
          onValueChange={handleProviderChange}
          aria-label={t("agentChat.settings.agent")}
          className="w-full min-w-0"
        >
          {visibleProviders.map(({ value, label, Logo }) => {
            const workingCount = workingCountByProvider[value] ?? 0;
            return (
              <Segment
                key={value}
                value={value}
                title={label}
                aria-label={label}
                className="relative min-w-0 px-2 py-1.5"
              >
                <Logo className="size-3.5 shrink-0" />
                {value === provider ? (
                  <span className="min-w-0 truncate font-medium">{label}</span>
                ) : null}
                {workingCount > 0 ? (
                  <span className="ml-0.5 flex size-1.5 shrink-0 rounded-full bg-[var(--git-modified)] ring-2 ring-[var(--ag-surface)]" />
                ) : null}
              </Segment>
            );
          })}
        </Segmented>
      </div>

      <div className="ag-line min-w-0 overflow-hidden border-b py-2.5">
        <AgentSidebarActions
          query={query}
          onQueryChange={setQuery}
          onNewThread={() => void newThread()}
        />
      </div>

      <div
        ref={scrollRef}
        className="ag-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div className="pt-2">
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
