import { Children, isValidElement, startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Key = string | number;

const CHUNK_ROWS = 25;
// The first chunk always renders; the rest render once they come within a viewport of the scroller,
// so mounting thousands of rows never blocks a frame.
const FIRST_CHUNKS = 1;
const hasObserver = typeof IntersectionObserver !== "undefined";
// Chunks are paint-contained; this much bleed keeps row focus rings and shadows unclipped.
const BLEED = "4px";

/**
 * Splits rows into chunks. A row keeps the chunk it had before (`previous`), so
 * adding or removing a row never moves its neighbours to another parent, which
 * would remount them and lose their state (open dialogs, focus). Returns the new
 * membership instead of mutating `previous`, so a discarded render changes nothing.
 */
export function assignChunks(
  keys: readonly Key[],
  previous: ReadonlyMap<Key, number>,
  newId: () => number,
): { chunks: { id: number; keys: Key[] }[]; membership: Map<Key, number> } {
  const chunks: { id: number; keys: Key[] }[] = [];
  const used = new Set<number>();
  for (const key of keys) {
    const prev = previous.get(key);
    const last = chunks[chunks.length - 1];
    if (last && (prev === undefined ? last.keys.length < CHUNK_ROWS : prev === last.id)) {
      last.keys.push(key);
      continue;
    }
    const id = prev !== undefined && !used.has(prev) ? prev : newId();
    used.add(id);
    chunks.push({ id, keys: [key] });
  }
  const membership = new Map<Key, number>();
  for (const chunk of chunks) for (const key of chunk.keys) membership.set(key, chunk.id);
  return { chunks, membership };
}

/**
 * The nearest ancestor that actually scrolls. Not the overflow style alone: overflow-x: hidden
 * makes overflow-y compute to auto on boxes that just grow, and a Radix viewport turns scrollable
 * only after its scrollbar mounts, so it is recognized by its attribute.
 */
function scrollRoot(list: HTMLElement): HTMLElement | null {
  for (let el = list.parentElement; el; el = el.parentElement) {
    if (el.hasAttribute("data-radix-scroll-area-viewport")) return el;
    // The chunks' bleed alone can overflow a parent that just grows by a few pixels.
    if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 16) return el;
  }
  return null;
}

/**
 * A `ul` whose rows are grouped into chunks with `content-visibility: auto`, so
 * the browser skips style, paint and hit testing for chunks off screen. Long
 * non-virtualized lists (thousands of branches) otherwise cost every scroll frame.
 * `rowRem` is a row's height plus its gap; it only sizes chunks never rendered yet.
 * Only the first chunks render with the list; later ones render (and stay) once scrolled near
 * or once focus reaches the chunk before them, so Tab still walks every row.
 */
export function ChunkedList({
  className,
  rowsClassName,
  gap,
  rowRem,
  as: List = "ul",
  children,
}: {
  className: string;
  /** Row spacing inside a chunk (e.g. `space-y-0.5`). */
  rowsClassName: string;
  /** The same spacing as a CSS length, used between chunks. */
  gap: string;
  rowRem: number;
  /** `div` for rows that are not list items. */
  as?: "ul" | "div";
  children: ReactNode;
}) {
  const Chunk = List === "ul" ? "li" : "div";
  const membership = useRef<ReadonlyMap<Key, number>>(new Map());
  const nextId = useRef(0);
  // Always chunked, even for a few rows: switching structure at a threshold would remount every row.
  const rows = Children.toArray(children);
  const byKey = new Map(rows.map((row, i) => [isValidElement(row) && row.key != null ? row.key : i, row]));
  // A discarded render only burns ids; membership is committed with the DOM.
  const { chunks, membership: next } = assignChunks([...byKey.keys()], membership.current, () => nextId.current++);
  useLayoutEffect(() => {
    membership.current = next;
  });
  const listRef = useRef<HTMLUListElement & HTMLDivElement>(null);
  const [rendered, setRendered] = useState<ReadonlySet<number>>(() => new Set());
  const reveal = (ids: number[]) =>
    setRendered((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])));
  // Without IntersectionObserver (tests, old engines) every chunk renders.
  const isRendered = (index: number, id: number) => !hasObserver || index < FIRST_CHUNKS || rendered.has(id);
  // Chunks rendered for their position are recorded too, so a row inserted above never turns them
  // back into placeholders.
  useLayoutEffect(() => {
    const ids = chunks.slice(0, FIRST_CHUNKS).map((c) => c.id).filter((id) => !rendered.has(id));
    if (ids.length) reveal(ids);
  });
  const observer = useRef<{ io: IntersectionObserver; root: HTMLElement | null } | null>(null);
  useEffect(() => () => observer.current?.io.disconnect(), []);
  // Watch the chunks still waiting, against the nearest ancestor that scrolls now: a list that
  // mounted short may only get a scrolling ancestor once it grows.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !hasObserver) return;
    const pending = list.querySelectorAll<HTMLElement>(":scope > [data-chunk-pending]");
    if (!pending.length) return;
    const root = scrollRoot(list);
    if (observer.current?.root !== root) {
      observer.current?.io.disconnect();
      const io = new IntersectionObserver(
        (entries) => {
          const ids = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.chunk));
          for (const e of entries) if (e.isIntersecting) io.unobserve(e.target);
          // Interruptible: chunks come into range a viewport early, so rendering them never blocks a scroll frame.
          if (ids.length) startTransition(() => reveal(ids));
        },
        { root, rootMargin: "100% 0px" },
      );
      observer.current = { io, root };
    }
    // observe() ignores elements it already watches.
    for (const el of pending) observer.current!.io.observe(el);
  });
  // A flex column keeps the chunks' negative bleed margins from collapsing into each other.
  return (
    <List ref={listRef} className={`${className} flex flex-col`}>
      {chunks.map((chunk, i) => (
        // Presentational wrappers: the rows stay items of the outer list.
        <Chunk
          key={chunk.id}
          role="none"
          data-chunk={chunk.id}
          data-chunk-pending={isRendered(i, chunk.id) ? undefined : ""}
          // Focus inside a chunk renders the next one, so Tab never runs out of rows.
          onFocus={() => {
            const next = chunks[i + 1];
            if (next && !isRendered(i + 1, next.id)) reveal([next.id]);
          }}
          style={{
            contentVisibility: "auto",
            containIntrinsicHeight: `auto ${chunk.keys.length * rowRem}rem`,
            padding: BLEED,
            marginInline: `-${BLEED}`,
            marginTop: i === 0 ? `-${BLEED}` : `calc(${gap} - ${BLEED})`,
            marginBottom: `-${BLEED}`,
            // The bleed must not take clicks from the neighbouring chunk's rows.
            pointerEvents: "none",
            // A chunk not rendered yet holds its estimated height.
            minHeight: isRendered(i, chunk.id) ? undefined : `calc(${chunk.keys.length * rowRem}rem + 2 * ${BLEED})`,
          }}
        >
          {isRendered(i, chunk.id) && (
            <List role="none" className={rowsClassName} style={{ pointerEvents: "auto" }}>
              {chunk.keys.map((key) => byKey.get(key))}
            </List>
          )}
        </Chunk>
      ))}
    </List>
  );
}
