import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef } from "react";

import {
  ISLAND_PAD,
  useIslandDocks,
  useIslandStore,
  type IslandDockId,
} from "@/lib/island-store";
import { useRepoStore } from "@/lib/repo-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";
import { cn } from "@/lib/utils";

const OPEN = { type: "spring", stiffness: 520, damping: 36, mass: 0.6 } as const;

export function useDockOpen(id: IslandDockId) {
  const enabled = useUiVisibilityPrefs((s) => s.showHeaderIsland);
  const hasRepo = useRepoStore((s) => !!s.activePath);
  const dock = useIslandStore((s) => s.dock);
  const hovered = useIslandStore((s) => s.hovered);
  if (!enabled || !hasRepo) return false;
  return hovered === id || (dock === id && hovered === null);
}

export function IslandDock({
  id,
  axis = "x",
  pad = ISLAND_PAD,
  padEnd = pad,
  floatLeft = null,
  className,
}: {
  id: IslandDockId;
  axis?: "x" | "y";
  pad?: number;
  padEnd?: number;
  floatLeft?: number | null;
  className?: string;
}) {
  const enabled = useUiVisibilityPrefs((s) => s.showHeaderIsland);
  const hasRepo = useRepoStore((s) => !!s.activePath);
  const dragging = useIslandStore((s) => s.dragging);
  const hovered = useIslandStore((s) => s.hovered);
  const size = useIslandDocks((s) => s.size);
  const register = useIslandDocks((s) => s.register);
  const bump = useIslandDocks((s) => s.bump);
  const open = useDockOpen(id);
  const ref = useRef<HTMLDivElement | null>(null);

  const mounted = enabled && hasRepo;

  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;
    register(id, el);
    const observer = new ResizeObserver(bump);
    observer.observe(el);
    observer.observe(document.body);
    return () => {
      register(id, null);
      observer.disconnect();
    };
  }, [id, mounted, register, bump]);

  useEffect(() => {
    if (mounted) bump();
  }, [mounted, pad, floatLeft, open, size, bump]);

  if (!mounted) return null;

  const horizontal = axis === "x";
  const floating = floatLeft !== null;
  const spread = pad + (horizontal ? size.width : size.height) + padEnd;

  return (
    <m.div
      data-island-slot={id}
      aria-hidden
      initial={false}
      animate={
        floating
          ? { width: spread }
          : horizontal
            ? { width: open ? spread : 0 }
            : { height: open ? spread : 0 }
      }
      transition={OPEN}
      style={
        floating
          ? { left: floatLeft - pad }
          : horizontal
            ? { height: size.height }
            : { width: size.width }
      }
      className={cn(
        "pointer-events-none relative shrink-0 self-center overflow-hidden",
        floating && "absolute bottom-0 top-1",
        className,
      )}
    >
      <div
        ref={ref}
        style={{
          width: size.width,
          height: size.height,
          ...(horizontal
            ? { left: pad, top: "50%", transform: "translateY(-50%)" }
            : { top: pad, left: "50%", transform: "translateX(-50%)" }),
        }}
        className="absolute"
      >
        <AnimatePresence>
          {dragging && open && (
            <m.span
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{
                opacity: 1,
                scale: hovered === id ? 1 : 0.94,
              }}
              exit={{ opacity: 0, scale: 0.82 }}
              transition={{ type: "spring", stiffness: 620, damping: 28 }}
              className={cn(
                "absolute inset-0 rounded-full border transition-colors duration-150",
                hovered === id
                  ? "border-primary/50 bg-primary/10"
                  : "border-dashed border-foreground/20 bg-foreground/5",
              )}
            />
          )}
        </AnimatePresence>
      </div>
    </m.div>
  );
}
