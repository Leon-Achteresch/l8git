import { GitCommitHorizontal, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { parseCommitInspectMetadata } from "@/lib/commit-inspect-metadata";

export function CommitInspectMessage({ message }: { message: string }) {
  const { t, i18n } = useTranslation();
  const { hash, author, date, subject, body } =
    parseCommitInspectMetadata(message);
  const parsedDate = date ? new Date(date) : null;
  const formattedDate =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(parsedDate)
      : date;

  return (
    <section className="shrink-0 space-y-3 border-b border-border/60 px-5 py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        {hash && (
          <span
            title={hash}
            className="inline-flex items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 font-mono text-[11px] text-foreground/75"
          >
            <GitCommitHorizontal className="size-3.5" />
            {hash.slice(0, 8)}
          </span>
        )}
        {author && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <UserRound className="size-3 shrink-0" />
            <span className="truncate">{author}</span>
          </span>
        )}
        {formattedDate && (
          <time
            className="text-muted-foreground/75"
            dateTime={
              parsedDate && !Number.isNaN(parsedDate.getTime())
                ? parsedDate.toISOString()
                : undefined
            }
          >
            {formattedDate}
          </time>
        )}
      </div>
      <h2 className="break-words text-[17px] font-semibold leading-snug tracking-tight text-foreground">
        {subject || "—"}
      </h2>
      {body && (
        <div className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
          {body}
        </div>
      )}
      <details className="text-[11px] text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("commitInspect.metadata")}
        </summary>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/40 p-3 font-mono text-[10px] leading-relaxed">
          {message}
        </pre>
      </details>
    </section>
  );
}
