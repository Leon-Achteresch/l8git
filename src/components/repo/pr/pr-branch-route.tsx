import { Check, Copy, GitBranch, GitMerge } from "lucide-react";
import { useState } from "react";

export function PrBranchRoute({ head, base }: { head: string; base: string }) {
  const [copiedHead, setCopiedHead] = useState(false);
  const [copiedBase, setCopiedBase] = useState(false);

  const copyBranch = (name: string, isHead: boolean) => {
    void navigator.clipboard.writeText(name);
    if (isHead) {
      setCopiedHead(true);
      setTimeout(() => setCopiedHead(false), 1500);
    } else {
      setCopiedBase(true);
      setTimeout(() => setCopiedBase(false), 1500);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-0.5 shadow-2xs backdrop-blur-xs">
      <div className="group flex items-center gap-1">
        <GitBranch className="h-3 w-3 text-muted-foreground/70" />
        <button
          type="button"
          onClick={() => copyBranch(head, true)}
          title={`Copy "${head}"`}
          className="flex items-center gap-1 rounded font-mono text-[11px] font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <span className="max-w-[140px] truncate">{head}</span>
          {copiedHead ? (
            <Check className="h-2.5 w-2.5 text-emerald-400" />
          ) : (
            <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
          )}
        </button>
      </div>

      <div className="flex items-center text-muted-foreground/50 px-0.5">
        <GitMerge className="h-3 w-3" />
      </div>

      <div className="group flex items-center gap-1">
        <button
          type="button"
          onClick={() => copyBranch(base, false)}
          title={`Copy "${base}"`}
          className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
        >
          <span className="max-w-[140px] truncate">{base}</span>
          {copiedBase ? (
            <Check className="h-2.5 w-2.5 text-emerald-400" />
          ) : (
            <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary/70" />
          )}
        </button>
      </div>
    </div>
  );
}
