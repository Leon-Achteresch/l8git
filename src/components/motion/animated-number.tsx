// beui.dev/components/motion/animated-number
//
// Tweens from the last value to the next one and formats each frame. Cheaper
// than NumberTicker (one animating value, no per-digit column) and the right
// choice for a figure that changes often — a live cost readout, a token count
// climbing during a turn.

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { EASE_OUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export interface AnimatedNumberProps {
  value: number;
  /** Tween duration, in seconds. */
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({
  value,
  duration = 0.6,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const from = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: setDisplay,
    });
    from.current = value;
    return () => controls.stop();
  }, [duration, reduce, value]);

  return <span className={cn("tabular-nums", className)}>{format(display)}</span>;
}
