import { SpinIcon } from "@/components/motion/kit";
import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/error-toast";
import { formatDate, formatRelative } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";
import { Check, Copy, GitCommit, Loader2 } from "lucide-react";
import { m } from "motion/react";
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
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const copyHash = (hash: string) => {
    void navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

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
        <SpinIcon icon={Loader2} className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <GitCommit className="h-8 w-8 text-muted-foreground/40" />
        <span>{t("pr.noCommits")}</span>
      </m.div>
    );
  }

  return (
    <ScrollArea className="h-full bg-background">
      <ul className="divide-y divide-border/40 p-2">
        {commits.map((c, i) => (
          <m.li
            key={c.hash}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02, duration: 0.15 }}
            className="group flex min-w-0 items-center gap-3 rounded-xl px-3.5 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <CommitAvatar url={c.author_avatar} name={c.author} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                {c.subject}
              </span>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                <span className="truncate font-medium">{c.author}</span>
                <span className="opacity-30">·</span>
                <time
                  dateTime={c.date}
                  title={formatDate(c.date)}
                  className="font-mono tabular-nums"
                >
                  {formatRelative(c.date)}
                </time>
              </div>
            </div>

            <button
              type="button"
              onClick={() => copyHash(c.hash)}
              className="flex items-center gap-1 shrink-0 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
              title={`Copy ${c.hash}`}
            >
              <span>{c.short_hash}</span>
              {copiedHash === c.hash ? (
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              ) : (
                <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </m.li>
        ))}
      </ul>
    </ScrollArea>
  );
}
