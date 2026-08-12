import {
  BookOpen,
  Bug,
  ClipboardList,
  FlaskConical,
  Gauge,
  GitBranch,
  GitCommit,
  OctagonAlert,
  Package,
  Paintbrush,
  RefreshCw,
  Sparkles,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { memo } from "react";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { parseConventionalCommit } from "@/lib/conventional-commit";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, LucideIcon> = {
  feat: Sparkles,
  fix: Bug,
  docs: BookOpen,
  style: Paintbrush,
  refactor: RefreshCw,
  perf: Gauge,
  test: FlaskConical,
  build: Package,
  ci: GitBranch,
  chore: ClipboardList,
  revert: Undo2,
};

const TYPE_LABELS: Record<string, string> = {
  feat: "Feature",
  fix: "Fix",
  docs: "Dokumentation",
  style: "Formatierung / Stil",
  refactor: "Refactor",
  perf: "Performance",
  test: "Tests",
  build: "Build",
  ci: "CI",
  chore: "Chore",
  revert: "Revert",
};

const CELL_DEFAULT =
  "border-border bg-muted text-muted-foreground";

const TYPE_CELL: Record<string, string> = {
  feat: "border-git-merge/30 bg-git-merge/15 text-git-merge",
  fix: "border-git-removed/30 bg-git-removed/15 text-git-removed",
  docs: "border-git-branch/30 bg-git-branch/15 text-git-branch",
  style:
    "border-git-merge/30 bg-git-merge/15 text-git-merge",
  refactor: "border-git-branch/30 bg-git-branch/15 text-git-branch",
  perf: "border-git-modified/30 bg-git-modified/15 text-git-modified",
  test: "border-git-added/30 bg-git-added/15 text-git-added",
  build: "border-git-modified/30 bg-git-modified/15 text-git-modified",
  ci: "border-git-branch/30 bg-git-branch/15 text-git-branch",
  chore: "border-border bg-muted text-muted-foreground",
  revert: "border-border bg-secondary text-secondary-foreground",
};

function CommitConventionalIconsInner({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  const enabled = useCommitPrefs((s) => s.showConventionalCommitIcons);
  if (!enabled) {
    return (
      <span
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center self-center rounded border text-zinc-600 dark:text-zinc-300",
          CELL_DEFAULT,
        )}
      >
        <GitCommit className="size-3.5 text-zinc-400" strokeWidth={2} />
      </span>
    );
  }

  const { typeKey, breaking, isRecognizedType } = parseConventionalCommit(
    subject,
    body,
  );
  const TypeIcon = typeKey && isRecognizedType ? TYPE_ICONS[typeKey] : null;

  const inner =
    breaking || TypeIcon ? (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        {breaking && (
          <span
            className={cn(
              "inline-flex rounded-sm p-0.5",
              "bg-destructive/15 dark:bg-destructive/20",
            )}
            title="BREAKING CHANGE"
          >
            <OctagonAlert className="size-3.5" strokeWidth={2.25} />
          </span>
        )}
        {TypeIcon && typeKey && (
          <span
            className={cn("inline-flex rounded-sm p-0.5")}
            title={TYPE_LABELS[typeKey] ?? typeKey}
          >
            <TypeIcon className="size-3.5" strokeWidth={2} />
          </span>
        )}
      </span>
    ) : (
      <GitCommit className="size-3.5 text-zinc-400" strokeWidth={2} />
    );

  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center self-center rounded border text-zinc-600 dark:text-zinc-300",
        CELL_DEFAULT,
        typeKey && isRecognizedType && TYPE_CELL[typeKey],
      )}
    >
      {inner}
    </span>
  );
}

export const CommitConventionalIcons = memo(CommitConventionalIconsInner);
