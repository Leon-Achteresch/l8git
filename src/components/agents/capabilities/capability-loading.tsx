import { LoaderCircle } from "lucide-react";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { SpinIcon } from "@/components/motion/kit";

export function CapabilityLoading({ label }: { label: string }) {
  return (
    <AgentsEnter className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center text-xs font-medium text-[var(--ag-text-2)]">
      <span className="grid size-11 place-items-center rounded-[14px] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-raise)]">
        <SpinIcon icon={LoaderCircle} className="size-4 text-[var(--git-branch)]" />
      </span>
      <span className="text-pretty">{label}</span>
    </AgentsEnter>
  );
}
