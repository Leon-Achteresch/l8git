import { ScrollArea } from "@/components/ui/scroll-area";
import { buildGraph, normalizeGitOid } from "@/lib/graph";
import type { Commit } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useEffect, useMemo, useRef } from "react";
import { CommitRow } from "./commit-row";

export function CommitList({
  path,
  commits,
  selectedHash,
  onSelectCommit,
}: {
  path: string;
  commits: Commit[];
  selectedHash: string | null;
  onSelectCommit: (hash: string) => void;
}) {
  const { rows, maxLanes } = useMemo(() => buildGraph(commits), [commits]);
  const scopeRef = useRef<HTMLDivElement>(null);
  const commitFocusRequest = useUiStore((s) => s.commitFocusRequest);
  const clearCommitFocusRequest = useUiStore((s) => s.clearCommitFocusRequest);

  useEffect(() => {
    const req = commitFocusRequest;
    if (!req || req.path !== path) return;
    const want = normalizeGitOid(req.hash);
    const found = rows.find((r) => normalizeGitOid(r.commit.hash) === want);
    if (!found) {
      clearCommitFocusRequest();
      return;
    }
    let timeoutId = 0;
    const run = () => {
      const el = scopeRef.current?.querySelector<HTMLElement>(
        `[data-commit-hash="${CSS.escape(found.commit.hash)}"]`,
      );
      if (!el) {
        clearCommitFocusRequest();
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
      timeoutId = window.setTimeout(() => clearCommitFocusRequest(), 450);
    };
    let rafInner = 0;
    const rafOuter = window.requestAnimationFrame(() => {
      rafInner = window.requestAnimationFrame(run);
    });
    return () => {
      window.cancelAnimationFrame(rafOuter);
      window.cancelAnimationFrame(rafInner);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [path, rows, commitFocusRequest, clearCommitFocusRequest]);

  return (
    <div ref={scopeRef} className="h-full min-h-0">
      <ScrollArea className="h-full min-h-0">
        <ul>
          {rows.map((row) => (
            <li
              key={row.commit.hash}
              data-commit-hash={row.commit.hash}
              tabIndex={-1}
              className="outline-none focus:outline-none"
            >
              <CommitRow
                path={path}
                row={row}
                maxLanes={maxLanes}
                selected={
                  !!selectedHash &&
                  normalizeGitOid(selectedHash) ===
                    normalizeGitOid(row.commit.hash)
                }
                onSelect={() => onSelectCommit(row.commit.hash)}
              />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
