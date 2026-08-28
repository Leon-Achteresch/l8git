// beui.dev/components/motion/tabs — segment variant
//
// One indicator shared by every option, moved with layoutId. Switching agents
// reads as the pill travelling to the new segment rather than two rectangles
// crossfading, which is what makes a four-way switch legible at this size.

import { m, MotionConfig, useReducedMotion, type Transition } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

// A touch heavier than SPRING_LAYOUT: the indicator settles with a little
// weight instead of snapping, which sells the travel over the short distances
// a segmented control covers.
const INDICATOR_SPRING: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};

type SegmentedContextValue = {
  value: string;
  setValue: (value: string) => void;
  layoutId: string;
};

const SegmentedContext = createContext<SegmentedContextValue | null>(null);

function useSegmented(): SegmentedContextValue {
  const context = useContext(SegmentedContext);
  if (!context) throw new Error("Segment must be used inside <Segmented>");
  return context;
}

export interface SegmentedProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function Segmented({
  value,
  onValueChange,
  children,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps) {
  const layoutId = useId();
  const reduce = useReducedMotion();
  const setValue = useCallback((next: string) => onValueChange(next), [onValueChange]);
  const context = useMemo<SegmentedContextValue>(
    () => ({ value, setValue, layoutId }),
    [layoutId, setValue, value],
  );

  return (
    <MotionConfig transition={reduce ? { duration: 0 } : INDICATOR_SPRING}>
      <SegmentedContext.Provider value={context}>
        {/* layoutRoot: the indicator measures in page coordinates, so inside a
            scrolled rail it would otherwise replay scroll offsets as travel. */}
        <m.div
          layoutRoot
          role="tablist"
          aria-label={ariaLabel}
          className={cn(
            "ag-inset inline-flex items-center gap-0 rounded-[var(--ag-r-sm)] p-0.5",
            className,
          )}
        >
          {children}
        </m.div>
      </SegmentedContext.Provider>
    </MotionConfig>
  );
}

export interface SegmentProps {
  value: string;
  children: ReactNode;
  title?: string;
  "aria-label"?: string;
  className?: string;
  indicatorClassName?: string;
}

export function Segment({
  value,
  children,
  title,
  "aria-label": ariaLabel,
  className,
  indicatorClassName,
}: SegmentProps) {
  const { value: current, setValue, layoutId } = useSegmented();
  const active = current === value;

  return (
    <div className="relative">
      {active ? (
        <m.span
          layoutId={layoutId}
          className={cn(
            "absolute inset-0 rounded-[calc(var(--ag-r-sm)-2px)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-raise)]",
            indicatorClassName,
          )}
        />
      ) : null}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setValue(value)}
        className={cn(
          "relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--ag-r-sm)-2px)] bg-transparent px-2 py-1 text-[11px] font-medium outline-none transition-colors",
          active ? "text-[var(--ag-text)]" : "text-[var(--ag-text-3)] hover:text-[var(--ag-text-2)]",
          className,
        )}
      >
        {children}
      </button>
    </div>
  );
}
