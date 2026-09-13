import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentsEnter({
  children,
  delay = 0,
  y = 12,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <m.div
      className={cn(className)}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_PANEL, delay }}
    >
      {children}
    </m.div>
  );
}
