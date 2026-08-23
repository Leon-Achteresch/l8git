import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export function PanelValue({
  value,
  label,
  children,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="font-heading text-[28px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function DeltaBadge({
  pct,
  suffix,
  className,
}: {
  pct: number | null;
  suffix?: string;
  className?: string;
}) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium tabular-nums",
        up ? "text-git-added" : "text-git-removed",
        className,
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(pct)}%{suffix ? <span className="font-normal text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

export function PanelError({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center text-center text-xs text-git-removed",
        className,
      )}
    >
      {message}
    </div>
  );
}

export function LegendDot({
  swatchClassName,
  label,
}: {
  swatchClassName: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn("size-2 rounded-full", swatchClassName)} />
      {label}
    </span>
  );
}

export function RangePills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      size="sm"
      spacing={2}
      className="rounded-lg border border-border bg-background/40 p-0.5"
    >
      {options.map((opt) => (
        <ToggleGroupItem
          key={opt.key}
          value={opt.key}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
        >
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
