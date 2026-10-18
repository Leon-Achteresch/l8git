import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { parseCommitInspectMetadata } from "@/lib/commit-inspect-metadata";
import { cn } from "@/lib/utils";

export function CommitInspectMessage({ message }: { message: string }) {
  const { t, i18n } = useTranslation();
  // Keyed by message so the next commit opens collapsed again.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === message;
  // The raw header without the message, which is shown formatted above it.
  const lines = message.split(/\r?\n/);
  const messageStart = lines.findIndex((line) => line.startsWith("    "));
  const rawHeader = (messageStart === -1 ? lines : lines.slice(0, messageStart))
    .join("\n")
    .trim();
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
    <section className="@container shrink-0 border-b border-border/60 px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpenFor(open ? null : message)}
        aria-expanded={open}
        title={
          subject
            ? `${subject}\n${t("commitInspect.metadata")}`
            : t("commitInspect.metadata")
        }
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        {hash && (
          <span className="hidden shrink-0 font-mono text-[11px] @xs:inline text-foreground/70">
            {hash.slice(0, 8)}
          </span>
        )}
        <span className="min-w-12 flex-1 truncate font-medium text-foreground">
          {subject || "—"}
        </span>
        {author && (
          <span className="hidden max-w-40 shrink-0 truncate @lg:inline">
            {author}
          </span>
        )}
        {formattedDate && (
          <time
            className="hidden shrink-0 text-muted-foreground/75 @md:inline"
            dateTime={
              parsedDate && !Number.isNaN(parsedDate.getTime())
                ? parsedDate.toISOString()
                : undefined
            }
          >
            {formattedDate}
          </time>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-1 pb-1.5 pt-2">
          {body && (
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
              {body}
            </div>
          )}
          {rawHeader && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/40 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {rawHeader}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
