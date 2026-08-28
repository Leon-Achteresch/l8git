import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { IslandShell } from "@/components/island/island-shell";
import { ISLAND_VIEW, type IslandFlash } from "@/components/island/island-ui";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useIslandSnapshot } from "@/lib/island/client";
import { useIslandFlash } from "@/lib/island/flash";
import {
  rememberIslandWindowPosition,
  setIslandWindowSize,
  snapCurrentWindowToDock,
} from "@/lib/island/window-store";
import {
  isEdgeDock,
  useIslandStore,
  type IslandDock,
} from "@/lib/island-store";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

/** Breathing room around the island so its shadow is not clipped. */
const PAD = 14;
const DRAG_THRESHOLD_PX = 4;

/**
 * Root of the detached island window: a transparent, borderless surface that
 * holds nothing but the island and follows its size.
 */
export function IslandWindowApp() {
  const snapshot = useIslandSnapshot();
  const [view, setView] = useState<string | null>(null);
  const islandRef = useRef<HTMLDivElement | null>(null);
  const flash = useDetachedFlash();
  const { dock, showUsage } = useIslandStore(
    useShallow((s) => ({ dock: s.dock, showUsage: s.showUsage })),
  );
  useTheme();
  useWindowPositionMemory();
  const extra = showUsage ? 236 : 0;
  const extraX = dock === "left" || dock === "right" || dock === "sidebar" ? extra : 0;
  const extraY =
    dock === "top" || dock === "bottom" || extraX === 0 ? extra : 0;
  useWindowAutoSize(islandRef, extraX, extraY, dock);

  useEffect(() => {
    if (view === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const drag = useWindowDrag();

  return (
    <MotionProvider>
      <div
        className={cn(
          "flex min-h-dvh w-full bg-transparent",
          dock === "left" || dock === "sidebar"
            ? "items-center justify-start"
            : dock === "right"
              ? "items-center justify-end"
              : dock === "bottom"
                ? "items-end justify-center"
                : "items-start justify-center",
        )}
        style={{
          paddingTop: dock === "bottom" ? PAD + extra : PAD,
          paddingBottom: dock === "top" ? PAD + extra : PAD,
          paddingLeft: dock === "right" ? PAD + extra : PAD,
          paddingRight: dock === "left" || dock === "sidebar" ? PAD + extra : PAD,
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setView(ISLAND_VIEW.menu);
        }}
        {...drag}
      >
        <div ref={islandRef} className="w-max">
          <IslandShell
            snapshot={snapshot}
            view={view}
            onViewChange={setView}
            flash={flash}
            standalone
          />
        </div>
      </div>
    </MotionProvider>
  );
}

/** The detached window has no toaster, so it renders its own action results. */
function useDetachedFlash(): IslandFlash | null {
  const current = useIslandFlash((s) => s.current);
  const dismiss = useIslandFlash((s) => s.dismiss);
  if (!current) return null;
  return {
    id: current.id,
    type: current.type,
    title: current.title,
    description: current.description,
    onDismiss: () => dismiss(current.id),
  };
}

/**
 * Moves the OS window when a pointer drag starts anywhere that is not a text
 * field. Buttons still receive plain clicks because dragging only kicks in past
 * a movement threshold.
 */
function useWindowDrag() {
  const origin = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [data-no-drag]")) return;
      origin.current = { x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = origin.current;
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) {
        return;
      }
      origin.current = null;
      void getCurrentWindow().startDragging();
    },
    onPointerUp: () => {
      origin.current = null;
    },
    onPointerCancel: () => {
      origin.current = null;
    },
  };
}

/** Keeps the window exactly as large as the island, which animates its size. */
function useWindowAutoSize(
  ref: React.RefObject<HTMLDivElement | null>,
  extraX: number,
  extraY: number,
  dock: IslandDock,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let last = "";

    const apply = () => {
      frame = 0;
      const width = Math.ceil(el.offsetWidth) + PAD * 2 + extraX;
      const height = Math.ceil(el.offsetHeight) + PAD * 2 + extraY;
      const key = `${width}x${height}`;
      if (key === last) return;
      last = key;
      void setIslandWindowSize(width, height).then(() => snapCurrentWindowToDock(dock));
    };

    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    });
    observer.observe(el);
    apply();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, extraX, extraY, dock]);
}

const POSITION_SETTLE_MS = 150;

/**
 * Remembers where the user parked the island between sessions.
 *
 * `onMoved` fires for every step of a drag. Resolving the scale factor per
 * event would let two writes land out of order, so it is cached and refreshed
 * only when the window actually changes density — moving across displays.
 */
function useWindowPositionMemory() {
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisteners: (() => void)[] = [];
    let disposed = false;
    let scale = 1;
    let settle = 0;

    const listen = (pending: Promise<() => void>) => {
      void pending.then((fn) => {
        if (disposed) fn();
        else unlisteners.push(fn);
      });
    };

    void win.scaleFactor().then((value) => {
      scale = value;
    });

    listen(
      win.onMoved(({ payload }) => {
        window.clearTimeout(settle);
        settle = window.setTimeout(() => {
          void snapDetachedIsland(scale, payload);
        }, POSITION_SETTLE_MS);
      }),
    );
    listen(
      win.onScaleChanged(({ payload }) => {
        scale = payload.scaleFactor;
      }),
    );

    return () => {
      disposed = true;
      window.clearTimeout(settle);
      for (const off of unlisteners) off();
    };
  }, []);
}

const SNAP_REACH = 96;

async function snapDetachedIsland(
  scale: number,
  payload: { x: number; y: number },
): Promise<void> {
  const win = getCurrentWindow();
  const logical = { x: payload.x / scale, y: payload.y / scale };
  const size = await win.outerSize().catch(() => null);
  const mon = await currentMonitor().catch(() => null);
  if (!size || !mon) {
    rememberIslandWindowPosition(logical);
    return;
  }
  const wx = mon.workArea.position.x / scale;
  const wy = mon.workArea.position.y / scale;
  const ww = mon.workArea.size.width / scale;
  const wh = mon.workArea.size.height / scale;
  const iw = size.width / scale;
  const ih = size.height / scale;
  let dock: IslandDock = "free";
  if (logical.x - wx < SNAP_REACH) dock = "left";
  else if (wx + ww - (logical.x + iw) < SNAP_REACH) dock = "right";
  else if (logical.y - wy < SNAP_REACH) dock = "top";
  else if (wy + wh - (logical.y + ih) < SNAP_REACH) dock = "bottom";
  const current = useIslandStore.getState().dock;
  if (dock !== "free") {
    useIslandStore.getState().setDock(dock);
    await snapCurrentWindowToDock(dock);
    return;
  }
  if (isEdgeDock(current)) useIslandStore.getState().setDock("free");
  rememberIslandWindowPosition(logical);
}
