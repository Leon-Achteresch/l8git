import type { ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function CapabilitySplit({
  list,
  detail,
  listClassName,
}: {
  list: ReactNode;
  detail: ReactNode;
  listClassName?: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.55fr)] overflow-hidden">
      <ScrollArea className={cn("min-h-0 border-r border-[var(--ag-line)] bg-[var(--ag-surface-2)]/30", listClassName)}>
        {list}
      </ScrollArea>
      <ScrollArea className="min-h-0 bg-[var(--ag-surface)]">{detail}</ScrollArea>
    </div>
  );
}
