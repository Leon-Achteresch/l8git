import { AlertCircle, Copy, Inbox, LoaderCircle } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import {
  copyToClipboard,
  ItemContextMenu,
  type MenuEntry,
} from "@/components/agents/ui/item-context-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";

export function CapabilitySplit({
  list,
  detail,
  listClassName,
}: {
  list: ReactNode;
  detail: ReactNode;
  listClassName?: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.55fr)] overflow-hidden">
      <ScrollArea className={cn("min-h-0 border-r border-border/45", listClassName)}>
        {list}
      </ScrollArea>
      <ScrollArea className="min-h-0 bg-background">{detail}</ScrollArea>
    </div>
  );
}

export function CapabilityEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[22rem] items-center justify-center px-8 py-12">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-foreground/[0.055] ring-1 ring-border/45">
          <Inbox className="size-4 text-muted-foreground" />
        </span>
        <h3 className="mt-4 text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-xs leading-5 text-muted-foreground">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function CapabilityError({ message }: { message: string }) {
  return (
    <div className="m-3 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words leading-5">{message}</span>
    </div>
  );
}

export function CapabilityLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[24rem] items-center justify-center gap-2 text-xs text-muted-foreground">
      <SpinIcon icon={LoaderCircle} className="size-3.5" />
      {label}
    </div>
  );
}

export function ProgressiveCapabilityList<T>({
  items,
  getKey,
  renderItem,
  resetKey,
  moreLabel,
  initialCount = 80,
  batchSize = 100,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  resetKey: string;
  moreLabel: (count: number) => string;
  initialCount?: number;
  batchSize?: number;
}) {
  const [pagination, setPagination] = useState({ resetKey, limit: initialCount });
  const limit = pagination.resetKey === resetKey ? pagination.limit : initialCount;
  const remaining = Math.max(0, items.length - limit);

  return (
    <>
      {items.slice(0, limit).map((item) => (
        <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
      ))}
      {remaining > 0 ? (
        <button
          type="button"
          className="ag-pill mt-2 h-8 w-full justify-center"
          onClick={() => setPagination({ resetKey, limit: limit + batchSize })}
        >
          {moreLabel(Math.min(batchSize, remaining))}
        </button>
      ) : null}
    </>
  );
}

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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-foreground/[0.075]" : "hover:bg-foreground/[0.04]",
      )}
    >
      <span className={cn(
        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ring-1 ring-border/40",
        selected ? "bg-background text-foreground" : "bg-foreground/[0.045] text-muted-foreground",
      )}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-medium">{title}</span>
          {meta}
        </span>
        {description ? (
          <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? <span className="mt-1 shrink-0">{trailing}</span> : null}
    </button>
    </ItemContextMenu>
  );
}

export function CapabilityPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "bad";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-md px-1.5 text-[9px] font-medium tracking-normal",
        tone === "good" && "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400",
        tone === "warning" && "border-amber-500/25 bg-amber-500/[0.07] text-amber-600 dark:text-amber-400",
        tone === "bad" && "border-destructive/25 bg-destructive/[0.06] text-destructive",
        tone === "neutral" && "border-border/55 bg-background/50 text-muted-foreground",
      )}
    >
      {children}
    </Badge>
  );
}

export function CapabilitySectionTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 border-b border-border/45 px-5 py-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h2 className="mt-0.5 truncate text-base font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CapabilityStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-foreground/[0.035] px-3 py-2.5 ring-1 ring-border/35">
      <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
}
