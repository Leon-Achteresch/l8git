import { memo } from "react";
import { TapeReveal } from "@/components/motion/tape-reveal";

function CommitHashBadgeInner({ hash }: { hash: string }) {
  return (
    <TapeReveal className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px font-mono text-[0.6875rem] tracking-tight text-zinc-500 tabular-nums dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
      {hash}
    </TapeReveal>
  );
}

export const CommitHashBadge = memo(CommitHashBadgeInner);
