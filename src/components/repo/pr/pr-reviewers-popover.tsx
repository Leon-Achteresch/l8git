import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PrReviewer } from "@/lib/repo-store";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PrReviewersPopover({ reviewers }: { reviewers: PrReviewer[] }) {
  const { t } = useTranslation();
  const shown = reviewers.slice(0, 3);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer hover:opacity-80 transition-opacity"
          title={t("prInspect.reviewerTitle")}
        >
          {shown.length === 0 ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border/80 px-2 text-[10px] text-muted-foreground">
              <Users className="h-3 w-3" />
              {t("prInspect.reviewerTitle")}
            </span>
          ) : (
            shown.map((r, i) => (
              <span
                key={r.login}
                className="rounded-full ring-2 ring-background"
                style={{ marginLeft: i === 0 ? 0 : "-7px", zIndex: shown.length - i }}
              >
                <CommitAvatar url={r.avatar} name={r.login} size="xs" />
              </span>
            ))
          )}
          {reviewers.length > shown.length && (
            <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
              +{reviewers.length - shown.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3 shadow-lg border-border/80">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/50 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("prInspect.reviewerTitle")}
          </span>
          <span className="text-[10px] text-muted-foreground">{reviewers.length}</span>
        </div>
        {reviewers.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">{t("prInspect.reviewerEmpty")}</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviewers.map((r) => (
              <li key={r.login} className="flex items-center gap-2">
                <CommitAvatar url={r.avatar} name={r.login} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{r.login}</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
