import { AlertTriangle, FileCode2, FileDiff, FileMinus, FilePlus, FolderGit2 } from "lucide-react";
import type { StatusEntry } from "@/lib/repo-store";
import type { ChangeSector } from "./commit-panel-types";

export function StatusIcon({
  entry,
  sector,
}: {
  entry: StatusEntry;
  sector: ChangeSector;
}) {
  if (entry.embedded_repo) {
    return <FolderGit2 className="h-4 w-4 text-git-merge" />;
  }
  if (sector === "unstaged" && entry.untracked) {
    return <FilePlus className="h-4 w-4 text-git-added" />;
  }
  const code = sector === "staged" ? entry.index_status : entry.worktree_status;
  switch (code.trim()) {
    case "M":
      return <FileDiff className="h-4 w-4 text-git-modified" />;
    case "A":
      return <FilePlus className="h-4 w-4 text-git-added" />;
    case "D":
      return <FileMinus className="h-4 w-4 text-destructive" />;
    case "R":
    case "C":
      return <FileCode2 className="h-4 w-4 text-git-branch" />;
    case "U":
      return <AlertTriangle className="h-4 w-4 text-git-modified" />;
    default:
      return <FileCode2 className="h-4 w-4 text-muted-foreground" />;
  }
}
