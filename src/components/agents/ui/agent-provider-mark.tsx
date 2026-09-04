import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { AgentWorkingRing } from "@/components/agents/ui/agent-working-ring";
import { SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentProviderMark({
  children,
  working = false,
  label,
  className,
}: {
  children: ReactNode;
  working?: boolean;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[10px] bg-[var(--ag-surface-2)] text-[var(--ag-text)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)]", className)} title={label} aria-label={label}>
      <span className="relative z-[1] grid place-items-center [&_svg]:size-3.5">
        {children}
      </span>
      <AnimatePresence>
        {working ? (
          <m.span
            className="pointer-events-none absolute inset-[-4px] text-[var(--git-modified)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
          >
            <AgentWorkingRing size={36} thickness={1.6} className="size-full" />
          </m.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
