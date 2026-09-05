import { m, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";

import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentSectionTabs({
  value,
  onChange,
  items,
  label,
  layoutId = "agent-section-tab",
}: {
  value: string;
  onChange: (id: string) => void;
  items: Array<{
    id: string;
    label: ReactNode;
    icon?: ReactNode;
    count?: number;
  }>;
  label: string;
  layoutId?: string;
}) {
  const reduce = useReducedMotion();
  const id = useId();

  return (
    <m.nav
      layoutRoot
      className="flex min-h-9 min-w-0 max-w-full items-center gap-1 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={label}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-[11px] font-medium outline-none transition-colors hover:bg-[var(--ag-hover)]",
              "focus-visible:shadow-[0_0_0_2px_var(--ring)]",
              active ? "text-[var(--ag-text)]" : "text-[var(--ag-text-2)] hover:text-[var(--ag-text)]",
            )}
          >
            {active ? (
              <m.span
                layoutId={`${layoutId}-${id}`}
                className="absolute inset-0 rounded-lg bg-[var(--ag-selected)]"
                transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
              />
            ) : null}
            <span className="relative z-[1] inline-flex min-w-0 items-center gap-1.5">
              {item.icon}
              {item.label}
              {item.count === undefined ? null : (
                <span className="text-[var(--ag-text-3)] text-[10px] tabular-nums">{item.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </m.nav>
  );
}
