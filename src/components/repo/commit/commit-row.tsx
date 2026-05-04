import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toastError } from "@/lib/error-toast";
import {
  compareBranchesDisplay,
  laneColor,
  normalizeGitOid,
  type GraphRow,
} from "@/lib/graph";
import { useGravatarUrl } from "@/lib/gravatar";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { GitBranchPlus, Tag, Undo2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { toast } from "sonner";
import { CommitAuthorDate } from "./commit-author-date";
import { CommitBranchBadge } from "./commit-branch-badge";
import { CommitConventionalIcons } from "./commit-conventional-icons";
import { CommitGraphCell } from "./commit-graph-cell";
import { CommitHashBadge } from "./commit-hash-badge";
import { CommitTagDialog } from "./commit-tag-dialog";
import { CommitTags } from "./commit-tags";
import type { CommitSelectMode } from "./commit-history-panel";

function CommitRowInner({
  path,
  row,
  maxLanes,
  matchedPaths,
  searchHit,
  selected,
  multiSelected,
  selectedHashes,
  onSelectHash,
  onCherryPick,
}: {
  path: string;
  row: GraphRow;
  maxLanes: number;
  matchedPaths?: string[];
  searchHit: boolean;
  selected: boolean;
  multiSelected: boolean;
  selectedHashes: ReadonlySet<string>;
  onSelectHash: (hash: string, mode: CommitSelectMode) => void;
  onCherryPick: (hashes: string[], opts?: { mainline?: number }) => void;
}) {
  const { commit } = row;
  const gravatarUrl = useGravatarUrl(commit.email);
  const remoteAvatar = commit.author_avatar?.trim() || undefined;
  const avatarUrl = remoteAvatar ?? gravatarUrl;
  const avatarFallbackUrl = remoteAvatar ? (gravatarUrl ?? null) : undefined;
  const revertCommit = useRepoStore((s) => s.revertCommit);
  const branches = useRepoStore((s) => s.repos[path]?.branches ?? []);
  const branchesAtCommit = useMemo(() => {
    const h = normalizeGitOid(commit.hash);
    return branches
      .filter((b) => normalizeGitOid(b.tip) === h)
      .sort(compareBranchesDisplay);
  }, [branches, commit.hash]);
  const [tagOpen, setTagOpen] = useState(false);

  const isMergeCommit = commit.parents.length > 1;
  const isPartOfMulti = multiSelected && selectedHashes.size > 1;
  const cherryPickLabel = isPartOfMulti
    ? `${selectedHashes.size} Commits cherry-picken`
    : "Commit cherry-picken";

  const cherryPickTargets = (): string[] => {
    if (isPartOfMulti) return Array.from(selectedHashes);
    return [commit.hash];
  };

  const handleClick = (e: React.MouseEvent) => {
    const mode: CommitSelectMode =
      e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "single";
    onSelectHash(commit.hash, mode);
  };

  const inner = (
    <div
      onClick={handleClick}
      className={cn(
        "group relative flex min-h-20 cursor-pointer items-stretch border-b border-border/40 outline-none transition-colors focus-visible:outline-none",
        searchHit && !selected && !multiSelected && "bg-primary/[0.08]",
        selected
          ? "bg-accent/40 before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-primary"
          : multiSelected
            ? "bg-accent/40"
            : "hover:bg-muted/30",
      )}
    >
      <div className="flex shrink-0 self-stretch">
        <CommitGraphCell row={row} maxLanes={maxLanes} branches={branches} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CommitConventionalIcons
            subject={commit.subject}
            body={commit.body}
          />
          {branchesAtCommit.map((b) => (
            <CommitBranchBadge
              key={b.name}
              name={b.name}
              accentColor={laneColor(b.name)}
            />
          ))}
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={commit.subject}
          >
            {commit.subject}
          </span>
          <CommitTags tags={commit.tags} />
        </div>
        <CommitAuthorDate
          author={commit.author}
          email={commit.email}
          avatarUrl={avatarUrl}
          avatarFallbackUrl={avatarFallbackUrl}
          date={commit.date}
        />
        {matchedPaths?.length ? (
          <span
            className="truncate text-xs text-muted-foreground"
            title={matchedPaths.join("\n")}
          >
            {matchedPaths.length === 1
              ? matchedPaths[0]
              : `${matchedPaths[0]} · +${matchedPaths.length - 1}`}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center pr-4">
        <CommitHashBadge hash={commit.short_hash} />
      </div>
    </div>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem
            onSelect={() => {
              window.requestAnimationFrame(() => setTagOpen(true));
            }}
            className="gap-2 cursor-pointer"
          >
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Tag hinzufügen</span>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              const targets = cherryPickTargets();
              onCherryPick(
                targets,
                isMergeCommit && targets.length === 1
                  ? { mainline: 1 }
                  : undefined,
              );
            }}
            className="gap-2 cursor-pointer"
          >
            <GitBranchPlus className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{cherryPickLabel}</span>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void (async () => {
                try {
                  const out = await revertCommit(
                    path,
                    commit.hash,
                    isMergeCommit,
                  );
                  toast.success(out.trim() || "Revert-Commit erstellt.");
                } catch (e) {
                  toastError(String(e));
                }
              })();
            }}
            className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Undo2 className="h-4 w-4" />
            <span className="font-medium">Commit revertieren</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <CommitTagDialog
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        path={path}
        commitHash={commit.hash}
        shortHash={commit.short_hash}
      />
    </>
  );
}

export const CommitRow = memo(CommitRowInner);
