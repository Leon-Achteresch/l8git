import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Pool slots for recycled virtual rows, given the row keys in render order. A row
 * that stays in the window keeps its slot. A row entering after the last staying
 * row takes a slot a leaving row freed, so React updates that DOM node instead of
 * unmounting one row and mounting another; when the whole window changes, nodes
 * update in place without any DOM move. Rows entering before or between staying
 * rows get a new slot: reusing a node there would make React move the staying
 * rows, which re-attaches them (full style and layout) and drops their focus.
 */
export function assignPoolSlots<K>(
  previous: ReadonlyMap<K, number>,
  keys: readonly K[],
): Map<K, number> {
  const kept = new Map<K, number>();
  let lastKept = -1;
  keys.forEach((key, i) => {
    const slot = previous.get(key);
    if (slot !== undefined) {
      kept.set(key, slot);
      lastKept = i;
    }
  });
  // In previous render order, so reused nodes keep their relative DOM order.
  const freed = [...previous].filter(([key]) => !kept.has(key)).map(([, slot]) => slot);
  const taken = new Set(previous.values());
  let nextFreed = 0;
  let fresh = 0;
  const next = new Map<K, number>();
  keys.forEach((key, i) => {
    let slot = kept.get(key);
    if (slot === undefined && i > lastKept && nextFreed < freed.length) slot = freed[nextFreed++];
    if (slot === undefined) {
      while (taken.has(fresh)) fresh++;
      slot = fresh;
      taken.add(slot);
    }
    next.set(key, slot);
  });
  return next;
}

/** Slot per row key for the rows rendered this pass; see assignPoolSlots. */
export function useVirtualPoolSlots<K>(keys: readonly K[]): ReadonlyMap<K, number> {
  // Assigned against the committed slots only: a render React discards must not
  // become the previous state of the next one.
  const committed = useRef<ReadonlyMap<K, number>>(new Map());
  const slots = assignPoolSlots(committed.current, keys);
  useLayoutEffect(() => { committed.current = slots; });
  return slots;
}

/**
 * A pooled node that starts showing another item must not animate from the old
 * item's colours. When its classes change with the item, transitions stay off
 * until two frames later: the first frame callback can run before the browser
 * has styled the change.
 */
export function useSkipTransitionOnRecycle(
  ref: RefObject<HTMLElement | null>,
  item: unknown,
) {
  const shown = useRef<{ item: unknown; look: string } | null>(null);
  const frame = useRef(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const previous = shown.current;
    shown.current = { item, look: element.className };
    if (!previous || previous.item === item || previous.look === element.className) return;
    cancelAnimationFrame(frame.current);
    element.style.transition = "none";
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => { element.style.transition = ""; });
    });
  });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
}
