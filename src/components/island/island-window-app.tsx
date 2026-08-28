import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import { IslandShell } from "@/components/island/island-shell";
import { ISLAND_VIEW, type IslandFlash } from "@/components/island/island-ui";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useIslandSnapshot } from "@/lib/island/client";
import { useIslandFlash } from "@/lib/island/flash";
import {
  rememberIslandWindowPosition,
  setIslandWindowSize,
} from "@/lib/island/window-store";
import { useTheme } from "@/lib/use-theme";

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
  useTheme();
  useWindowPositionMemory();
  useWindowAutoSize(islandRef);

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
        className="flex min-h-dvh w-full items-start justify-center bg-transparent"
        style={{ padding: PAD }}
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
function useWindowAutoSize(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let last = "";

    const apply = () => {
      frame = 0;
      const width = Math.ceil(el.offsetWidth) + PAD * 2;
      const height = Math.ceil(el.offsetHeight) + PAD * 2;
      const key = `${width}x${height}`;
      if (key === last) return;
      last = key;
      void setIslandWindowSize(width, height);
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
  }, [ref]);
}

/** Remembers where the user parked the island between sessions. */
function useWindowPositionMemory() {
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void win
      .onMoved(({ payload }) => {
        void win.scaleFactor().then((scale) => {
          rememberIslandWindowPosition({ x: payload.x / scale, y: payload.y / scale });
        });
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
