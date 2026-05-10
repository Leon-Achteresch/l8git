import { memo } from "react";
import { TapeReveal } from "@/components/motion/tape-reveal";

function CommitHashBadgeInner({ hash }: { hash: string }) {
  return (
    <TapeReveal className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs tracking-tight text-zinc-500 tabular-nums dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
      {hash}
    </TapeReveal>
  );
}

export const CommitHashBadge = memo(CommitHashBadgeInner);
