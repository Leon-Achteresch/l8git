import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useContainerSize } from "@/hooks/use-container-size";
import { useTranslation } from "react-i18next";
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
    while (j < entries.length && entries[j]!.commit_hash === entry.commit_hash
      && entries[j]!.previous?.commit === entry.previous?.commit
      && entries[j]!.previous?.file === entry.previous?.file) {
      j++;
    }
    groups.push({ entry, startLine: i, lineCount: j - i });
    i = j;
  }
  return groups;
}

function groupAtLine(groups: readonly BlameGroup[], line: number): number {
  let first = 0;
  let last = groups.length;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (groups[middle].startLine <= line) first = middle + 1;
    else last = middle;
  }
  return Math.max(0, first - 1);
}

export function BlameGutter({
  entries,
  gutterRef,
  onGroupClick,
  onRevealLine,
}: {
  entries: BlameEntry[];
  gutterRef: React.RefObject<HTMLDivElement | null>;
  onGroupClick: (entry: BlameEntry, rect: DOMRect) => void;
  onRevealLine: (line: number) => void;
}) {
  const groups = useMemo(() => buildGroups(entries), [entries]);
  const { i18n } = useTranslation();
  const totalHeight = entries.length * LINE_HEIGHT;
  const { height } = useContainerSize(gutterRef);
  const [scrollTop, setScrollTop] = useState(0);
  const pendingFocus = useRef<number | null>(null);
  const from = Math.max(0, groupAtLine(groups, Math.floor(scrollTop / LINE_HEIGHT)) - 2);
  const until = Math.min(groups.length, groupAtLine(groups, Math.ceil((scrollTop + height) / LINE_HEIGHT)) + 3);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null || target < from || target >= until) return;
    pendingFocus.current = null;
    gutterRef.current?.querySelector<HTMLButtonElement>(`[data-blame-group="${target}"]`)?.focus({ preventScroll: true });
  }, [from, until, gutterRef]);

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target: number;
    switch (event.key) {
      case "Home": target = 0; break;
      case "End": target = groups.length - 1; break;
      case "Tab": target = index + (event.shiftKey ? -1 : 1); break;
      case "ArrowDown": target = index + 1; break;
      case "ArrowUp": target = index - 1; break;
      default: return;
    }
    const group = groups[target];
    const element = gutterRef.current;
    if (!group || !element) return;
    event.preventDefault();
    const top = group.startLine * LINE_HEIGHT;
    if (top < element.scrollTop || top + LINE_HEIGHT > element.scrollTop + element.clientHeight) {
      element.scrollTop = top;
      setScrollTop(element.scrollTop);
      onRevealLine(group.startLine + 1);
    }
    const button = element.querySelector<HTMLButtonElement>(`[data-blame-group="${target}"]`);
    if (button) button.focus({ preventScroll: true });
    else pendingFocus.current = target;
  };

  return (
    <div
      ref={gutterRef}
      onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
      className="h-full overflow-hidden select-none"
      style={{ position: "relative" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {groups.slice(from, until).map((group, offset) => {
          const gi = from + offset;
          const color = nameToHsl(group.entry.author);
          const height = group.lineCount * LINE_HEIGHT;
          const top = group.startLine * LINE_HEIGHT;
          const isEven = gi % 2 === 0;

          return (
            <button
              key={`${group.entry.commit_hash}-${group.startLine}`}
              type="button"
              data-blame-group={gi}
              onKeyDown={event => navigate(event, gi)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const offset = e.detail === 0 ? 0 : Math.floor((e.clientY - rect.top) / LINE_HEIGHT);
                const index = group.startLine + Math.max(0, Math.min(offset, group.lineCount - 1));
                const lineRect = new DOMRect(rect.x, rect.y + (index - group.startLine) * LINE_HEIGHT, rect.width, LINE_HEIGHT);
                onGroupClick(entries[index]!, lineRect);
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
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-bold text-white shadow-sm"
                  style={{ background: color }}
                >
                  {initials(group.entry.author)}
                </div>
                <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold text-foreground/80 group-hover:text-foreground">
                  {group.entry.author}
                </span>
                <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground/60">
                  {group.entry.short_hash}
                </span>
                <span className="shrink-0 text-[0.625rem] text-muted-foreground/50">
                  {formatRelative(group.entry.timestamp, i18n.language)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
