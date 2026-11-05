import type { RangeReviewComment } from "@/lib/github-expansion/api";
import { sortDrafts, type ReviewDraftComment } from "@/lib/pr-review-drafts";

export type SubmitPlan =
  | { kind: "legacy" }
  | { kind: "pinned"; commitId: string; comments: RangeReviewComment[]; headMoved: boolean }
  | { kind: "mixed"; commits: string[] };

/**
 * GitHub drafts anchored at a known head are submitted with that `commit_id`, so a later push never re-targets
 * their lines. Drafts from different heads (or pinned mixed with unpinned) cannot form one review: refused.
 */
export function planReviewSubmission(drafts: readonly ReviewDraftComment[], provider: string | undefined, currentHead: string | undefined): SubmitPlan {
  if (provider !== "github") return { kind: "legacy" };
  const live = sortDrafts([...drafts]).filter((d) => d.body.trim());
  const commits = [...new Set(live.map((d) => d.commitId ?? ""))];
  if (!commits.some(Boolean)) return { kind: "legacy" };
  if (commits.length > 1) return { kind: "mixed", commits };
  const commitId = commits[0];
  return {
    kind: "pinned",
    commitId,
    headMoved: !!currentHead && currentHead !== commitId,
    comments: live.map((d) => ({
      path: d.filePath, body: d.body.trim(), line: d.line, side: d.side ?? "RIGHT",
      ...(d.startLine === undefined ? {} : { start_line: d.startLine, start_side: d.startSide ?? d.side ?? "RIGHT" }),
    })),
  };
}
