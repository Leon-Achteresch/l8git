import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRepoStore, type WorktreeEntry } from "@/lib/repo-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { useEffect, useState } from "react";
import { WorktreeAddDialog } from "./worktree-add-dialog";
import { WorktreeDetail } from "./worktree-detail";
import { WorktreeList } from "./worktree-list";
import { WorktreeLockDialog } from "./worktree-lock-dialog";
import { WorktreeMoveDialog } from "./worktree-move-dialog";

const layoutStorageKey = "l8git.worktree-split.layout.v1";

export function WorktreePanel({ path }: { path: string }) {
  const reloadWorktrees = useRepoStore((s) => s.reloadWorktrees);
  const worktrees = useRepoStore((s) => s.worktrees[path]);
  const branches = useRepoStore((s) => s.repos[path]?.branches ?? []);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moveEntry, setMoveEntry] = useState<WorktreeEntry | null>(null);
  const [lockEntry, setLockEntry] = useState<WorktreeEntry | null>(null);

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
    void reloadWorktrees(path);
  }, [path, reloadWorktrees]);

  useEffect(() => {
    setSelectedPath(null);
  }, [path]);

  useEffect(() => {
    if (!worktrees || worktrees.length === 0) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath((prev) => {
      if (prev == null) return null;
      return worktrees.some((e) => e.path === prev) ? prev : null;
    });
  }, [worktrees]);

  const selectedEntry = worktrees?.find((e) => e.path === selectedPath) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selectedEntry ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="worktree-split"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(
              layoutStorageKey,
              JSON.stringify(layout),
            )
          }
        >
          <ResizablePanel
            id="worktree-list"
            defaultSize="45%"
            minSize="24%"
            maxSize="70%"
            className="flex min-h-0 flex-col"
          >
            <WorktreeList
              path={path}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
              onOpenAdd={() => setAddOpen(true)}
              onPrune={() => setSelectedPath(null)}
              onRequestMove={(e) => setMoveEntry(e)}
              onRequestLock={(e) => setLockEntry(e)}
            />
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />
          <ResizablePanel
            id="worktree-detail"
            defaultSize="55%"
            minSize="28%"
            className="flex min-h-0 flex-col"
          >
            <WorktreeDetail
              path={path}
              entry={selectedEntry}
              onClose={() => setSelectedPath(null)}
              onRequestMove={() => setMoveEntry(selectedEntry)}
              onRequestLock={() => setLockEntry(selectedEntry)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <WorktreeList
            path={path}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            onOpenAdd={() => setAddOpen(true)}
            onPrune={() => {}}
            onRequestMove={(e) => setMoveEntry(e)}
            onRequestLock={(e) => setLockEntry(e)}
          />
        </div>
      )}

      <WorktreeAddDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        path={path}
        branches={branches}
      />
      <WorktreeMoveDialog
        open={moveEntry != null}
        onClose={() => setMoveEntry(null)}
        path={path}
        entry={moveEntry}
      />
      <WorktreeLockDialog
        open={lockEntry != null}
        onClose={() => setLockEntry(null)}
        path={path}
        entry={lockEntry}
      />
    </div>
  );
}
