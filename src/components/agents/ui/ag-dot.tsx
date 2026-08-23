import { m } from "motion/react";

import { cn } from "@/lib/utils";
import { easeOutFast, pulseKeyframes, pulseTransition } from "@/components/motion/kit";

export function AgDot({
  state,
  className,
}: {
  state?: string;
  className?: string;
}) {
  const working = state === "working";
  return (
    <m.span
      aria-hidden="true"
      className={cn("ag-dot", className)}
      data-state={state}
      animate={working ? pulseKeyframes : { opacity: 1 }}
      transition={working ? pulseTransition : easeOutFast}
    />
  );
}
