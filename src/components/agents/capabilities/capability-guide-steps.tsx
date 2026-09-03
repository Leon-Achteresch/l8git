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
    <ol className="ag-guide-steps">
      {steps.map((label, index) => {
        const state = index === current ? "current" : index < current ? "done" : "todo";
        return (
          <li key={label} className={cn("ag-guide-step", `is-${state}`)}>
            {index > 0 ? <span className="ag-guide-step-rule" aria-hidden="true" /> : null}
            <button
              type="button"
              disabled={index > current}
              aria-current={index === current ? "step" : undefined}
              onClick={() => onChange(index)}
            >
              <span className="ag-guide-step-num">
                {state === "done" ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="ag-guide-step-label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
