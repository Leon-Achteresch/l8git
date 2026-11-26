export type CommentSegment =
  | { kind: "text"; text: string }
  | { kind: "suggestion"; lines: string[] };

const MARKDOWN_FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

export function splitCommentBody(body: string): CommentSegment[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const segments: CommentSegment[] = [];
  let text: string[] = [];
  let suggestion: string[] | null = null;
  let fence = "";

  const flushText = () => {
    const joined = text.join("\n");
    if (joined.trim()) segments.push({ kind: "text", text: joined.trim() });
    text = [];
  };

  for (const line of lines) {
    const match = MARKDOWN_FENCE.exec(line);
    if (fence) {
      const closes = match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim();
      if (suggestion === null) text.push(line);
      else if (closes) {
        segments.push({ kind: "suggestion", lines: suggestion });
        suggestion = null;
      } else suggestion.push(line);
      if (closes) fence = "";
    } else if (match && (match[1][0] === "~" || !match[2].includes("`"))) {
      fence = match[1];
      if (fence[0] === "`" && match[2].trim().toLowerCase() === "suggestion") {
        flushText();
        suggestion = [];
      } else text.push(line);
    } else text.push(line);
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
  let length = 3;
  for (const match of lineText.matchAll(/^[ \t]*(`{3,})[ \t]*\r?$/gm)) {
    length = Math.max(length, match[1].length + 1);
  }
  const fence = "`".repeat(length);
  return `${head}${fence}suggestion\n${lineText}\n${fence}`;
}

type ReviewLineEdit = {
  startLine: number;
  endLine: number;
  replacementLines: readonly string[];
  file?: string;
  expectedLines?: readonly string[];
};

/** Applies edits against original line numbers and copies untouched text verbatim. */
export function applyReviewLineEdits<T extends ReviewLineEdit>(
  content: string,
  edits: readonly T[],
  onStale?: (edit: T, reason: string) => void,
): string {
  if (!edits.length) return content;
  const sorted = [...edits].sort((a, b) => a.startLine - b.startLine);
  const bomLength = content.startsWith("\uFEFF") ? 1 : 0;
  const starts: number[] = content.length ? [bomLength] : [];
  const lastLine = sorted[sorted.length - 1].endLine;
  for (let pos = bomLength; starts.length <= lastLine; ) {
    const newline = content.indexOf("\n", pos);
    if (newline < 0 || newline + 1 >= content.length) break;
    pos = newline + 1;
    starts.push(pos);
  }
  const endOfLine = (line: number) => starts[line] ?? content.length;
  const ending = (end: number) => {
    if (content[end - 1] !== "\n") return "";
    return content[end - 2] === "\r" ? "\r\n" : "\n";
  };
  const parts: string[] = [];
  let previousLine = 0;
  let previousEnd = 0;
  const invalidLine = (line: string) => /[\r\n\0]/.test(line);
  for (const edit of sorted) {
    const { startLine, endLine, expectedLines, replacementLines } = edit;
    if (startLine <= previousLine && startLine >= 1) throw new RangeError("Suggestion ranges are invalid or overlap.");
    let reason: string | undefined;
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine)
        || startLine < 1 || endLine < startLine || endLine > starts.length) {
      reason = "Suggestion ranges are invalid or overlap.";
    } else if (expectedLines?.some(invalidLine) || replacementLines.some(invalidLine)) {
      reason = "Suggestion lines must contain plain text without embedded newlines.";
    } else if (expectedLines && (expectedLines.length !== endLine - startLine + 1 || expectedLines.some((line, i) => {
      const number = startLine + i;
      const end = endOfLine(number);
      const text = content.slice(starts[number - 1], end - ending(end).length);
      return text !== (number === 1 && bomLength ? line.replace(/^\uFEFF/, "") : line);
    }))) {
      reason = `Suggestion no longer matches ${edit.file}:${startLine}.`;
    }
    if (reason) {
      if (!onStale) throw new RangeError(reason);
      onStale(edit, reason);
      continue;
    }

    const start = starts[startLine - 1];
    const end = endOfLine(endLine);
    const defaultEnding = ending(endOfLine(startLine)) || ending(start) || "\n";
    parts.push(content.slice(previousEnd, start));
    for (let i = 0; i < replacementLines.length; i++) {
      const line = replacementLines[i];
      let eol = defaultEnding;
      if (i === replacementLines.length - 1) eol = ending(end);
      else if (startLine + i <= endLine) eol = ending(endOfLine(startLine + i)) || defaultEnding;
      parts.push(startLine === 1 && i === 0 && bomLength ? line.replace(/^\uFEFF/, "") : line, eol);
    }
    previousLine = endLine;
    previousEnd = end;
  }
  parts.push(content.slice(previousEnd));
  return parts.join("");
}

/** Replaces lines `startLine..line` (single line by default) with the suggestion. */
export function applySuggestionToContent(
  content: string,
  line: number,
  replacement: string[],
  startLine = line,
  expectedLines?: readonly string[],
): string | null {
  try {
    return applyReviewLineEdits(content, [{ startLine, endLine: line, replacementLines: replacement, expectedLines }]);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
