import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/**
 * Distance from the top of a scroll container's content to the start of a
 * virtualized list inside it, for `useVirtualizer`'s `scrollMargin`.
 *
 * Measured from bounding rects rather than `offsetTop`, because `offsetTop` is
 * relative to the nearest *positioned* ancestor: a `relative` wrapper anywhere
 * between the list and the scroller silently zeroes it, and every row then
 * renders a fixed distance out of place.
 *
 * The list is tracked through the returned callback ref rather than a ref
 * object. Both call sites render the list behind a condition — a rail that is
 * still loading, a transcript behind a sign-in card — so the element appears
 * some renders after this hook first runs. A ref object mutates without
 * re-running the effect, which would leave the margin stuck at 0 for exactly
 * those cases.
 */
export function useScrollMargin(scrollRef: RefObject<HTMLElement | null>): {
  scrollMargin: number;
  listRef: (node: HTMLElement | null) => void;
} {
  const [list, setList] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!list || !scroller) return;

    const read = () => {
      const next =
        list.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      // Sub-pixel churn would otherwise re-render on every observer callback,
      // and the re-render can itself nudge layout — this is what keeps the
      // observer from feeding itself.
      setScrollMargin((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };
    read();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    // The chrome above the list — a header, a search field, a pager — lives in
    // the list's parent, so its growth shows up as a parent resize.
    observer.observe(scroller);
    if (list.parentElement) observer.observe(list.parentElement);
    return () => observer.disconnect();
  }, [list, scrollRef]);

  const listRef = useCallback((node: HTMLElement | null) => setList(node), []);

  return { scrollMargin, listRef };
}
