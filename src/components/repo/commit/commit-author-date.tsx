import { memo } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatRelative } from "@/lib/format";
import { CommitAvatar } from "./commit-avatar";
import { useGravatarUrl } from "@/lib/gravatar";

function CommitAuthorDateInner({
  author,
  email,
  authorAvatar,
  date,
}: {
  author: string;
  email?: string;
  authorAvatar?: string | null;
  date: string;
}) {
  // Pooled, memoized author rows also need to refresh localized dates.
  useTranslation();
  const gravatarUrl = useGravatarUrl(email ?? "");
  const remoteAvatar = authorAvatar?.trim() || undefined;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
      <CommitAvatar
        url={remoteAvatar ?? gravatarUrl}
        fallbackUrl={remoteAvatar ? (gravatarUrl ?? null) : undefined}
        name={author}
        size="xs"
      />
      <span
        className="min-w-0 max-w-[8rem] truncate"
        title={email ? `${author} <${email}>` : author}
      >
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
}

export const CommitAuthorDate = memo(CommitAuthorDateInner);
