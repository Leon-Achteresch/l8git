import { useLayoutEffect, useState, type RefObject } from "react";

/** Measure the actual allocation, including docked panels, without CSS transform magnification. */
export function useContainerSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { parent = false, enabled = true }: { parent?: boolean; enabled?: boolean } = {},
) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!enabled) return;
    const element = parent ? ref.current?.parentElement : ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, parent, enabled]);
  return size;
}
