import { m, useReducedMotion } from "motion/react";

import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentReviewStat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <m.span
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface-2)] px-2.5 py-1 text-[0.6875rem]"
    >
      <span className="text-[var(--ag-text-3)] font-medium">{label}</span>
      <span className={cn("font-semibold tabular-nums", className)}>{value}</span>
    </m.span>
  );
}
