import { forwardRef, memo, type ComponentPropsWithoutRef } from "react";
import { useRowT } from "@/lib/i18n";
import { formatDate, formatRelative } from "@/lib/format";
import { AuthorAvatarStack, type CoAuthor } from "./commit-author-hover";
import { useGravatarUrl } from "@/lib/gravatar";

const CommitAuthorDateInner = forwardRef<HTMLDivElement, {
  author: string;
  email?: string;
  authorAvatar?: string | null;
  date: string;
  coAuthor?: CoAuthor;
} & ComponentPropsWithoutRef<"div">>(function CommitAuthorDateInner({
  author,
  email,
  authorAvatar,
  date,
  coAuthor,
  ...rest
}, ref) {
  // Pooled, memoized author rows also need to refresh localized dates.
  const t = useRowT();
  const timeLabel = t("commitHover.committerDate");
  const gravatarUrl = useGravatarUrl(email ?? "");
  const remoteAvatar = authorAvatar?.trim() || undefined;
  return (
    <div ref={ref} {...rest} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <AuthorAvatarStack
        url={remoteAvatar ?? gravatarUrl}
        fallbackUrl={remoteAvatar ? (gravatarUrl ?? null) : undefined}
        name={author}
        coAuthor={coAuthor}
        size="xs"
      />
      <span className="min-w-0 max-w-[8rem] truncate">
        {author}
      </span>
      <span aria-hidden="true" className="opacity-40">
        ·
      </span>
      <time
        dateTime={date}
        title={`${timeLabel}: ${formatDate(date)}`}
        className="shrink-0 tabular-nums"
      >
        <span className="sr-only">{timeLabel}: </span>
        {formatRelative(date)}
      </time>
    </div>
  );
});

export const CommitAuthorDate = memo(CommitAuthorDateInner);
