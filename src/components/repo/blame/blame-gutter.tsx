import { useMemo } from "react";
import type { BlameEntry } from "./git-blame-sheet";
import { formatRelative, initials, LINE_HEIGHT, nameToHsl } from "./git-blame-utils";

type BlameGroup = {
  entry: BlameEntry;
  startLine: number;
  lineCount: number;
};

function buildGroups(entries: BlameEntry[]): BlameGroup[] {
  const groups: BlameGroup[] = [];
  let i = 0;
  while (i < entries.length) {
    const entry = entries[i]!;
    let j = i + 1;
    while (j < entries.length && entries[j]!.commit_hash === entry.commit_hash) {
      j++;
    }
    groups.push({ entry, startLine: i, lineCount: j - i });
    i = j;
  }
  return groups;
}

export function BlameGutter({
  entries,
  gutterRef,
  onGroupClick,
}: {
  entries: BlameEntry[];
  gutterRef: React.RefObject<HTMLDivElement | null>;
  onGroupClick: (entry: BlameEntry, rect: DOMRect) => void;
}) {
  const groups = useMemo(() => buildGroups(entries), [entries]);
  const totalHeight = entries.length * LINE_HEIGHT;

  return (
    <div
      ref={gutterRef}
      className="h-full overflow-hidden select-none"
      style={{ position: "relative" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {groups.map((group, gi) => {
          const color = nameToHsl(group.entry.author);
          const height = group.lineCount * LINE_HEIGHT;
          const top = group.startLine * LINE_HEIGHT;
          const isEven = gi % 2 === 0;

          return (
            <button
              key={`${group.entry.commit_hash}-${group.startLine}`}
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onGroupClick(group.entry, rect);
              }}
              style={{ position: "absolute", top, left: 0, right: 0, height }}
              className={`flex items-start gap-0 text-left group transition-colors hover:bg-primary/6 ${
                isEven ? "bg-muted/10" : ""
              }`}
            >
              <div
                className="w-[3px] self-stretch shrink-0"
                style={{ background: color, opacity: 0.75 }}
              />
              <div
                className="flex min-w-0 flex-1 items-center gap-2 px-2"
                style={{ height: LINE_HEIGHT }}
              >
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm"
                  style={{ background: color }}
                >
                  {initials(group.entry.author)}
                </div>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground/80 group-hover:text-foreground">
                  {group.entry.author}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {group.entry.short_hash}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                  {formatRelative(group.entry.timestamp)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
