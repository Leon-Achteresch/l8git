import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

import type { AgentRunStatus } from "./types";
import { spinTransition } from "@/components/motion/kit";
import { SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentRunStatusIcon({
  status,
  className,
}: {
  status: AgentRunStatus;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={status}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
        transition={SPRING_SWAP}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full",
          status === "done" && "bg-emerald-500 text-white",
          status === "failed" && "bg-red-500 text-white",
          status !== "done" && status !== "failed" && "border border-border text-muted-foreground",
          className,
        )}
      >
        {status === "done" ? (
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        ) : status === "failed" ? (
          <X className="size-3.5" strokeWidth={3} aria-hidden />
        ) : (
          <m.span
            className="inline-flex"
            animate={reduce || status !== "running" ? undefined : { rotate: 360 }}
            transition={reduce || status !== "running" ? undefined : spinTransition}
          >
            <Loader2 className="size-3.5" strokeWidth={2.5} aria-hidden />
          </m.span>
        )}
      </m.span>
    </AnimatePresence>
  );
}
