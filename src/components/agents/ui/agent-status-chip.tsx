import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { AgentWorkingRing } from "@/components/agents/ui/agent-working-ring";
import { SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type AgentStatusTone = "working" | "ready" | "error" | "idle" | "waiting";

export function AgentStatusChip({
  tone,
  children,
  className,
}: {
  tone: AgentStatusTone;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <m.span
      layout
      data-tone={tone}
      className={cn("ag-status", className)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : SPRING_SWAP}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {tone === "working" ? (
          <m.span
            key="ring"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            className="grid size-3 place-items-center"
          >
            <AgentWorkingRing size={12} thickness={1.4} />
          </m.span>
        ) : null}
      </AnimatePresence>
      <span className="min-w-0 truncate">{children}</span>
    </m.span>
  );
}
