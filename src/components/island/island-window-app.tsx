import { currentMonitor, getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";

import { IslandShell } from "@/components/island/island-shell";
import { ISLAND_VIEW, type IslandFlash } from "@/components/island/island-ui";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useIslandSnapshot } from "@/lib/island/client";
import { useIslandFlash } from "@/lib/island/flash";
import {
  islandWindowMemory,
  rememberIslandWindow,
  setIslandWindowSize,
} from "@/lib/island/window-store";
import {
  edgeNear,
  edgePosition,
  isVerticalEdge,
  type IslandEdge,
  type Rect,
} from "@/lib/island-store";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

const PAD = 14;
const DRAG_THRESHOLD_PX = 4;
const SHRINK_SETTLE_MS = 900;
const MOVE_SETTLE_MS = 400;

const ALIGN: Record<IslandEdge | "free", string> = {
  left: "items-center justify-start",
  right: "items-center justify-end",
  top: "items-start justify-center",
  bottom: "items-end justify-center",
  free: "items-start justify-center",
};

export function IslandWindowApp() {
  const snapshot = useIslandSnapshot();
  const [view, setView] = useState<string | null>(null);
  const [edge, setEdge] = useState<IslandEdge | null>(() => islandWindowMemory().edge ?? null);
  const flash = useDetachedFlash();
  useTheme();
  useWindowPositionMemory(setEdge);
  const onContentSize = useWindowAutoSize(edge);

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
        className={cn("flex min-h-dvh w-full bg-transparent", ALIGN[edge ?? "free"])}
        style={{ padding: PAD }}
        onContextMenu={(e) => {
          e.preventDefault();
          setView((v) => (v === ISLAND_VIEW.menu ? null : ISLAND_VIEW.menu));
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setView(null);
        }}
        {...drag}
      >
        <div className="h-max w-max shrink-0">
          <IslandShell
            snapshot={snapshot}
            view={view}
            onViewChange={setView}
            flash={flash}
            vertical={isVerticalEdge(edge)}
            onContentSize={onContentSize}
            standalone
          />
        </div>
      </div>
    </MotionProvider>
  );
}

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
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
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

function useWindowAutoSize(edge: IslandEdge | null) {
  const sent = useRef({ width: 0, height: 0 });
  const settle = useRef(0);
  const edgeRef = useRef(edge);
  edgeRef.current = edge;
  useEffect(() => () => window.clearTimeout(settle.current), []);
  return useCallback((content: { width: number; height: number }) => {
    const size = {
      width: Math.ceil(content.width) + PAD * 2,
      height: Math.ceil(content.height) + PAD * 2,
    };
    const send = () => {
      if (size.width === sent.current.width && size.height === sent.current.height) return;
      sent.current = size;
      void setIslandWindowSize(size.width, size.height, edgeRef.current);
    };
    window.clearTimeout(settle.current);
    if (size.width >= sent.current.width && size.height >= sent.current.height) send();
    else settle.current = window.setTimeout(send, SHRINK_SETTLE_MS);
  }, []);
}

function useWindowPositionMemory(onEdge: (edge: IslandEdge | null) => void) {
  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let off: (() => void) | undefined;
    let settle = 0;
    void win
      .onMoved(() => {
        window.clearTimeout(settle);
        settle = window.setTimeout(() => void settleWindow(onEdge), MOVE_SETTLE_MS);
      })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      });
    return () => {
      disposed = true;
      window.clearTimeout(settle);
      off?.();
    };
  }, [onEdge]);
}

async function settleWindow(onEdge: (edge: IslandEdge | null) => void): Promise<void> {
  const win = getCurrentWindow();
  try {
    const [scale, pos, size, mon] = await Promise.all([
      win.scaleFactor(),
      win.outerPosition(),
      win.outerSize(),
      currentMonitor(),
    ]);
    const rect: Rect = {
      x: pos.x / scale,
      y: pos.y / scale,
      width: size.width / scale,
      height: size.height / scale,
    };
    if (!mon) {
      rememberIslandWindow({ x: rect.x, y: rect.y, edge: null });
      onEdge(null);
      return;
    }
    const work: Rect = {
      x: mon.workArea.position.x / scale,
      y: mon.workArea.position.y / scale,
      width: mon.workArea.size.width / scale,
      height: mon.workArea.size.height / scale,
    };
    const edge = edgeNear(work, rect);
    const placed = edgePosition(edge, work, rect);
    if (Math.abs(placed.x - rect.x) > 1 || Math.abs(placed.y - rect.y) > 1) {
      await win.setPosition(new LogicalPosition(placed.x, placed.y));
    }
    rememberIslandWindow({ x: placed.x, y: placed.y, edge });
    onEdge(edge);
  } catch {
    return;
  }
}
