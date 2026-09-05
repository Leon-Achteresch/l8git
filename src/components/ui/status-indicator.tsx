import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type StatusTone = "idle" | "success" | "working" | "warning" | "error";

const toneDot: Record<StatusTone, string> = {
  idle: "bg-muted-foreground/40",
  success: "bg-emerald-500",
  working: "bg-sky-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
};

/**
 * Small trust signal: colored dot + label + optional tooltip.
 * Used for sync state, save state, security state, background work.
 */
export function StatusIndicator({
  tone = "idle",
  label,
  hint,
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  label: string;
  hint?: string;
  pulse?: boolean;
  className?: string;
}) {
  const body = (
    <span
      role="status"
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 text-[11px] font-medium text-muted-foreground tabular-nums",
        className
      )}
    >
      <span className="relative flex size-1.5">
        {pulse && (
          <span
            aria-hidden
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              toneDot[tone]
            )}
          />
        )}
        <span
          aria-hidden
          className={cn("relative inline-flex size-1.5 rounded-full", toneDot[tone])}
        />
      </span>
      <span className="max-w-40 truncate">{label}</span>
    </span>
  );

  if (!hint) return body;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{body}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="font-medium">{hint}</span>
      </TooltipContent>
    </Tooltip>
  );
}
