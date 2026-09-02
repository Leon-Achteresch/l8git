import { GitPullRequest } from "lucide-react";
import { m } from "motion/react";
import type { ReactNode } from "react";

export function PrEmptyState({ children }: { children?: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 border border-border/60 shadow-xs">
        <GitPullRequest className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div className="max-w-[280px] leading-relaxed">
        {children}
      </div>
    </m.div>
  );
}
