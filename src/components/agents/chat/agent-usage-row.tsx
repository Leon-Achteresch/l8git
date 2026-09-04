export function AgentUsageRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-0.5">
      <span className={muted ? "text-[var(--ag-text-3)]" : undefined}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
