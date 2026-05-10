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
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center self-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
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
            className={cn("inline-flex rounded-sm p-0.5 text-destructive")}
            title="BREAKING CHANGE"
          >
            <OctagonAlert className="size-3.5" strokeWidth={2.25} />
          </span>
        )}
        {TypeIcon && typeKey && (
          <span
            className="inline-flex rounded-sm p-0.5 text-zinc-500"
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
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center self-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
      {inner}
    </span>
  );
}

export const CommitConventionalIcons = memo(CommitConventionalIconsInner);
