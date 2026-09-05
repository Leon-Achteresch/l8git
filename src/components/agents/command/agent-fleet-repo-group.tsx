import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AgentFleetRepoGroup({
  repoName,
  count,
  defaultOpen,
  children,
}: {
  repoName: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[var(--ag-r-sm)] px-1.5 text-left text-[12px] font-medium text-[var(--ag-text-2)] outline-none transition-colors hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-[var(--ag-text-3)] transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{repoName}</span>
        <span className="tabular-nums text-[11px] text-[var(--ag-text-3)]">{count}</span>
      </button>
      {open ? <div className="min-w-0">{children}</div> : null}
    </div>
  );
}
