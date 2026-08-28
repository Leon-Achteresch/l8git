// beui.dev/components/motion/scroll-progress
//
// Adapted from the page-scroll original: this app scrolls inside panes, not
// the document, so the source is a scroll container ref rather than the
// window. The value is driven by a MotionValue and rendered through a
// transform — the bar never re-renders React on scroll.

import {
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, type RefObject } from "react";

import { cn } from "@/lib/utils";

// Deliberately looser than the UI springs in lib/motion/ease: the indicator
// should trail the scroll, not track it exactly.
const PROGRESS_SPRING = { stiffness: 120, damping: 30, mass: 0.6 };

/**
 * 0…1 scroll progress of a scroll container, as a MotionValue. Updates run on
 * the scroll event without touching React state.
 */
export function useContainerScrollProgress(
  ref: RefObject<HTMLElement | null>,
): MotionValue<number> {
  const progress = useMotionValue(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => {
      const scrollable = node.scrollHeight - node.clientHeight;
      progress.set(scrollable <= 0 ? 0 : Math.min(1, Math.max(0, node.scrollTop / scrollable)));
    };
    read();
    node.addEventListener("scroll", read, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", read);
      observer?.disconnect();
    };
  }, [progress, ref]);

  return progress;
}

type CommonProps = {
  progress: MotionValue<number>;
  /** Spring-smooth the value. Ignored under reduced motion. */
  spring?: boolean;
  className?: string;
};

function useProgressValue(source: MotionValue<number>, spring: boolean) {
  const reduce = useReducedMotion();
  const smoothed = useSpring(source, PROGRESS_SPRING);
  return spring && !reduce ? smoothed : source;
}

export interface ScrollProgressBarProps extends CommonProps {
  /** Bar thickness, in px. */
  height?: number;
  position?: "top" | "bottom";
}

export function ScrollProgressBar({
  progress,
  spring = true,
  height = 2,
  position = "top",
  className,
}: ScrollProgressBarProps) {
  const value = useProgressValue(progress, spring);
  return (
    <m.div
      aria-hidden="true"
      style={{ height, scaleX: value }}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 origin-left bg-[var(--ag-text-3)]",
        position === "top" ? "top-0" : "bottom-0",
        className,
      )}
    />
  );
}

export interface ScrollProgressCircleProps extends CommonProps {
  /** Diameter, in px. */
  size?: number;
  /** Stroke width, in px. */
  thickness?: number;
}

export function ScrollProgressCircle({
  progress,
  spring = true,
  size = 20,
  thickness = 2,
  className,
}: ScrollProgressCircleProps) {
  const value = useProgressValue(progress, spring);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = useTransform(value, (v) => circumference * (1 - v));

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      role="presentation"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("text-[var(--ag-text-2)]", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        className="stroke-current opacity-20"
      />
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        className="stroke-current"
        strokeDasharray={circumference}
        style={{ strokeDashoffset: offset }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
