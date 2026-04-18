export function CommitHashBadge({ hash }: { hash: string }) {
  return (
    <span className="font-mono text-xs tracking-tight text-git-hash tabular-nums">
      {hash}
    </span>
  );
}
