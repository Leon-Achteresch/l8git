import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRepoStore, type StashEntry } from "@/lib/repo-store";
import { useCallback, useEffect, useState } from "react";
import { StashBranchDialog } from "./stash-branch-dialog";
import { StashCreateDialog } from "./stash-create-dialog";
import { StashInspectDetail } from "./stash-inspect-detail";
import { StashList } from "./stash-list";
import { writeLocalStorageDebounced } from "@/lib/utils";

const layoutStorageKey = "l8git.stash-split.layout.v1";

const EMPTY_STASHES: StashEntry[] = [];

export function StashPanel({ path }: { path: string }) {
  const stashes = useRepoStore((s) => s.stashes[path] ?? EMPTY_STASHES);
  const loading = useRepoStore((s) => !!s.stashesLoading[path]);
  const reloadStashes = useRepoStore((s) => s.reloadStashes);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const selectedIndex = stashes.find(e => e.hash === selectedHash)?.index ?? null;
  const setSelectedIndex = (value: number | null | ((old: number | null) => number | null)) => {
    const index = typeof value === 'function' ? value(selectedIndex) : value;
    setSelectedHash(stashes.find(e => e.index === index)?.hash ?? null);
  };
  const [listEntered, setListEntered] = useState(false);
  const onListEntered = useCallback(() => setListEntered(true), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchEntry, setBranchEntry] = useState<StashEntry | null>(null);
  const setBranchIndex = (index: number | null) => setBranchEntry(stashes.find(e => e.index === index) ?? null);
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
    void reloadStashes(path);
  }, [path, reloadStashes]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [path]);


  return (
    <div className="flex h-full min-h-0 flex-col">
      {selectedIndex != null ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="stash-split"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="stash-list"
            defaultSize="40%"
            minSize="22%"
            maxSize="72%"
            className="min-h-0 flex flex-col"
          >
            <StashList
              path={path}
              stashes={stashes}
              loading={loading}
              selectedIndex={selectedIndex}
              onSelectIndex={(idx: number) =>
                setSelectedIndex((h) => (h === idx ? null : idx))
              }
              onRefresh={() => void reloadStashes(path)}
              onOpenCreate={() => setCreateOpen(true)}
              onOpenBranch={(idx: number) => setBranchIndex(idx)}
              entered={listEntered}
              onEntered={onListEntered}
            />
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />
          <ResizablePanel
            id="stash-inspect"
            defaultSize="60%"
            minSize="28%"
            className="flex min-h-0 flex-col"
          >
            <StashInspectDetail
              path={path}
              stashIndex={selectedIndex}
              expectedHash={selectedHash ?? undefined}
              onClose={() => setSelectedIndex(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <StashList
            path={path}
            stashes={stashes}
            loading={loading}
            selectedIndex={selectedIndex}
            onSelectIndex={(idx: number) =>
              setSelectedIndex((h) => (h === idx ? null : idx))
            }
            onRefresh={() => void reloadStashes(path)}
            onOpenCreate={() => setCreateOpen(true)}
            onOpenBranch={(idx: number) => setBranchIndex(idx)}
            entered={listEntered}
            onEntered={onListEntered}
          />
        </div>
      )}
      <StashCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        path={path}
      />
      <StashBranchDialog
        open={branchEntry != null}
        onClose={() => setBranchIndex(null)}
        path={path}
        stashIndex={branchEntry?.index ?? 0}
        expectedHash={branchEntry?.hash ?? ""}
      />
    </div>
  );
}
