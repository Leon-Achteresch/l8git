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
    <div className="ag-studio-split">
      <ScrollArea className={cn("min-h-0 border-r border-[var(--ag-line)] bg-[var(--ag-surface-2)]/40", listClassName)}>
        {list}
      </ScrollArea>
      <ScrollArea className="min-h-0 min-w-0 bg-[var(--ag-surface)]">{detail}</ScrollArea>
    </div>
  );
}
