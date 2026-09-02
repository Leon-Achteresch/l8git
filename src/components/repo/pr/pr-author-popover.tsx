import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelative } from "@/lib/format";
import { useTranslation } from "react-i18next";

export function PrAuthorPopover({
  author,
  authorAvatar,
  createdAt,
}: {
  author: string;
  authorAvatar: string | null;
  createdAt: string;
}) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <CommitAvatar url={authorAvatar} name={author} size="xs" />
          <span className="font-semibold text-foreground hover:underline">{author}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-3 shadow-lg border-border/80">
        <div className="flex items-center gap-3">
          <CommitAvatar url={authorAvatar} name={author} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-foreground">{author}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("prInspect.openedPR")} {formatRelative(createdAt)}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
