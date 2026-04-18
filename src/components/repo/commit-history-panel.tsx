import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { Commit } from "@/lib/repo-store";
import { useEffect, useState } from "react";
import { CommitInspectDetail } from "./commit-inspect-detail";
import { CommitList } from "./commit-list";

const layoutStorageKey = "gitit.history-split.layout.v1";

export function CommitHistoryPanel({
  path,
  commits,
}: {
  path: string;
  commits: Commit[];
}) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
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
  }, [path]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/50">
      {selectedHash ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="history-split"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            localStorage.setItem(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="commits"
            defaultSize="52%"
            minSize="24%"
            maxSize="78%"
            className="min-h-0 flex flex-col"
          >
            <CommitList
              path={path}
              commits={commits}
              selectedHash={selectedHash}
              onSelectCommit={(hash) =>
                setSelectedHash((h) => (h === hash ? null : hash))
              }
            />
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
        <div className="flex h-full min-h-0 flex-col">
          <CommitList
            path={path}
            commits={commits}
            selectedHash={selectedHash}
            onSelectCommit={(hash) =>
              setSelectedHash((h) => (h === hash ? null : hash))
            }
          />
        </div>
      )}
    </div>
  );
}
