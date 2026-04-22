import {
  linesFromUntracked,
  parseUnifiedDiff,
  type DiffLine,
} from "@/lib/unified-diff";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useMemo, useRef } from "react";

const lineWrap =
  "box-border block w-max min-w-full whitespace-pre px-4 py-0.5 font-mono text-[11px]";

// Fixed per-line height in px. Each line renders as a single text row with
// py-0.5 + text-[11px] leading-normal ≈ 18px. Using a constant keeps the
// virtualizer O(1) even for 100k-line diffs; wrap-off via whitespace-pre
// ensures every line really is one visual row.
const LINE_HEIGHT_PX = 18;

function diffLineNode(line: DiffLine) {
  if (line.kind === "meta" || line.kind === "hunk") {
    return (
      <div className={`${lineWrap} bg-muted/5 text-muted-foreground/70`}>
        {line.text}
      </div>
    );
  }
  if (line.kind === "ctx") {
    return (
      <div
        className={`${lineWrap} text-foreground/80 transition-colors hover:bg-muted/10`}
      >
        {line.text}
      </div>
    );
  }
  if (line.kind === "add") {
    return (
      <div
        className={`${lineWrap} border-l-[3px] border-git-added bg-git-added-subtle/40 text-git-added transition-colors hover:bg-git-added-subtle/60`}
      >
        {line.text}
      </div>
    );
  }
  return (
    <div
      className={`${lineWrap} border-l-[3px] border-git-removed bg-git-removed-subtle/40 text-git-removed transition-colors hover:bg-git-removed-subtle/60`}
    >
      {line.text}
    </div>
  );
}

function VirtualDiffList({ lines }: { lines: DiffLine[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: 20,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollerRef}
      className="h-full min-h-0 min-w-0 overflow-auto"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
        }}
        className="py-2"
      >
        {items.map((vi) => {
          const line = lines[vi.index];
          if (!line) return null;
          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
                height: LINE_HEIGHT_PX,
              }}
            >
              {diffLineNode(line)}
            </div>
          );
        })}
      </div>
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
    return <VirtualDiffList lines={displayedDiffLines} />;
  }
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {emptyHint}
    </div>
  );
}
