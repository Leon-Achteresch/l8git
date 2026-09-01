import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CapabilityPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "bad";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-md px-1.5 text-[9px] font-medium tracking-normal",
        tone === "good" && "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400",
        tone === "warning" && "border-amber-500/25 bg-amber-500/[0.07] text-amber-600 dark:text-amber-400",
        tone === "bad" && "border-destructive/25 bg-destructive/[0.06] text-destructive",
        tone === "neutral" && "border-[var(--ag-line)] bg-[var(--ag-surface-2)] text-[var(--ag-text-2)]",
      )}
    >
      {children}
    </Badge>
  );
}
