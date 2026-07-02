import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useCallback, useEffect, useState } from "react";
import { PullRequestInspectDetail } from "./pull-request-inspect-detail";
import { PullRequestList } from "./pull-request-list";
import { writeLocalStorageDebounced } from "@/lib/utils";

const layoutStorageKey = "l8git.pr-split.layout.v1";
const EMPTY_BRANCHES: Branch[] = [];

export function PullRequestPanel({ path }: { path: string }) {
  const prs = useRepoStore((s) => s.prs[path]);
  const loading = useRepoStore((s) => !!s.prsLoading[path]);
  const loadPRs = useRepoStore((s) => s.loadPRs);
  const currentBranch = useRepoStore((s) => s.repos[path]?.branch ?? "");
  const branches = useRepoStore((s) => s.repos[path]?.branches ?? EMPTY_BRANCHES);
  const prCreateRequest = useUiStore((s) => s.prCreateRequest);
  const clearPrCreateRequest = useUiStore((s) => s.clearPrCreateRequest);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const toggleSelected = useCallback((n: number) => {
    setSelectedNumber((cur) => (cur === n ? null : n));
  }, []);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialHead, setCreateInitialHead] = useState<
    string | undefined
  >(undefined);
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const raw = localStorage.getItem(layoutStorageKey);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    setSelectedNumber(null);
    setCreateOpen(false);
    setCreateInitialHead(undefined);
    if (!prs) {
      void loadPRs(path);
    }
  }, [path, prs, loadPRs]);

  useEffect(() => {
    if (!prCreateRequest) return;
    if (prCreateRequest.path !== path) return;
    setCreateInitialHead(prCreateRequest.head);
    setCreateOpen(true);
    setSelectedNumber(null);
    clearPrCreateRequest();
  }, [prCreateRequest, path, clearPrCreateRequest]);

  const listProps = {
    path,
    prs,
    loading,
    selectedNumber,
    branches,
    currentBranch,
    createOpen,
    createInitialHead,
    onOpenCreate: () => {
      setCreateInitialHead(undefined);
      setCreateOpen(true);
    },
    onCloseCreate: () => {
      setCreateOpen(false);
      setCreateInitialHead(undefined);
    },
    onCreated: (pr: { number: number }) => {
      void loadPRs(path);
      setSelectedNumber(pr.number);
    },
    onReload: () => loadPRs(path),
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden shadow-sm ring-1 ring-border/50">
      {selectedNumber != null ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="pr-split"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="pr-list"
            defaultSize="42%"
            minSize="24%"
            maxSize="70%"
            className="min-h-0 flex flex-col"
          >
            <PullRequestList {...listProps} onSelect={toggleSelected} />
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />
          <ResizablePanel
            id="pr-inspect"
            defaultSize="58%"
            minSize="30%"
            className="flex min-h-0 flex-col"
          >
            <PullRequestInspectDetail
              path={path}
              number={selectedNumber}
              onClose={() => setSelectedNumber(null)}
              onMutated={() => loadPRs(path)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <PullRequestList {...listProps} onSelect={setSelectedNumber} />
      )}
    </div>
  );
}
