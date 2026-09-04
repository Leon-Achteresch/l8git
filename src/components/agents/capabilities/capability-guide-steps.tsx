import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function CapabilityGuideSteps({
  steps,
  current,
  onChange,
}: {
  steps: string[];
  current: number;
  onChange: (index: number) => void;
}) {
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-1">
      {steps.map((label, index) => {
        const state = index === current ? "current" : index < current ? "done" : "todo";
        return (
          <li key={label} className="flex min-w-0 items-center">
            {index > 0 ? (
              <span
                className={cn(
                  "mr-1 h-px w-5 bg-[var(--ag-line)]",
                  state !== "todo" && "bg-[var(--ag-text)]",
                )}
                aria-hidden="true"
              />
            ) : null}
            <button
              type="button"
              disabled={index > current}
              aria-current={index === current ? "step" : undefined}
              onClick={() => onChange(index)}
              className={cn(
                "inline-flex min-w-0 items-center gap-2 rounded-full px-2 py-1.5 text-[var(--ag-text-3)] transition-colors duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] disabled:cursor-default disabled:hover:bg-transparent",
                state === "current" && "text-[var(--ag-text)]",
              )}
            >
              <span className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border border-[var(--ag-line)] text-[10px] font-semibold tabular-nums",
                state === "current" && "border-[var(--ag-text)] bg-[var(--ag-text)] text-[var(--ag-solid-fg)]",
                state === "done" && "border-transparent bg-[var(--ag-selected)] text-[var(--ag-text)]",
              )}>
                {state === "done" ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate text-[12px] font-medium">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
