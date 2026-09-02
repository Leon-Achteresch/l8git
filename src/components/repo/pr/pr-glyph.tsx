import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";

export type DisplayState = "open" | "draft" | "merged" | "closed";

export function PrGlyph({ state }: { state: DisplayState }) {
  if (state === "merged") {
    return <GitMerge className="h-3.5 w-3.5" />;
  }
  if (state === "closed") {
    return <GitPullRequestClosed className="h-3.5 w-3.5" />;
  }
  if (state === "draft") {
    return <GitPullRequestDraft className="h-3.5 w-3.5" />;
  }
  return <GitPullRequest className="h-3.5 w-3.5" />;
}
