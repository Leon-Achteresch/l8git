import { useLayoutEffect, useRef, type RefObject } from "react";
import { hasRepoViewState, readRepoScroll, saveRepoViewState, type RepoScrollView } from "./repo-view-state";

/** Scroll events update a small session cache without React renders or disk writes. */
export function useRememberedRepoScroll(
  ref: RefObject<HTMLDivElement | null>,
  path: string,
  view: RepoScrollView,
  context: string,
  count: number,
) {
  const restored = useRef<{ element: HTMLElement; scope: string } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    // Filtered history and file status may still be loading on mount.
    if (!element || count === 0) {
      restored.current = null;
      return;
    }
    const scope = JSON.stringify([path, view, context]);
    const remember = () => saveRepoViewState(path, {
      [view]: { context, offset: element.scrollTop },
    });
    if (restored.current?.element !== element || restored.current.scope !== scope) {
      element.scrollTop = readRepoScroll(path, view, context);
      restored.current = { element, scope };
      remember();
    }
    element.addEventListener("scroll", remember, { passive: true });
    return () => {
      // A switch can unmount the viewport before its final scroll event arrives.
      // An empty reload may already have clamped the viewport to zero.
      if (element.isConnected && hasRepoViewState(path) && element.scrollHeight > element.clientHeight) remember();
      element.removeEventListener("scroll", remember);
    };
  }, [ref, path, view, context, count]);
}
