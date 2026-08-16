export type PrComment = {
  id: string;
  author: string;
  author_avatar: string | null;
  created_at: string;
  body: string;
  kind: string;
  file_path: string | null;
  line: number | null;
  in_reply_to?: string | null;
  thread_id?: string | null;
};

export type PrCommentThread = {
  id: string;
  filePath: string;
  line: number;
  replyTo: string | null;
  comments: PrComment[];
};

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function threadKey(comment: PrComment): string {
  const anchor = `${comment.file_path ?? ""}:${comment.line ?? 0}`;
  const id = trimmed(comment.thread_id) ?? trimmed(comment.in_reply_to);
  return id ? `${anchor}#${id}` : `${anchor}#line`;
}

function byCreatedAt(a: PrComment, b: PrComment): number {
  if (a.created_at === b.created_at) return a.id.localeCompare(b.id);
  return a.created_at < b.created_at ? -1 : 1;
}

export function isInlineComment(comment: PrComment): boolean {
  return (
    comment.kind === "inline" &&
    !!trimmed(comment.file_path) &&
    typeof comment.line === "number" &&
    comment.line > 0
  );
}

export function groupInlineThreads(comments: PrComment[]): PrCommentThread[] {
  const buckets = new Map<string, PrComment[]>();
  for (const comment of comments) {
    if (!isInlineComment(comment)) continue;
    const key = threadKey(comment);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(comment);
    else buckets.set(key, [comment]);
  }

  const threads: PrCommentThread[] = [];
  for (const [id, bucket] of buckets) {
    const sorted = [...bucket].sort(byCreatedAt);
    const root = sorted[0];
    threads.push({
      id,
      filePath: root.file_path ?? "",
      line: root.line ?? 0,
      replyTo: trimmed(root.thread_id) ?? trimmed(root.in_reply_to) ?? trimmed(root.id),
      comments: sorted,
    });
  }

  threads.sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath < b.filePath ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return byCreatedAt(a.comments[0], b.comments[0]);
  });
  return threads;
}

export function threadsForFile(
  threads: PrCommentThread[],
  filePath: string,
): PrCommentThread[] {
  return threads.filter((thread) => thread.filePath === filePath);
}

export function threadsByLine(
  threads: PrCommentThread[],
): Map<number, PrCommentThread[]> {
  const byLine = new Map<number, PrCommentThread[]>();
  for (const thread of threads) {
    const bucket = byLine.get(thread.line);
    if (bucket) bucket.push(thread);
    else byLine.set(thread.line, [thread]);
  }
  return byLine;
}
