import { memo, useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentImportThreadDialog } from "@/components/agents/chat/agent-import-thread-dialog";
import { AgentProviderSwitcher } from "@/components/agents/chat/agent-provider-switcher";
import { AgentRepositoryList } from "@/components/agents/chat/agent-repository-list";
import { AgentSidebarActions } from "@/components/agents/chat/agent-sidebar-actions";
import { AgentThreadList } from "@/components/agents/chat/agent-thread-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { useRepoStore } from "@/lib/repo-store";

const INITIAL_THREAD_LIMIT = 60;
const THREAD_PAGE_SIZE = 100;

export const AgentChatSidebar = memo(function AgentChatSidebar({
  paths,
  selectedPath,
  onSelectPath,
  capabilityStudioOpen = false,
  onOpenCapabilities,
}: {
  paths: string[];
  selectedPath: string;
  onSelectPath: (path: string) => void;
  capabilityStudioOpen?: boolean;
  onOpenCapabilities?: () => void;
}) {
  const { i18n } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const setProvider = useAgentProviderStore((state) => state.setProvider);
  const threadsByPath = useAgentChatStore((state) => state.threadsByPath);
  const loadingPaths = useAgentChatStore((state) => state.loadingPaths);
  const activeThreadByPath = useAgentChatStore((state) => state.activeThreadByPath);
  const openThread = useAgentChatStore((state) => state.openThread);
  const createThread = useAgentChatStore((state) => state.createThread);
  const adoptThread = useAgentChatStore((state) => state.adoptThread);
  const archiveThread = useAgentChatStore((state) => state.archiveThread);
  const setThreadPinned = useAgentChatStore((state) => state.setThreadPinned);
  const repos = useRepoStore((state) => state.repos);
  const [query, setQuery] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importId, setImportId] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
  const paginationKey = `${selectedPath}\u0000${normalizedQuery}`;
  const [threadPagination, setThreadPagination] = useState({ key: paginationKey, limit: INITIAL_THREAD_LIMIT });
  const threadLimit = threadPagination.key === paginationKey ? threadPagination.limit : INITIAL_THREAD_LIMIT;
  const selectedThreads = threadsByPath[selectedPath] ?? [];
  const visibleThreads = useMemo(() => {
    if (!normalizedQuery) return selectedThreads;
    return selectedThreads.filter((thread) =>
      thread.title.toLocaleLowerCase().includes(normalizedQuery) ||
      thread.preview.toLocaleLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, selectedThreads]);
  const branchByPath = useMemo(
    () => Object.fromEntries(paths.map((path) => [path, repos[path]?.branch])),
    [paths, repos],
  );

  const newThread = async (path: string) => {
    onSelectPath(path);
    try {
      await createThread(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const importThread = async () => {
    const threadId = importId.trim();
    if (!threadId) return;
    try {
      await adoptThread(selectedPath, threadId);
      setImportOpen(false);
      setImportId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <header className="ag-line flex h-12 shrink-0 items-center border-b px-2">
        <AgentProviderSwitcher provider={provider} onProviderChange={setProvider} />
      </header>

      <div className="ag-line border-b py-2">
        <AgentSidebarActions
          query={query}
          onQueryChange={setQuery}
          capabilityStudioOpen={capabilityStudioOpen}
          onNewThread={() => void newThread(selectedPath)}
          onOpenCapabilities={onOpenCapabilities}
          onOpenImport={() => setImportOpen(true)}
        />
      </div>

      <ScrollArea className="ag-scroll min-h-0 flex-1">
        <div className="pt-3">
          <AgentRepositoryList
            paths={paths}
            selectedPath={selectedPath}
            branchByPath={branchByPath}
            onSelectPath={onSelectPath}
            onNewThread={(path) => void newThread(path)}
          />
          <div className="ag-line mx-4 mb-3 border-t" />
          <AgentThreadList
            path={selectedPath}
            threads={visibleThreads}
            activeThreadId={activeThreadByPath[selectedPath] ?? null}
            loading={Boolean(loadingPaths[selectedPath])}
            hasQuery={Boolean(normalizedQuery)}
            limit={threadLimit}
            renamingThreadId={renamingThreadId}
            locale={i18n.language}
            onOpenThread={(threadId) => void openThread(selectedPath, threadId)}
            onCreateThread={() => void newThread(selectedPath)}
            onRenameThread={setRenamingThreadId}
            onSetPinned={(threadId, pinned) => setThreadPinned(selectedPath, threadId, pinned)}
            onArchiveThread={(threadId) => archiveThread(selectedPath, threadId)}
            onShowMore={() => setThreadPagination({ key: paginationKey, limit: threadLimit + THREAD_PAGE_SIZE })}
          />
        </div>
      </ScrollArea>

      <AgentImportThreadDialog
        open={importOpen}
        threadId={importId}
        onOpenChange={setImportOpen}
        onThreadIdChange={setImportId}
        onImport={() => void importThread()}
      />
    </aside>
  );
});
