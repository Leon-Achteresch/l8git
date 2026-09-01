import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";

export function CapabilityEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <AgentsEnter>
      <div className="flex min-h-[22rem] items-center justify-center px-8 py-12">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
            <Inbox className="size-5 text-[var(--ag-text-3)]" />
          </span>
          <h3 className="mt-4 text-sm font-semibold tracking-tight text-[var(--ag-text)]">{title}</h3>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-xs leading-5 text-[var(--ag-text-2)]">{description}</p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </AgentsEnter>
  );
}
