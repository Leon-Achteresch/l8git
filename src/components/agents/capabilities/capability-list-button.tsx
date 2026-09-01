import { Copy } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import {
  copyToClipboard,
  ItemContextMenu,
  type MenuEntry,
} from "@/components/agents/ui/item-context-menu";
import { SPRING_PRESS } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function CapabilityListButton({
  selected,
  icon,
  title,
  description,
  meta,
  trailing,
  onClick,
  menuEntries = [],
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  description?: string | null;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  menuEntries?: MenuEntry[];
}) {
  const reduce = useReducedMotion();
  const entries: MenuEntry[] = [
    {
      label: "Name kopieren",
      icon: <Copy className="size-3.5" />,
      onSelect: () => copyToClipboard(title, "Name kopiert"),
    },
    ...(description
      ? ([
          {
            label: "Beschreibung kopieren",
            icon: <Copy className="size-3.5" />,
            onSelect: () => copyToClipboard(description, "Beschreibung kopiert"),
          },
        ] satisfies MenuEntry[])
      : []),
    ...(menuEntries.length ? (["separator"] satisfies MenuEntry[]) : []),
    ...menuEntries,
  ];

  return (
    <ItemContextMenu entries={entries}>
      <m.button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        transition={SPRING_PRESS}
        className={cn(
          "group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "border border-[var(--ag-line-strong)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-raise)]"
            : "border border-transparent hover:bg-[var(--ag-hover)]",
        )}
      >
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
            selected
              ? "border-[var(--ag-line-strong)] bg-[var(--ag-surface-2)] text-[var(--ag-text)]"
              : "border-[var(--ag-line)] bg-[var(--ag-surface-2)]/60 text-[var(--ag-text-2)]",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12px] font-medium text-[var(--ag-text)]">{title}</span>
            {meta}
          </span>
          {description ? (
            <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-[var(--ag-text-3)]">
              {description}
            </span>
          ) : null}
        </span>
        {trailing ? <span className="mt-1 shrink-0">{trailing}</span> : null}
      </m.button>
    </ItemContextMenu>
  );
}
