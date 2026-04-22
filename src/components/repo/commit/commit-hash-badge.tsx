import { memo } from "react";
import { TapeReveal } from "@/components/motion/tape-reveal";

function CommitHashBadgeInner({ hash }: { hash: string }) {
  return (
    <TapeReveal className="font-mono text-xs tracking-tight text-git-hash tabular-nums">
      {hash}
    </TapeReveal>
  );
}

export const CommitHashBadge = memo(CommitHashBadgeInner);
