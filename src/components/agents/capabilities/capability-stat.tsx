import { m } from "motion/react";
import type { ReactNode } from "react";

export function CapabilityStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <m.div
      whileHover={{ y: -1 }}
      className="min-w-0 rounded-xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)]/60 px-3.5 py-3 shadow-[var(--ag-shadow-raise)]"
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ag-text-3)]">{label}</p>
      <div className="mt-1 truncate text-xs font-semibold tabular-nums text-[var(--ag-text)]">{value}</div>
    </m.div>
  );
}
