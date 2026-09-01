import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { ListRow } from "@/components/ui/list-row";
import { formatRelative } from "@/lib/format";
import type { PullRequest } from "@/lib/repo-store";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { memo } from "react";
import { PrGlyph, type DisplayState } from "./pr-glyph";
import { PrLabelChip } from "./pr-label-chip";
import { PrReviewerAvatarStack } from "./pr-reviewer-avatar-stack";

function getDisplayState(pr: PullRequest): DisplayState {
  if (pr.state === "merged") return "merged";
  if (pr.state === "closed") return "closed";
  if (pr.state === "draft" || pr.is_draft) return "draft";
  return "open";
}

const GLYPH_COLORS: Record<DisplayState, string> = {
  open: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  draft: "bg-muted text-muted-foreground border-border/70",
  merged: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  closed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export const PrRow = memo(function PrRow({
  pr,
  selected,
  onSelect,
}: {
  pr: PullRequest;
  selected: boolean;
  onSelect: (n: number) => void;
}) {
  const state = getDisplayState(pr);

  return (
    <div className="px-2 pb-1">
      <ListRow
        variant="accent"
        active={selected}
        onClick={() => onSelect(pr.number)}
        className={[
          "group relative items-start rounded-xl border px-3 py-2.5 transition-all cursor-pointer",
          selected
            ? "border-primary/50 bg-primary/8 shadow-xs"
            : "border-transparent bg-transparent hover:border-border/60 hover:bg-muted/30",
        ].join(" ")}
      >
        <AnimatePresence>
          {selected && (
            <m.span
              layoutId="pr-row-accent"
              className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary"
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ scaleY: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
            />
          )}
        </AnimatePresence>

        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border shadow-2xs ${GLYPH_COLORS[state]}`}
        >
          <PrGlyph state={state} />
        </span>

        <div className="min-w-0 flex-1 ml-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
              {pr.title}
            </span>
            {pr.labels.slice(0, 2).map((l) => (
              <PrLabelChip key={l} label={l} />
            ))}
            {pr.labels.length > 2 && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                +{pr.labels.length - 2}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono text-[10px] font-semibold text-muted-foreground/70">
              #{pr.number}
            </span>
            <span className="opacity-30">·</span>
            <CommitAvatar url={pr.author_avatar} name={pr.author} size="sm" />
            <span className="truncate max-w-[90px]">{pr.author}</span>
            <span className="opacity-30">·</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px]">
              <span className="rounded bg-muted/80 px-1.5 py-0 text-foreground/80">
                {pr.source_branch}
              </span>
              <ArrowRight className="h-2.5 w-2.5 opacity-50" />
              <span className="rounded bg-primary/10 px-1.5 py-0 text-primary">
                {pr.target_branch}
              </span>
            </span>
            <span className="opacity-30">·</span>
            <time className="shrink-0 tabular-nums">{formatRelative(pr.updated_at)}</time>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <PrReviewerAvatarStack reviewers={pr.reviewers} />
        </div>
      </ListRow>
    </div>
  );
});
