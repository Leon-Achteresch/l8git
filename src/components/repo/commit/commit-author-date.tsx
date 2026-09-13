import { memo } from "react";
import { formatDate, formatRelative } from "@/lib/format";
import { CommitAvatar } from "./commit-avatar";

function CommitAuthorDateInner({
  author,
  email,
  avatarUrl,
  avatarFallbackUrl,
  date,
}: {
  author: string;
  email?: string;
  avatarUrl: string | null | undefined;
  avatarFallbackUrl?: string | null | undefined;
  date: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
      <CommitAvatar
        url={avatarUrl}
        fallbackUrl={avatarFallbackUrl}
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
