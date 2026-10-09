import { memo } from "react";

function CommitHashBadgeInner({ hash }: { hash: string }) {
  // Virtual rows remount as they scroll into view; their text is already visible.
  // Replaying a Motion reveal here repeatedly measures the scrolling ancestors.
  return (
    <span className="inline-block rounded border border-zinc-200 bg-zinc-50 px-1 py-px font-mono text-[0.6875rem] tracking-tight text-zinc-500 tabular-nums dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
      {hash}
    </span>
  );
}

export const CommitHashBadge = memo(CommitHashBadgeInner);
