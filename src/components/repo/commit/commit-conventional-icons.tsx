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
  "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/80";

const TYPE_CELL: Record<string, string> = {
  feat: "border-violet-200 bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50",
  fix: "border-rose-200 bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50",
  docs: "border-sky-200 bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50",
  style:
    "border-fuchsia-200 bg-fuchsia-100 dark:border-fuchsia-800 dark:bg-fuchsia-950/50",
  refactor: "border-cyan-200 bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/50",
  perf: "border-amber-200 bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50",
  test: "border-emerald-200 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50",
  build: "border-orange-200 bg-orange-100 dark:border-orange-800 dark:bg-orange-950/50",
  ci: "border-indigo-200 bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50",
  chore: "border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/80",
  revert: "border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-950/50",
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
