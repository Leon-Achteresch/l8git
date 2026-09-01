import { LoaderCircle } from "lucide-react";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { SpinIcon } from "@/components/motion/kit";

export function CapabilityLoading({ label }: { label: string }) {
  return (
    <AgentsEnter className="flex min-h-[24rem] items-center justify-center gap-2.5 text-xs text-[var(--ag-text-2)] font-medium">
      <SpinIcon icon={LoaderCircle} className="size-4 text-[var(--git-branch)]" />
      {label}
    </AgentsEnter>
  );
}
