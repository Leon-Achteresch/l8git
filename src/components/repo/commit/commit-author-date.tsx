import { formatDate, formatRelative } from "@/lib/format";
import { CommitAvatar } from "./commit-avatar";

export function CommitAuthorDate({
  author,
  email,
  avatarUrl,
  date,
}: {
  author: string;
  email?: string;
  avatarUrl: string | null | undefined;
  date: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <CommitAvatar url={avatarUrl} name={author} size="sm" />
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
