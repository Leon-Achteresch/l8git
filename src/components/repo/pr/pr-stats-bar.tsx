import { Check, Copy, GitCommit, Globe, Shield } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import type { PullRequestDetail } from "./pull-request-inspect-detail";

export function PrStatsBar({ detail }: { detail: PullRequestDetail }) {
  const [copiedSha, setCopiedSha] = useState(false);

  const copySha = (sha: string) => {
    void navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 1500);
  };

  return (
    <m.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-wrap items-center gap-2 text-[11px]"
    >
      {detail.head_sha && (
        <button
          type="button"
          onClick={() => copySha(detail.head_sha)}
          className="group inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
          title={`Copy full SHA: ${detail.head_sha}`}
        >
          <GitCommit className="h-3 w-3 text-muted-foreground/70" />
          <span>{detail.head_sha.slice(0, 7)}</span>
          {copiedSha ? (
            <Check className="h-2.5 w-2.5 text-emerald-400" />
          ) : (
            <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
          )}
        </button>
      )}

      {detail.provider && (
        <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2 py-0.5 text-muted-foreground">
          <Globe className="h-3 w-3 opacity-60" />
          <span className="capitalize">{detail.provider}</span>
        </span>
      )}

      {detail.mergeable !== null && (
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
            detail.mergeable
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/20 bg-rose-500/10 text-rose-400"
          }`}
        >
          <Shield className="h-3 w-3" />
          <span>{detail.mergeable ? "Clean Merge" : "Conflicts"}</span>
        </span>
      )}
    </m.div>
  );
}
