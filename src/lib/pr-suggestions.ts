export type CommentSegment =
  | { kind: "text"; text: string }
  | { kind: "suggestion"; lines: string[] };

const SUGGESTION_FENCE = /^\s*```+\s*suggestion\s*$/i;
const CLOSING_FENCE = /^\s*```+\s*$/;

export function splitCommentBody(body: string): CommentSegment[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const segments: CommentSegment[] = [];
  let text: string[] = [];
  let suggestion: string[] | null = null;

  const flushText = () => {
    const joined = text.join("\n");
    if (joined.trim()) segments.push({ kind: "text", text: joined.trim() });
    text = [];
  };

  for (const line of lines) {
    if (suggestion === null) {
      if (SUGGESTION_FENCE.test(line)) {
        flushText();
        suggestion = [];
        continue;
      }
      text.push(line);
      continue;
    }
    if (CLOSING_FENCE.test(line)) {
      segments.push({ kind: "suggestion", lines: suggestion });
      suggestion = null;
      continue;
    }
    suggestion.push(line);
  }

  if (suggestion !== null) segments.push({ kind: "suggestion", lines: suggestion });
  flushText();
  return segments;
}

export function hasSuggestion(body: string): boolean {
  return splitCommentBody(body).some((segment) => segment.kind === "suggestion");
}

export function buildSuggestionBody(lineText: string, comment = ""): string {
  const head = comment.trim() ? `${comment.trim()}\n\n` : "";
  return `${head}\`\`\`suggestion\n${lineText}\n\`\`\``;
}

export function applySuggestionToContent(
  content: string,
  line: number,
  replacement: string[],
): string | null {
  if (!Number.isInteger(line) || line < 1) return null;
  const usesCrlf = content.includes("\r\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const endsWithNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (endsWithNewline) lines.pop();
  if (line > lines.length) return null;

  const next = [...lines.slice(0, line - 1), ...replacement, ...lines.slice(line)];
  const joined = next.join("\n") + (endsWithNewline ? "\n" : "");
  return usesCrlf ? joined.replace(/\n/g, "\r\n") : joined;
}
