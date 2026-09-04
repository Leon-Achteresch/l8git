import { cn } from "@/lib/utils";

export function AgentReviewStat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border border-[var(--ag-line)] bg-[var(--ag-surface-2)]">
      <span className="text-[var(--ag-text-3)] font-medium">{label}</span>
      <span className={cn("font-semibold tabular-nums", className)}>{value}</span>
    </span>
  );
}
