import { memo } from "react";

function CommitHashBadgeInner({ hash }: { hash: string }) {
  // Virtual rows remount as they scroll into view; their text is already visible.
  // Replaying a Motion reveal here repeatedly measures the scrolling ancestors.
  return (
    <span className="inline-block rounded border border-border bg-muted px-1 py-px font-mono text-[0.6875rem] tracking-tight text-muted-foreground tabular-nums">
      {hash}
    </span>
  );
}

export const CommitHashBadge = memo(CommitHashBadgeInner);
