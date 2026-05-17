import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/error-toast";
import { formatDate, formatRelative } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type PrCommit = {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  author_avatar: string | null;
};

export function PullRequestCommitsTab({
  path,
  number,
}: {
  path: string;
  number: number;
}) {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<PrCommit[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<PrCommit[]>("pr_commits", { path, number })
      .then((res) => {
        if (!cancelled) setCommits(res);
      })
      .catch((e) => {
        if (!cancelled) {
          toastError(String(e));
          setCommits([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number]);

  if (loading && !commits) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      </div>
    );
  }
  if (!commits || commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("pr.noCommits")}
      </div>
    );
  }
  return (
    <ScrollArea className="h-full">
      <ul className="divide-y divide-border/50">
        {commits.map((c) => (
          <li
            key={c.hash}
            className="flex min-w-0 items-center gap-3 px-4 py-2.5"
          >
            <CommitAvatar url={c.author_avatar} name={c.author} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{c.subject}</span>
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{c.author}</span>
                <span className="opacity-40">·</span>
                <time
                  dateTime={c.date}
                  title={formatDate(c.date)}
                  className="tabular-nums"
                >
                  {formatRelative(c.date)}
                </time>
              </div>
            </div>
            <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {c.short_hash}
            </code>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
