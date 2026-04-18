import { TapeReveal } from "@/components/motion/tape-reveal";

export function CommitHashBadge({ hash }: { hash: string }) {
  return (
    <TapeReveal className="font-mono text-xs tracking-tight text-git-hash tabular-nums">
      {hash}
    </TapeReveal>
  );
}
