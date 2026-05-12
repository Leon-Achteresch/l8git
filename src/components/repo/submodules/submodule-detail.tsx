import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useRepoStore,
  type SubmoduleCommit,
  type SubmoduleEntry,
} from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { Download, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SubmoduleStatusBadge } from "./submodule-status-badge";

function CommitDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-3 w-3 shrink-0 items-center justify-center rounded-full border",
        active
          ? "border-primary bg-primary"
          : "border-muted-foreground/40 bg-muted",
      )}
    />
  );
}

export function SubmoduleDetail({
  repoPath,
  entry,
  onPull,
}: {
  repoPath: string;
  entry: SubmoduleEntry;
  onPull: () => void;
}) {
  const getSubmoduleCommits = useRepoStore((s) => s.getSubmoduleCommits);
  const [commits, setCommits] = useState<SubmoduleCommit[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);

  useEffect(() => {
    setCommits([]);
    setLoadingCommits(true);
    getSubmoduleCommits(repoPath, entry.path, entry.commit)
      .then(setCommits)
      .catch(() => setCommits([]))
      .finally(() => setLoadingCommits(false));
  }, [repoPath, entry.path, entry.commit, getSubmoduleCommits]);

  const shortPinned = entry.commit ? entry.commit.slice(0, 7) : "—";
  const shortRemote = entry.remote_commit ?? "—";
  const displayUrl = entry.url
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/:/, "/");

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{entry.name}</h3>
              <SubmoduleStatusBadge entry={entry} />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {entry.path} · {displayUrl}
            </p>
          </div>
        </div>

        {/* Pinned vs Remote comparison */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            {/* Pinned */}
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pinned im Super-Repo
              </p>
              <p className="font-mono text-sm font-semibold">{shortPinned}</p>
              {entry.branch && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {entry.branch}
                </span>
              )}
            </div>

            {/* = */}
            <span className="text-lg font-light text-muted-foreground">=</span>

            {/* Remote */}
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Remote Head
              </p>
              <p className="font-mono text-sm font-semibold">{shortRemote}</p>
              {entry.behind_count != null && entry.behind_count > 0 && (
                <span className="text-[10px] text-red-500">
                  ↓{entry.behind_count} commits
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="gap-1 text-[11px]"
                onClick={onPull}
              >
                <Download className="h-3 w-3" />
                Pull
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1 text-[11px]"
                onClick={() =>
                  toast.info(`cd ${entry.path}`, { duration: 4000 })
                }
              >
                <Terminal className="h-3 w-3" />
                Terminal
              </Button>
            </div>
          </div>
        </div>

        {/* .GITMODULES */}
        {entry.gitmodules_raw && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              .Gitmodules
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
              {entry.gitmodules_raw}
            </pre>
          </div>
        )}

        {/* Recent commits */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Letzte Commits im Submodul
          </p>
          {loadingCommits ? (
            <div className="py-4 text-center text-[11px] text-muted-foreground">
              Lade Commits …
            </div>
          ) : commits.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-muted-foreground">
              Keine Commits verfügbar
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              {commits.map((c, i) => (
                <div
                  key={c.hash}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2.5",
                    i > 0 && "border-t border-border/40",
                    c.is_pinned && "bg-primary/5",
                  )}
                >
                  <CommitDot active={c.is_pinned} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {c.short_hash}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {c.message}
                      </span>
                      {c.is_pinned && (
                        <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                          pinned
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground/60">
                      <span>{c.author}</span>
                      <span>{c.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
