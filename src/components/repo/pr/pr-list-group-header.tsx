import { m } from "motion/react";

export function PrListGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 pb-1.5 pt-3 select-none">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </span>
      <m.span
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-muted/80 px-1.5 font-mono text-[10px] font-semibold text-muted-foreground"
      >
        {count}
      </m.span>
    </div>
  );
}
