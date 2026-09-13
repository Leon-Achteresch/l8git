type InsertHandler = (text: string) => void;

export type MentionKind = "file" | "dir" | "range";

export interface ParsedMention {
  kind: MentionKind;
  path: string;
  start?: number;
  end?: number;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/gu, "/");
}

function resolveWithinRoot(repoRoot: string, rawPath: string): string | null {
  const root = normalizeSlashes(repoRoot).replace(/\/+$/u, "");
  let candidate = normalizeSlashes(rawPath.trim());
  if (!candidate) return null;

  if (/^[a-zA-Z]:\//u.test(candidate) || candidate.startsWith("//")) {
    return null;
  }
  if (candidate.startsWith("/")) {
    if (candidate !== root && !candidate.startsWith(`${root}/`)) return null;
    candidate = candidate.slice(root.length).replace(/^\/+/u, "");
  }

  const segments: string[] = [];
  for (const part of candidate.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.length ? `${root}/${segments.join("/")}` : root;
}

const RANGE_MENTION = /^(.+?)#L(\d+)(?:-L?(\d+))?$/u;

export function parseMentions(text: string, repoRoot: string): ParsedMention[] {
  if (!text) return [];
  const mentionPattern = /@([^\s@]+)/gu;
  const mentions: ParsedMention[] = [];
  for (const match of text.matchAll(mentionPattern)) {
    const raw = match[1];
    if (!raw) continue;
    const rangeMatch = RANGE_MENTION.exec(raw);
    if (rangeMatch) {
      const [, rawPath, startText, endText] = rangeMatch;
      const resolved = resolveWithinRoot(repoRoot, rawPath);
      if (!resolved) continue;
      const start = Number(startText);
      const end = endText ? Number(endText) : start;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) continue;
      mentions.push({ kind: "range", path: resolved, start, end });
      continue;
    }
    const resolved = resolveWithinRoot(repoRoot, raw);
    if (!resolved) continue;
    const kind: MentionKind = raw.endsWith("/") ? "dir" : "file";
    mentions.push({ kind, path: resolved });
  }
  return mentions;
}

export function toPromptReference(mention: ParsedMention): string {
  if (mention.kind === "range" && mention.start != null && mention.end != null) {
    return mention.start === mention.end
      ? `@${mention.path}#L${mention.start}`
      : `@${mention.path}#L${mention.start}-L${mention.end}`;
  }
  return `@${mention.path}`;
}

const handlers = new Set<InsertHandler>();

export function insertIntoAgentComposer(text: string): void {
  if (!text) return;
  for (const handler of [...handlers]) {
    try {
      handler(text);
    } catch {
      continue;
    }
  }
}

export function onAgentComposerInsert(handler: InsertHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
