import { groupInlineThreads, type PrComment } from "@/lib/pr-threads";

export type ReviewTask = {
  id: string;
  file: string;
  line: number;
  author: string;
  body: string;
  replies: number;
  /** Provider thread state; "unknown" when the provider exposes no resolution state. */
  remote: "open" | "resolved" | "unknown";
};

/**
 * Inline review threads as a personal to-do list. Remotely resolved threads are dropped;
 * local "done" never touches the provider.
 */
export function reviewTasks(comments: PrComment[], threads: { id: string; resolved: boolean; comment_ids: string[] }[] | null): ReviewTask[] {
  const byComment = new Map<string, { id: string; resolved: boolean }>();
  for (const th of threads ?? []) for (const c of th.comment_ids) byComment.set(c, th);
  const out: ReviewTask[] = [];
  for (const g of groupInlineThreads(comments)) {
    const first = g.comments[0];
    if (!first) continue;
    const remoteThread = g.comments.map((c) => byComment.get(c.id)).find(Boolean);
    if (remoteThread?.resolved) continue;
    out.push({
      id: remoteThread?.id ?? `c:${first.id}`,
      file: g.filePath,
      line: g.line,
      author: first.author,
      body: first.body,
      replies: g.comments.length - 1,
      remote: threads === null ? "unknown" : remoteThread ? "open" : "unknown",
    });
  }
  return out;
}
