import { ChevronDown } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";

import { Rotate } from "@/components/motion/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function ComposerEffortPopover({
  efforts,
  value,
  onChange,
}: {
  efforts: string[];
  value: string;
  onChange: (effort: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const index = Math.max(0, efforts.indexOf(value));

  if (efforts.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.key === "Enter" && e.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded-md bg-background px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-background/70"
        >
          {value}
          <Rotate open={open} className="size-3">
            <ChevronDown className="size-3" strokeWidth={2} aria-hidden />
          </Rotate>
        </span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" sideOffset={8} className="w-64 rounded-2xl p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Effort</span>
          <span className="font-semibold">{value}</span>
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Faster</span>
          <span>Smarter</span>
        </div>
        <div className="mt-1.5 flex gap-1">
          {efforts.map((effort, i) => (
            <m.button
              key={effort}
              type="button"
              aria-label={effort}
              aria-pressed={i === index}
              onClick={() => {
                onChange(effort);
                setOpen(false);
              }}
              layout
              transition={SPRING_LAYOUT}
              className={cn(
                "h-7 flex-1 rounded-md border border-border/60",
                i === index ? "bg-foreground/80" : "bg-muted hover:bg-muted/70",
              )}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
