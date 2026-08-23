import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useInboxPaths } from "@/components/inbox/use-inbox-paths";
import { inboxBadgeCount } from "@/lib/inbox";
import { useInboxStore } from "@/lib/inbox-store";
import { cn } from "@/lib/utils";

const INITIAL_LOAD_DELAY_MS = 1500;

export function InboxIndicator() {
  const { t } = useTranslation();
  const paths = useInboxPaths();
  const sections = useInboxStore((s) => s.sections);
  const ensureFresh = useInboxStore((s) => s.ensureFresh);

  useEffect(() => {
    if (paths.length === 0) return;
    const timer = window.setTimeout(() => ensureFresh(paths), INITIAL_LOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ensureFresh, paths]);

  const count = inboxBadgeCount(sections);
  if (count === 0) return null;

  const label = t("inbox.indicator", {
    reviews: sections.reviewRequested.length,
    failures: sections.redRuns.length,
  });

  return (
    <Link
      to="/inbox"
      title={label}
      aria-label={label}
      className={cn(
        "relative inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium tabular-nums transition-all duration-150",
        sections.redRuns.length > 0
          ? "text-[var(--git-removed)] hover:bg-foreground/10"
          : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
      )}
    >
      <span className="relative inline-flex size-4 items-center justify-center">
        <Inbox className="size-4 shrink-0" strokeWidth={2} />
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 size-1.5 rounded-full",
            sections.redRuns.length > 0 ? "bg-[var(--git-removed)]" : "bg-primary/80",
          )}
          aria-hidden
        />
      </span>
      {count}
    </Link>
  );
}
