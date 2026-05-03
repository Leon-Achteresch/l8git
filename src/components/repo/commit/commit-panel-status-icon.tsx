import { FileCode2, FileDiff, FileMinus, FilePlus } from "lucide-react";
import type { StatusEntry } from "@/lib/repo-store";
import type { ChangeSector } from "./commit-panel-types";

export function StatusIcon({
  entry,
  sector,
}: {
  entry: StatusEntry;
  sector: ChangeSector;
}) {
  if (sector === "unstaged" && entry.untracked) {
    return <FilePlus className="h-4 w-4 text-emerald-500" />;
  }
  const code = sector === "staged" ? entry.index_status : entry.worktree_status;
  switch (code.trim()) {
    case "M":
      return <FileDiff className="h-4 w-4 text-amber-500" />;
    case "A":
      return <FilePlus className="h-4 w-4 text-emerald-500" />;
    case "D":
      return <FileMinus className="h-4 w-4 text-destructive" />;
    case "R":
    case "C":
      return <FileCode2 className="h-4 w-4 text-sky-500" />;
    case "U":
      return <FileDiff className="h-4 w-4 text-destructive" />;
    default:
      return <FileCode2 className="h-4 w-4 text-muted-foreground" />;
  }
}
