import { Hash } from "lucide-react";

export function CommitHashBadge({ hash }: { hash: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 text-git-hash font-mono text-[11px] font-semibold tracking-wider hover:bg-muted/80 transition-colors">
      <Hash className="h-3 w-3 opacity-70" />
      {hash}
    </div>
  );
}
