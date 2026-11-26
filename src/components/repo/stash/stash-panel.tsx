import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRepoStore, type StashEntry } from "@/lib/repo-store";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{ entry: StashEntry; olderMatches: number } | null>(null);
  const selected = useMemo(() => {
    if (!selection) return null;
    let skip = selection.olderMatches;
    for (let i = stashes.length - 1; i >= 0; i--) {
      const entry = stashes[i];
      if (entry.hash === selection.entry.hash && entry.message === selection.entry.message && skip-- === 0) return entry;
    }
    return null;
  }, [stashes, selection]);
  function select(entry: StashEntry) {
    if (selected === entry) { setSelection(null); return; }
    let olderMatches = 0;
    for (const other of stashes) {
      if (other.index > entry.index && other.hash === entry.hash && other.message === entry.message) olderMatches++;
    }
    setSelection({ entry, olderMatches });
  }
  const [listEntered, setListEntered] = useState(false);
  const onListEntered = useCallback(() => setListEntered(true), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchEntry, setBranchEntry] = useState<StashEntry | null>(null);
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

  const list = (
    <StashList path={path} stashes={stashes} loading={loading} selectedIndex={selected?.index ?? null}
      onSelect={select} onOpenBranch={setBranchEntry} query={query} onQueryChange={setQuery}
      onRefresh={() => void reloadStashes(path)} onOpenCreate={() => setCreateOpen(true)}
      entered={listEntered} onEntered={onListEntered} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selected ? (
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
            {list}
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
              key={selected.hash}
              path={path}
              stashIndex={selected.index}
              expectedHash={selected.hash}
              onClose={() => setSelection(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {list}
        </div>
      )}
      <StashCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        path={path}
      />
      <StashBranchDialog
        open={branchEntry != null}
        onClose={() => setBranchEntry(null)}
        path={path}
        stashIndex={branchEntry?.index ?? 0}
        expectedHash={branchEntry?.hash ?? ""}
      />
    </div>
  );
}
