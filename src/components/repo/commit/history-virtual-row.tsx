import { useCallback, useRef, type ReactNode } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { HistoryRowObserver } from "./history-row-measurement";

/** A physical viewport slot; the virtualizer retains the commit's logical key. */
export function HistoryVirtualRow({
  item,
  hash,
  observer,
  children,
}: {
  item: VirtualItem;
  hash?: string;
  observer: HistoryRowObserver;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLLIElement | null>(null);
  const pointerKeyRef = useRef<VirtualItem["key"] | null>(null);
  const setElement = useCallback(
    (element: HTMLLIElement | null) => {
      const previous = elementRef.current;
      if (previous) {
        observer.unbind(previous);
      }
      elementRef.current = element;
      if (element) observer.bind(element, item.index, item.key);
    },
    [observer, item.index, item.key],
  );

  return (
    <li
      ref={setElement}
      data-index={item.index}
      data-commit-hash={hash}
      tabIndex={-1}
      className="outline-none focus:outline-none"
      onPointerDownCapture={() => {
        pointerKeyRef.current = item.key;
      }}
      onPointerCancelCapture={() => {
        pointerKeyRef.current = null;
      }}
      onClickCapture={(event) => {
        if (event.detail > 0 && pointerKeyRef.current !== item.key) {
          // Scrolling between pointer-down and pointer-up can recycle this DOM
          // node. Never select the new row for a gesture begun on the old one.
          event.preventDefault();
          event.stopPropagation();
        }
        pointerKeyRef.current = null;
      }}
      style={{
        position: "absolute",
        contain: "layout style",
        top: 0,
        left: 0,
        right: 0,
        transform: `translateY(${item.start}px)`,
      }}
    >
      {children}
    </li>
  );
}
