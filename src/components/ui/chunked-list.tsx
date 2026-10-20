import { Children, isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";

type Key = string | number;

const CHUNK_ROWS = 25;
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
 * A `ul` whose rows are grouped into chunks with `content-visibility: auto`, so
 * the browser skips style, paint and hit testing for chunks off screen. Long
 * non-virtualized lists (thousands of branches) otherwise cost every scroll frame.
 * `rowRem` is a row's height plus its gap; it only sizes chunks never rendered yet.
 */
export function ChunkedList({
  className,
  rowsClassName,
  gap,
  rowRem,
  children,
}: {
  className: string;
  /** Row spacing inside a chunk (e.g. `space-y-0.5`). */
  rowsClassName: string;
  /** The same spacing as a CSS length, used between chunks. */
  gap: string;
  rowRem: number;
  children: ReactNode;
}) {
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
  // A flex column keeps the chunks' negative bleed margins from collapsing into each other.
  return (
    <ul className={`${className} flex flex-col`}>
      {chunks.map((chunk, i) => (
        // Presentational wrappers: the rows stay items of the outer list.
        <li
          key={chunk.id}
          role="none"
          style={{
            contentVisibility: "auto",
            containIntrinsicHeight: `auto ${chunk.keys.length * rowRem}rem`,
            padding: BLEED,
            marginInline: `-${BLEED}`,
            marginTop: i === 0 ? `-${BLEED}` : `calc(${gap} - ${BLEED})`,
            marginBottom: `-${BLEED}`,
            // The bleed must not take clicks from the neighbouring chunk's rows.
            pointerEvents: "none",
          }}
        >
          <ul role="none" className={rowsClassName} style={{ pointerEvents: "auto" }}>
            {chunk.keys.map((key) => byKey.get(key))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
