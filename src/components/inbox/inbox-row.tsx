import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function InboxRow({
  repoName,
  title,
  meta,
  badges,
  relativeTime,
  tooltip,
  externalUrl,
  externalLabel,
  onOpen,
}: {
  repoName: string;
  title: string;
  meta: ReactNode;
  badges?: ReactNode;
  relativeTime: string;
  tooltip?: string;
  externalUrl?: string;
  externalLabel?: string;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={tooltip}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {repoName}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
            {title}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {relativeTime}
          </span>
          {externalUrl ? (
            <button
              type="button"
              title={externalLabel}
              aria-label={externalLabel}
              onClick={(event) => {
                event.stopPropagation();
                void openUrl(externalUrl);
              }}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <ExternalLink className="size-3" />
            </button>
          ) : null}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {meta}
          {badges}
        </span>
      </span>
    </div>
  );
}
