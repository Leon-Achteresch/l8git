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
      className={cn("ag-guide-choice", selected && "is-selected", disabled && "is-disabled")}
    >
      {mark ? <span className="ag-guide-choice-mark">{mark}</span> : null}
      <span className="ag-guide-choice-body">
        <span className="ag-guide-choice-title">{title}</span>
        {description ? <span className="ag-guide-choice-copy">{description}</span> : null}
        {meta ? <span className="ag-guide-choice-meta">{meta}</span> : null}
      </span>
      {badge ? <span className="ag-guide-choice-badge">{badge}</span> : null}
    </button>
  );
}
