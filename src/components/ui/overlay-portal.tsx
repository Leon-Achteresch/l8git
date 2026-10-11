import {
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export function useAnchorBox(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
) {
  const [box, setBox] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const node = anchor.current;
    if (!node) return;
    const update = (viewportChanged = false) => {
      const next = node.getBoundingClientRect();
      setBox((previous) =>
        !viewportChanged &&
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next,
      );
    };
    // Overlay dimensions can depend on the viewport even if its anchor is still.
    const onResize = () => update(true);
    // A nested list scroll only moves an anchor when that list contains it.
    const onScroll = (event: Event) => {
      if (
        event.target === window ||
        event.target === document ||
        (event.target instanceof Node && event.target.contains(node))
      ) {
        update();
      }
    };
    update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchor]);

  return box;
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
