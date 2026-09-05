import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AgentCommandLane({
  title,
  count,
  tone = "quiet",
  children,
}: {
  title: string;
  count: number;
  tone?: "attention" | "work" | "quiet";
  children: ReactNode;
}) {
  if (count === 0) return null;

  return (
    <section className="min-w-0">
      <header className="flex items-center gap-2 px-1 pb-2.5">
        <h2
          className={cn(
            "text-[12px] font-semibold tracking-[-0.02em]",
            tone === "attention" && "text-[var(--git-branch)]",
            tone === "work" && "text-[var(--git-modified)]",
            tone === "quiet" && "text-[var(--ag-text-3)]",
          )}
        >
          {title}
        </h2>
        <span className="text-[11px] font-medium tabular-nums text-[var(--ag-text-3)]">
          {count}
        </span>
        <span aria-hidden className="ml-1 h-px flex-1 bg-[var(--ag-line)]" />
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
