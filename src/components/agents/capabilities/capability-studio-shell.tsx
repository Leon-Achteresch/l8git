import { ArrowLeft, Search } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function CapabilityStudioShell({
  title,
  subtitle,
  mark,
  query,
  onQueryChange,
  searchPlaceholder,
  onBack,
  backLabel,
  actions,
  tabs,
  tabValue,
  onTabChange,
  tabsLabel,
  children,
}: {
  title: string;
  subtitle: string;
  mark: ReactNode;
  query?: string;
  onQueryChange?: (value: string) => void;
  searchPlaceholder?: string;
  onBack: () => void;
  backLabel: string;
  actions?: ReactNode;
  tabs?: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
    count?: number;
  }>;
  tabValue?: string;
  onTabChange?: (id: string) => void;
  tabsLabel?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="ag-studio-head shrink-0">
        <div className="ag-studio-toolbar">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--ag-text-2)] hover:text-[var(--ag-text)]"
            onClick={onBack}
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Button>
          {mark}
          <div className="min-w-0 shrink-0">
            <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ag-text)]">
              {title}
            </p>
            <p className="ag-faint truncate text-[11px]">{subtitle}</p>
          </div>
          {onQueryChange && searchPlaceholder ? (
            <div className="ag-studio-search relative min-w-0">
              <Search className="ag-faint pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={query ?? ""}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border-[var(--ag-line)] bg-[var(--ag-surface-2)] pl-9 text-[12px] shadow-none"
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {actions ? <div className="flex shrink-0 flex-nowrap items-center gap-1.5">{actions}</div> : null}
        </div>
        {tabs && tabValue && onTabChange && tabsLabel ? (
          <nav className="ag-studio-tabs" aria-label={tabsLabel}>
            {tabs.map((item) => {
              const active = item.id === tabValue;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onTabChange(item.id)}
                  className={cn("ag-studio-tab", active && "is-active")}
                >
                  {active ? (
                    <m.span
                      layoutId="capability-studio-tab"
                      className="ag-studio-tab-ink"
                      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                    />
                  ) : null}
                  <span className="relative z-[1] inline-flex min-w-0 items-center justify-center gap-1.5">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                    {item.count === undefined ? null : (
                      <span className="ag-studio-tab-count">{item.count}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : null}
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}
