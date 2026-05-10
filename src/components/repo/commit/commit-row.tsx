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
import { splitConventionalSubjectDisplay } from "@/lib/conventional-commit";
import { cn } from "@/lib/utils";
import { GitBranchPlus, Tag, Undo2 } from "lucide-react";
import { motion } from "motion/react";
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
  focusPulseToken,
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
  focusPulseToken?: number;
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

  const subjectParts = useMemo(
    () => splitConventionalSubjectDisplay(commit.subject),
    [commit.subject],
  );

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
    <motion.div
      key={focusPulseToken != null ? `pulse-${focusPulseToken}` : "row"}
      onClick={handleClick}
      initial={false}
          animate={
        focusPulseToken != null
          ? {
              boxShadow: [
                "0 1px 3px rgba(15,23,42,0.08)",
                "0 0 0 2px var(--primary)",
                "0 1px 3px rgba(15,23,42,0.08)",
                "0 0 0 2px var(--primary)",
                "0 1px 3px rgba(15,23,42,0.08)",
              ],
            }
          : selected
            ? {
                boxShadow:
                  "0 1px 3px rgba(15,23,42,0.09), 0 1px 2px rgba(15,23,42,0.05)",
              }
            : { boxShadow: "0 0 0 0px transparent" }
      }
      transition={
        focusPulseToken != null
          ? { duration: 0.85, times: [0, 0.18, 0.36, 0.58, 1], ease: "easeInOut" }
          : { duration: 0.2 }
      }
      className={cn(
        "relative mx-2 my-0.5 flex min-h-[4.5rem] cursor-pointer items-stretch rounded-[10px] outline-none transition-[background-color,box-shadow] duration-150 focus-visible:outline-none",
        "bg-white dark:bg-zinc-950",
        !selected &&
          !multiSelected &&
          "hover:bg-blue-50/35 dark:hover:bg-zinc-900/90",
        searchHit &&
          !selected &&
          !multiSelected &&
          "bg-sky-50/85 dark:bg-sky-950/30",
        selected &&
          "bg-slate-100 dark:bg-blue-950/50 before:pointer-events-none before:absolute before:left-1 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-sm before:bg-blue-700 before:content-[''] dark:before:bg-blue-500",
        multiSelected &&
          !selected &&
          "bg-blue-50/95 dark:bg-blue-950/35 before:pointer-events-none before:absolute before:left-1 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-sm before:bg-blue-400/95 before:content-['']",
      )}
    >
      <div className="flex w-[88px] shrink-0 justify-center self-stretch pl-0.5 pr-1">
        <CommitGraphCell row={row} maxLanes={maxLanes} branches={branches} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5 pl-2 sm:px-[14px] sm:py-2.5 sm:pl-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <CommitConventionalIcons
            subject={commit.subject}
            body={commit.body}
          />
          {branchesAtCommit.map((b, i) => {
            const tail =
              b.name.replace(/^refs\/heads\//, "").split("/").pop() ?? b.name;
            const primary =
              i === 0 &&
              (b.is_current ||
                /^(main|master|develop|development)$/i.test(tail));
            const tone = primary
              ? "dark"
              : i % 2 === 0
                ? "blue"
                : "rose";
            return (
              <CommitBranchBadge
                key={b.name}
                name={b.name}
                accentColor={laneColor(b.name)}
                tone={tone}
              />
            );
          })}
          <span
            className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100"
            title={commit.subject}
          >
            {subjectParts ? (
              <>
                <span className="font-semibold">{subjectParts.lead}</span>
                {subjectParts.body ? (
                  <span className="font-normal"> {subjectParts.body}</span>
                ) : null}
              </>
            ) : (
              commit.subject
            )}
          </span>
          {<CommitTags tags={commit.tags} />}
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
      <div className="flex shrink-0 items-center pr-3 sm:pr-4">
        <CommitHashBadge hash={commit.short_hash} />
      </div>
    </motion.div>
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
