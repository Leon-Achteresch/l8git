import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function CapabilityGuideChoice({
  selected,
  onSelect,
  disabled,
  mark,
  title,
  description,
  meta,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  mark?: ReactNode;
  title: string;
  description?: string;
  meta?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-[14px] border border-[var(--ag-line)] bg-[var(--ag-surface)] px-4 py-3.5 text-left shadow-[var(--ag-shadow-raise)] outline-none transition-[background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-[var(--ag-line-strong)] focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-[color-mix(in_srgb,var(--ag-text)_28%,var(--ag-line))] bg-[var(--ag-selected)]",
        disabled && "cursor-not-allowed opacity-45 hover:translate-y-0",
      )}
    >
      {mark ? <span className="shrink-0">{mark}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold tracking-[-0.015em] text-[var(--ag-text)] text-pretty">{title}</span>
        {description ? <span className="text-[12px] leading-[1.45] text-[var(--ag-text-2)] text-pretty">{description}</span> : null}
        {meta ? <span className="text-[11px] leading-[1.45] text-[var(--ag-text-3)] break-words">{meta}</span> : null}
      </span>
      {badge ? <span className="shrink-0 rounded-full bg-[var(--ag-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ag-text-2)]">{badge}</span> : null}
    </button>
  );
}
