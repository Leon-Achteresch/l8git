import type { ReactNode } from "react";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";

export function CapabilitySectionTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  actions?: ReactNode;
}) {
  return (
    <AgentsEnter>
      <header className="flex min-w-0 flex-wrap items-start gap-4 border-b border-[var(--ag-line)] bg-[var(--ag-surface)] px-6 py-6 max-sm:px-4 max-sm:py-5">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ag-text-3)]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--ag-text)] text-balance break-words">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 text-[13px] leading-6 text-[var(--ag-text-2)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    </AgentsEnter>
  );
}
