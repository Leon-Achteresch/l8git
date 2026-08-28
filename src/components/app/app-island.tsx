import { animate, m, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast as sonnerToast, useSonner, type ToastT } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { IslandShell } from "@/components/island/island-shell";
import { ISLAND_VIEW, type IslandFlash } from "@/components/island/island-ui";
import { useIslandSnapshot } from "@/lib/island/client";
import { useIslandFlash } from "@/lib/island/flash";
import {
  defaultIslandPosition,
  dockRectFor,
  ISLAND_HEIGHT,
  ISLAND_WIDTH,
  magnetFor,
  useIslandDocks,
  useIslandStore,
  type IslandDock as IslandDockTarget,
  type IslandPosition,
} from "@/lib/island-store";
import { useRepoStore } from "@/lib/repo-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";

const EDGE_MARGIN = 8;
const DEFAULT_TOAST_MS = 4000;
const SNAP = { type: "spring", stiffness: 620, damping: 30, mass: 0.6 } as const;
const MAGNET = { stiffness: 700, damping: 26, mass: 0.4 } as const;
const SETTLE_MS = 320;

/** The island as an overlay inside the main window: draggable and dockable. */
export function AppIsland() {
  const [view, setView] = useState<string | null>(null);
  const boundsRef = useRef<HTMLDivElement | null>(null);
  const islandRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const idle = () => !draggingRef.current && !justDraggedRef.current;

  const enabled = useUiVisibilityPrefs((s) => s.showHeaderIsland);
  const activePath = useRepoStore((s) => s.activePath);
  const snapshot = useIslandSnapshot();

  const { position, dock, hovered } = useIslandStore(
    useShallow((s) => ({
      position: s.position,
      dock: s.dock,
      hovered: s.hovered,
    })),
  );
  const setPosition = useIslandStore((s) => s.setPosition);
  const setDock = useIslandStore((s) => s.setDock);
  const setDragging = useIslandStore((s) => s.setDragging);
  const setHovered = useIslandStore((s) => s.setHovered);
  const dockVersion = useIslandDocks((s) => s.version);

  const [start] = useState(() => position ?? defaultIslandPosition());
  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const magnetX = useSpring(0, MAGNET);
  const magnetY = useSpring(0, MAGNET);

  // Mirrors the render condition below: while the island is detached the root
  // renders the normal toaster, and this must not dismiss its toasts.
  const showsIsland = enabled && !!activePath && !snapshot.detached;
  const flash = useIslandFlashLine(showsIsland);

  const compactRef = useRef(true);
  // Written in an effect, not in render: a discarded render must not leave the
  // ResizeObserver below publishing a size the user never saw.
  useEffect(() => {
    compactRef.current = view === null && !flash;
  }, [view, flash]);
  const setSize = useIslandDocks((s) => s.setSize);
  useEffect(() => {
    const el = islandRef.current;
    if (!el) return;
    let settle = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (!compactRef.current) return;
        setSize({ width: el.offsetWidth, height: el.offsetHeight });
      }, SETTLE_MS);
    });
    observer.observe(el);
    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, [setSize, enabled, activePath]);

  useEffect(() => {
    if (draggingRef.current) return;
    const target = islandTarget(dock, position);
    if (x.get() !== target.x) void animate(x, target.x, SNAP);
    if (y.get() !== target.y) void animate(y, target.y, SNAP);
  }, [dock, position, dockVersion, x, y]);

  useEffect(() => {
    if (dock !== "free") return;
    const clamp = () => {
      const { width, height } = islandSize(islandRef.current);
      const minX = EDGE_MARGIN + width / 2;
      const minY = height / 2;
      const maxX = Math.max(minX, window.innerWidth - EDGE_MARGIN - width / 2);
      const maxY = Math.max(minY, window.innerHeight - EDGE_MARGIN - height / 2);
      const nextX = Math.min(Math.max(minX, x.get()), maxX);
      const nextY = Math.min(Math.max(minY, y.get()), maxY);
      if (nextX !== x.get() || nextY !== y.get()) {
        x.set(nextX);
        y.set(nextY);
        setPosition({ x: nextX, y: nextY });
      }
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [dock, x, y, setPosition]);

  useEffect(() => {
    if (view === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  // The detached window takes over while it is open.
  if (!showsIsland) return null;

  return (
    <>
      {view !== null && (
        <div
          className="fixed inset-0 z-[60]"
          aria-hidden
          onClick={() => setView(null)}
        />
      )}
      <div ref={boundsRef} className="pointer-events-none fixed inset-0 z-[70]">
        <m.div
          ref={islandRef}
          drag
          dragConstraints={boundsRef}
          dragElastic={0.04}
          dragMomentum={false}
          onDragStart={() => {
            draggingRef.current = true;
            setIsDragging(true);
            setDragging(true);
            setView(null);
          }}
          onDrag={() => {
            const hit = magnetFor(x.get(), y.get());
            setHovered(hit?.id ?? null);
            const grip = hit ? hit.pull * hit.pull : 0;
            magnetX.set(hit ? (hit.x - x.get()) * grip : 0);
            magnetY.set(hit ? (hit.y - y.get()) * grip : 0);
          }}
          onDragEnd={() => {
            const hit = magnetFor(x.get(), y.get());
            x.jump(x.get() + magnetX.get());
            y.jump(y.get() + magnetY.get());
            magnetX.jump(0);
            magnetY.jump(0);
            setHovered(null);
            setIsDragging(false);
            setDragging(false);
            draggingRef.current = false;
            justDraggedRef.current = true;
            if (hit) {
              setDock(hit.id);
              void animate(x, hit.x, SNAP);
              void animate(y, hit.y, SNAP);
            } else {
              setDock("free");
              setPosition({ x: Math.round(x.get()), y: Math.round(y.get()) });
            }
            window.setTimeout(() => {
              justDraggedRef.current = false;
            }, 0);
          }}
          animate={{ scale: hovered ? 0.94 : isDragging ? 1.08 : 1 }}
          transition={SNAP}
          style={{ x, y }}
          className="pointer-events-auto absolute left-0 top-0 cursor-grab [-webkit-app-region:no-drag] [translate:-50%_-18.5px] active:cursor-grabbing"
        >
          <m.div
            style={{ x: magnetX, y: magnetY }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!idle()) return;
              setView(ISLAND_VIEW.menu);
            }}
          >
            <IslandShell
              snapshot={snapshot}
              view={view}
              onViewChange={setView}
              flash={flash}
              canInteract={idle}
            />
          </m.div>
        </m.div>
      </div>
    </>
  );
}

function islandSize(el: HTMLElement | null) {
  return {
    width: el?.offsetWidth || ISLAND_WIDTH,
    height: el?.offsetHeight || ISLAND_HEIGHT,
  };
}

function islandTarget(
  dock: IslandDockTarget,
  position: IslandPosition | null,
): IslandPosition {
  if (dock !== "free") {
    const rect = dockRectFor(dock);
    if (rect)
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return position ?? defaultIslandPosition();
}

/**
 * The island's status line. Its own action results win over app toasts, which
 * it otherwise takes over from sonner while it is visible.
 */
function useIslandFlashLine(enabled: boolean): IslandFlash | null {
  const own = useIslandFlash((s) => s.current);
  const dismissOwn = useIslandFlash((s) => s.dismiss);
  const { toasts } = useSonner();
  const latest = enabled ? (toasts[toasts.length - 1] ?? null) : null;

  useEffect(() => {
    if (!latest || latest.type === "loading") return;
    const timer = window.setTimeout(
      () => sonnerToast.dismiss(latest.id),
      latest.duration ?? DEFAULT_TOAST_MS,
    );
    return () => window.clearTimeout(timer);
  }, [latest]);

  if (!enabled) return null;
  if (own) {
    return {
      id: own.id,
      type: own.type,
      title: own.title,
      description: own.description,
      onDismiss: () => dismissOwn(own.id),
    };
  }
  if (!latest) return null;
  return {
    id: String(latest.id),
    type: toastType(latest.type),
    title: renderToastNode(latest.title),
    description: renderToastNode(latest.description),
    onDismiss: () => sonnerToast.dismiss(latest.id),
  };
}

function toastType(type: ToastT["type"]): IslandFlash["type"] {
  if (type === "success" || type === "error" || type === "warning" || type === "loading")
    return type;
  return "info";
}

function renderToastNode(
  node: ToastT["title"] | ToastT["description"],
): ReactNode {
  return typeof node === "function" ? node() : node;
}
