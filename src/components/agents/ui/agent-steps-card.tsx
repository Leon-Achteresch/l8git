import { Check, Circle, Minus, Plus } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { AgentWorkingRing } from "@/components/agents/ui/agent-working-ring";
import { Collapse } from "@/components/motion/kit";
import { SPRING_PANEL, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type AgentStep = { id: string; label: string; status: "done" | "active" | "pending" };

export function AgentStepsCard({ steps, className }: { steps: AgentStep[]; className?: string }) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const remaining = steps.filter(step => step.status !== "done").length;

  return (
    <m.div
      className={cn("w-full max-w-xs rounded-2xl border border-border bg-card p-3 shadow-sm", className)}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      <div className="flex items-center gap-2 px-1">
        <AgentWorkingRing size={14} thickness={1.4} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {remaining} {remaining === 1 ? "step" : "steps"} left
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(value => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand steps" : "Collapse steps"}
          className="ml-auto inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={collapsed ? "plus" : "minus"}
              initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
              transition={SPRING_SWAP}
              className="inline-flex"
            >
              {collapsed ? <Plus className="size-3.5" strokeWidth={2} /> : <Minus className="size-3.5" strokeWidth={2} />}
            </m.span>
          </AnimatePresence>
        </button>
      </div>

      <Collapse open={!collapsed}>
        <ol className="mt-2 flex flex-col gap-1">
          {steps.map((step, index) => (
            <m.li
              key={step.id}
              aria-current={step.status === "active" ? "step" : undefined}
              layout
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...SPRING_PANEL, delay: reduce ? 0 : Math.min(index, 10) * 0.035 }}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
                step.status === "active" && "border border-border",
                step.status === "pending" && "text-muted-foreground/60",
                step.status === "done" && "text-muted-foreground",
              )}
            >
              {step.status === "done" ? (
                <Check className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
              ) : step.status === "active" ? (
                <Circle className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-dashed border-current" aria-hidden />
              )}
              <span className="min-w-0 truncate">{step.label || `Step ${index + 1}`}</span>
            </m.li>
          ))}
        </ol>
      </Collapse>
    </m.div>
  );
}
