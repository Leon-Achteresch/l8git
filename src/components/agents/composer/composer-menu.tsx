import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SPRING_PRESS } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function ComposerMenu({
  trigger,
  open,
  onOpenChange,
  align = "start",
  className,
  children,
}: {
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        sideOffset={10}
        className={cn("w-72 rounded-2xl p-1.5", className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ComposerMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

export function ComposerMenuItem({
  icon,
  label,
  hint,
  selected,
  trailing,
  onClick,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  selected?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <m.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm outline-none",
        "hover:bg-muted focus-visible:bg-muted",
        selected && "bg-muted",
      )}
    >
      {icon && <span className="flex size-4 shrink-0 items-center justify-center text-foreground/80">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{label}</span>
        {hint && <span className="ml-2 text-muted-foreground">{hint}</span>}
      </span>
      {trailing}
    </m.button>
  );
}
