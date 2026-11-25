import { m } from "motion/react";
import type { ReactNode } from "react";

import { Illustration } from "@/components/ui/illustration";

export function PrEmptyState({ children }: { children?: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      role="status"
      className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground"
    >
      <Illustration name="no-pull-requests" />
      <div className="max-w-[280px] leading-relaxed text-pretty">
        {children}
      </div>
    </m.div>
  );
}
