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
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--ag-stage-bg)]">
      <header className="z-10 shrink-0 border-b border-[var(--ag-line)] bg-[color-mix(in_oklab,var(--ag-surface)_86%,transparent)] backdrop-blur-xl">
        <div className="grid min-w-0 grid-cols-[minmax(13rem,auto)_minmax(12rem,1fr)_minmax(0,auto)] items-center gap-4 px-4 py-3.5 max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-2.5 max-sm:grid-cols-1 max-sm:px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-9 shrink-0 rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] text-[var(--ag-text-2)] transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onBack}
              title={backLabel}
              aria-label={backLabel}
            >
              <ArrowLeft className="size-4" />
            </Button>
            {mark}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-[-0.025em] text-[var(--ag-text)]">
                {title}
              </p>
              <p className="text-[var(--ag-text-3)] truncate text-[11px]">{subtitle}</p>
            </div>
          </div>
          {onQueryChange && searchPlaceholder ? (
            <div className="relative min-w-48 max-w-[30rem] justify-self-stretch rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[color-mix(in_oklab,var(--ag-surface-2)_78%,transparent)] transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-[color-mix(in_oklab,var(--git-branch)_34%,var(--ag-line-strong))] focus-within:bg-[var(--ag-surface)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--git-branch)_16%,transparent)] max-lg:order-3 max-lg:col-span-full max-lg:max-w-none max-sm:min-w-0">
              <Search className="text-[var(--ag-text-3)] pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={query ?? ""}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-[var(--ag-r-md)] border-0 bg-transparent pl-9 text-[12px] shadow-none focus-visible:ring-0"
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {actions ? (
            <div className="flex min-w-0 max-w-[min(42rem,48vw)] flex-nowrap items-center justify-end gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-lg:max-w-[46vw] max-sm:order-2 max-sm:max-w-full max-sm:justify-start">
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden max-lg:flex-col">
        {tabs && tabValue && onTabChange && tabsLabel ? (
          <nav className="flex w-[11.75rem] min-w-[11.75rem] shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto border-r border-[var(--ag-line)] bg-[color-mix(in_oklab,var(--ag-rail-bg)_78%,transparent)] p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-lg:h-14 max-lg:w-full max-lg:min-w-0 max-lg:flex-row max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:border-r-0 max-lg:border-b max-lg:px-2.5 max-lg:py-2" aria-label={tabsLabel}>
            {tabs.map((item) => {
              const active = item.id === tabValue;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "relative inline-flex h-10 w-full min-w-0 shrink-0 items-center justify-start rounded-[10px] px-3 text-[12px] font-medium text-[var(--ag-text-3)] outline-none transition-[background-color,color,box-shadow] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring max-lg:w-auto max-lg:min-w-max",
                    active && "bg-[var(--ag-surface)] text-[var(--ag-text)] shadow-[var(--ag-shadow-raise)]",
                  )}
                >
                  {active ? (
                    <m.span
                      layoutId="capability-studio-tab"
                      className="absolute inset-y-[22%] left-0 w-0.5 rounded-full bg-[var(--git-branch)] max-lg:inset-x-[18%] max-lg:top-auto max-lg:-bottom-2 max-lg:h-0.5 max-lg:w-auto"
                      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                    />
                  ) : null}
                  <span className="relative z-[1] inline-flex min-w-0 items-center justify-center gap-1.5">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                    {item.count === undefined ? null : (
                      <span className={cn(
                        "inline-flex h-[1.15rem] min-w-5 items-center justify-center rounded-full bg-[var(--ag-hover)] px-1.5 text-[10px] tabular-nums text-[var(--ag-text-2)]",
                        active && "bg-[var(--ag-surface-2)] text-[var(--ag-text)]",
                      )}>{item.count}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(680px_320px_at_100%_0%,color-mix(in_oklab,var(--git-branch)_5%,transparent),transparent_70%),var(--ag-stage-bg)]">
          {children}
        </div>
      </div>
    </section>
  );
}
