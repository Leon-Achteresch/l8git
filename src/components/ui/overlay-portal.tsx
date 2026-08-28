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
    const update = () => setBox(node.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor]);

  return box;
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
