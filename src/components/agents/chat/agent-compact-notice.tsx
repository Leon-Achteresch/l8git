import { Boxes } from "lucide-react";

export function AgentCompactNotice({ label }: { label: string }) {
  return (
    <div
      data-agent-compact=""
      className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-[var(--ag-surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--ag-text-2)]"
    >
      <Boxes className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}
