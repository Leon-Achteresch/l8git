import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import { normalizeGitOid } from "@/lib/graph";
import type { Commit } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CherryPickStatusBanner } from "./cherry-pick-status-banner";
import { CommitInspectDetail } from "./commit-inspect-detail";
import { CommitList } from "./commit-list";

const layoutStorageKey = "l8git.history-split.layout.v1";
const EMPTY_HASH_SET: ReadonlySet<string> = new Set();

export type CommitSelectMode = "single" | "toggle" | "range";

export function CommitHistoryPanel({
  path,
  commits,
}: {
  path: string;
  commits: Commit[];
}) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [selectedHashes, setSelectedHashes] = useState<ReadonlySet<string>>(
    EMPTY_HASH_SET,
  );
  const [anchorHash, setAnchorHash] = useState<string | null>(null);
  const searchSlice = useRepoStore((s) => s.commitSearchByPath[path]);
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
    setSelectedHash(null);
    setSelectedHashes((prev) => (prev.size === 0 ? prev : EMPTY_HASH_SET));
    setAnchorHash(null);
  }, [path]);

  const isSearch = !!searchSlice?.query?.trim();
  const matchPathsByHash = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of searchSlice?.hits ?? []) {
      m.set(normalizeGitOid(h.commit.hash), h.matched_paths);
    }
    return m;
  }, [searchSlice?.hits]);

  const onToggleSelect = useCallback(
    (hash: string, mode: CommitSelectMode) => {
      if (mode === "single") {
        setSelectedHash((h) => (h === hash ? null : hash));
        setSelectedHashes(new Set([hash]));
        setAnchorHash(hash);
        return;
      }
      if (mode === "toggle") {
        setSelectedHashes((prev) => {
          const next = new Set(prev);
          if (next.has(hash)) next.delete(hash);
          else next.add(hash);
          return next;
        });
        setAnchorHash(hash);
        return;
      }
      // range
      setSelectedHashes((prev) => {
        const anchor = anchorHash ?? hash;
        const hashes = commits.map((c) => c.hash);
        const a = hashes.indexOf(anchor);
        const b = hashes.indexOf(hash);
        if (a < 0 || b < 0) {
          const next = new Set(prev);
          next.add(hash);
          return next;
        }
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(hashes[i]);
        return next;
      });
    },
    [anchorHash, commits],
  );

  const onCherryPick = useCallback(
    async (hashes: string[], opts?: { mainline?: number }) => {
      if (hashes.length === 0) return;
      // Sort oldest-first based on display order (listCommits is newest-first).
      const order = new Map(commits.map((c, i) => [c.hash, i] as const));
      const ordered = [...hashes].sort(
        (a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0),
      );
      try {
        const out = await useRepoStore
          .getState()
          .cherryPick(path, ordered, opts);
        toast.success(
          out.trim() ||
            (ordered.length === 1
              ? "Commit cherry-gepickt."
              : `${ordered.length} Commits cherry-gepickt.`),
        );
        setSelectedHashes(EMPTY_HASH_SET);
      } catch (err) {
        const state = useRepoStore.getState().cherryPickState[path];
        if (!state?.in_progress) {
          toastError(String(err));
        }
      }
    },
    [commits, path],
  );

  const list = (
    <CommitList
      path={path}
      commits={commits}
      matchPathsByHash={matchPathsByHash}
      searchActive={isSearch}
      searchHitsExhausted={searchSlice?.exhausted ?? true}
      searchEpoch={searchSlice?.epoch ?? 0}
      selectedHash={selectedHash}
      selectedHashes={selectedHashes}
      onToggleSelect={onToggleSelect}
      onCherryPick={onCherryPick}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden shadow-sm ring-1 ring-border/50">
      <CherryPickStatusBanner path={path} />
      {selectedHash ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="history-split"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="commits"
            defaultSize="52%"
            minSize="24%"
            maxSize="78%"
            className="min-h-0 flex flex-col"
          >
            {list}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />
          <ResizablePanel
            id="inspect"
            defaultSize="48%"
            minSize="22%"
            className="flex min-h-0 flex-col"
          >
            <CommitInspectDetail
              path={path}
              commitHash={selectedHash}
              onClose={() => setSelectedHash(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{list}</div>
      )}
    </div>
  );
}
