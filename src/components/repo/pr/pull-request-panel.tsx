import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRepoStore } from "@/lib/repo-store";
import { useEffect, useState } from "react";
import { PullRequestInspectDetail } from "./pull-request-inspect-detail";
import { PullRequestList } from "./pull-request-list";
import { writeLocalStorageDebounced } from "@/lib/utils";

const layoutStorageKey = "l8git.pr-split.layout.v1";

export function PullRequestPanel({ path }: { path: string }) {
  const prs = useRepoStore((s) => s.prs[path]);
  const loading = useRepoStore((s) => !!s.prsLoading[path]);
  const loadPRs = useRepoStore((s) => s.loadPRs);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
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
    if (!prs) {
      void loadPRs(path);
    }
  }, [path, prs, loadPRs]);

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
            <PullRequestList
              prs={prs}
              loading={loading}
              selectedNumber={selectedNumber}
              onSelect={(n) =>
                setSelectedNumber((cur) => (cur === n ? null : n))
              }
              onReload={() => loadPRs(path)}
            />
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
        <PullRequestList
          prs={prs}
          loading={loading}
          selectedNumber={selectedNumber}
          onSelect={(n) => setSelectedNumber(n)}
          onReload={() => loadPRs(path)}
        />
      )}
    </div>
  );
}
