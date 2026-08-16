import { ChevronRight } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type InboxSectionTone = "neutral" | "attention" | "danger";

const TONE_COUNT: Record<InboxSectionTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  attention: "bg-git-modified/15 text-git-modified",
  danger: "bg-git-removed/15 text-git-removed",
};

const TONE_ICON: Record<InboxSectionTone, string> = {
  neutral: "text-muted-foreground",
  attention: "text-git-modified",
  danger: "text-git-removed",
};

export function InboxSection({
  icon: Icon,
  title,
  count,
  tone = "neutral",
  emptyHint,
  loading = false,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  count: number;
  tone?: InboxSectionTone;
  emptyHint: string;
  loading?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-xl border border-border/60 bg-card"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <Icon className={cn("size-4 shrink-0", count > 0 ? TONE_ICON[tone] : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <span
          className={cn(
            "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
            count > 0 ? TONE_COUNT[tone] : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/60">
          {count === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              {loading ? "…" : emptyHint}
            </p>
          ) : (
            <div className="divide-y divide-border/40">{children}</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
