import type { GitHookEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

export function GitHookStatusBadge({
  entry,
  isServer,
  className,
}: {
  entry: GitHookEntry;
  isServer?: boolean;
  className?: string;
}) {
  if (isServer) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground",
          className,
        )}
      >
        Server
      </span>
    );
  }
  if (!entry.exists) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60",
          className,
        )}
      >
        Nicht installiert
      </span>
    );
  }
  if (entry.is_enabled) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400",
          className,
        )}
      >
        Aktiv
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      Deaktiviert
    </span>
  );
}
