import { forwardRef, memo, type ComponentPropsWithoutRef } from "react";
import { useLanguage } from "@/lib/i18n";
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
  useLanguage();
  const gravatarUrl = useGravatarUrl(email ?? "");
  const remoteAvatar = authorAvatar?.trim() || undefined;
  return (
    <div ref={ref} {...rest} className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
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
        title={formatDate(date)}
        className="shrink-0 tabular-nums"
      >
        {formatRelative(date)}
      </time>
    </div>
  );
});

export const CommitAuthorDate = memo(CommitAuthorDateInner);
