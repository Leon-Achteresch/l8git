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
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <CommitAvatar
        url={avatarUrl}
        fallbackUrl={avatarFallbackUrl}
        name={author}
        size="sm"
      />
      <span
        className="min-w-0 truncate"
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
