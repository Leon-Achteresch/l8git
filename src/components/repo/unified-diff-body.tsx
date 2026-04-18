import { ScrollArea } from "@/components/ui/scroll-area";
import {
  linesFromUntracked,
  parseUnifiedDiff,
  type DiffLine,
} from "@/lib/unified-diff";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";

function diffLineNode(line: DiffLine, i: number) {
  if (line.kind === "meta" || line.kind === "hunk") {
    return (
      <div
        key={i}
        className="whitespace-pre break-all bg-muted/5 px-4 py-0.5 font-mono text-[11px] text-muted-foreground/70"
      >
        {line.text}
      </div>
    );
  }
  if (line.kind === "ctx") {
    return (
      <div
        key={i}
        className="whitespace-pre break-all px-4 py-0.5 font-mono text-[11px] text-foreground/80 transition-colors hover:bg-muted/10"
      >
        {line.text}
      </div>
    );
  }
  if (line.kind === "add") {
    return (
      <div
        key={i}
        className="whitespace-pre break-all border-l-[3px] border-git-added bg-git-added-subtle/40 px-4 py-0.5 font-mono text-[11px] text-git-added transition-colors hover:bg-git-added-subtle/60"
      >
        {line.text}
      </div>
    );
  }
  return (
    <div
      key={i}
      className="whitespace-pre break-all border-l-[3px] border-git-removed bg-git-removed-subtle/40 px-4 py-0.5 font-mono text-[11px] text-git-removed transition-colors hover:bg-git-removed-subtle/60"
    >
      {line.text}
    </div>
  );
}

export function UnifiedDiffBody({
  loading,
  failed,
  isBinary,
  unifiedText,
  untrackedPlain,
  emptyHint,
  failedHint,
}: {
  loading: boolean;
  failed: boolean;
  isBinary: boolean;
  unifiedText: string | null;
  untrackedPlain: string | null;
  emptyHint: string;
  failedHint: string;
}) {
  const displayedDiffLines = useMemo(() => {
    if (isBinary) return [];
    if (untrackedPlain != null && untrackedPlain.length > 0) {
      return linesFromUntracked(untrackedPlain);
    }
    if (unifiedText?.trim()) {
      return parseUnifiedDiff(unifiedText);
    }
    return [];
  }, [isBinary, unifiedText, untrackedPlain]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {failedHint}
      </div>
    );
  }
  if (isBinary) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Binärdatei
      </div>
    );
  }
  if (displayedDiffLines.length > 0) {
    return (
      <ScrollArea className="h-full">
        <div className="py-2">
          {displayedDiffLines.map((line, i) => diffLineNode(line, i))}
        </div>
      </ScrollArea>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {emptyHint}
    </div>
  );
}
