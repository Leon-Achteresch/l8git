import { PopIn } from "@/components/motion/pop-in";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WorktreeEntry } from "@/lib/repo-store";

export function WorktreeStatusBadge({ entry }: { entry: WorktreeEntry }) {
  const badges: React.ReactNode[] = [];

  if (entry.is_main) {
    badges.push(
      <PopIn key="main" delay={0}>
        <span className="inline-flex items-center rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          Main
        </span>
      </PopIn>,
    );
  }

  if (entry.is_locked) {
    const badge = (
      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        Gesperrt
      </span>
    );
    badges.push(
      <PopIn key="locked" delay={0.04}>
        {entry.lock_reason ? (
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent className="max-w-[200px] text-xs">
              {entry.lock_reason}
            </TooltipContent>
          </Tooltip>
        ) : (
          badge
        )}
      </PopIn>,
    );
  }

  if (entry.is_prunable) {
    const badge = (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
          "bg-destructive/15 text-destructive",
        )}
      >
        Prunable
      </span>
    );
    badges.push(
      <PopIn key="prunable" delay={0.08}>
        {entry.prunable_reason ? (
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent className="max-w-[200px] text-xs">
              {entry.prunable_reason}
            </TooltipContent>
          </Tooltip>
        ) : (
          badge
        )}
      </PopIn>,
    );
  }

  if (badges.length === 0) return null;

  return <div className="flex flex-wrap gap-1">{badges}</div>;
}
