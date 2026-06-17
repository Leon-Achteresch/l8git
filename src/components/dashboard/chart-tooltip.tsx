import type { ReactNode } from "react";

export function ChartTooltip({
  x,
  y,
  containerWidth,
  children,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: ReactNode;
}) {
  const clampedX = Math.min(Math.max(x, 56), Math.max(56, containerWidth - 56));
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
      style={{ left: clampedX, top: Math.max(y, 8) }}
    >
      {children}
    </div>
  );
}

export function ChartTooltipRow({
  swatchClassName,
  label,
  value,
}: {
  swatchClassName?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] leading-4">
      {swatchClassName ? <span className={`size-2 shrink-0 rounded-[3px] ${swatchClassName}`} /> : null}
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-medium tabular-nums">{value}</span>
    </div>
  );
}
