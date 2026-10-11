/** Small, deterministic helpers shared by the composer and split-commit editor. */
export const COMMIT_TYPES = [
  "feat", "fix", "docs", "refactor", "perf", "test", "build", "ci", "style", "chore", "revert",
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number];
export type CommitMessageParts = { subject: string; body: string };

export function splitCommitMessage(message: string): CommitMessageParts {
  const normalized = message.replace(/\r\n?/g, "\n");
  const firstBreak = normalized.indexOf("\n");
  if (firstBreak < 0) return { subject: normalized, body: "" };
  const rest = normalized.slice(firstBreak + 1);
  return {
    subject: normalized.slice(0, firstBreak),
    // Treat just one blank line as the separator; preserve the author's body.
    body: rest.startsWith("\n") ? rest.slice(1) : rest,
  };
}

export function joinCommitMessage(subject: string, body: string): string {
  return body.length > 0 ? `${subject}\n\n${body}` : subject;
}

export function normalizedCommitMessage(message: string): string {
  const { subject, body } = splitCommitMessage(message);
  return joinCommitMessage(subject.trim(), body.trim()).trim();
}

export type ConventionalSubject = {
  type: string;
  scope: string;
  breaking: boolean;
  description: string;
};

export function readConventionalSubject(subject: string): ConventionalSubject | null {
  const match = /^([a-z][a-z\d-]*)(?:\(([^()\r\n]+)\))?(!)?:\s*(.*)$/i.exec(subject);
  if (!match) return null;
  return {
    type: match[1],
    scope: match[2] ?? "",
    breaking: match[3] === "!",
    description: match[4],
  };
}

export function updateConventionalSubject(
  subject: string,
  changes: { type?: string | null; scope?: string; breaking?: boolean },
): string {
  const current = readConventionalSubject(subject);
  const type = changes.type === undefined ? current?.type : changes.type;
  const description = current?.description ?? subject;
  if (!type) return description;
  const scope = (changes.scope ?? current?.scope ?? "").replace(/[()\r\n]/g, "").trim();
  const breaking = changes.breaking ?? current?.breaking ?? false;
  return `${type}${scope ? `(${scope})` : ""}${breaking ? "!" : ""}: ${description}`;
}

export type CommitInsightCode =
  | "longSubject"
  | "vagueSubject"
  | "missingDescription"
  | "placeholder"
  | "longBodyLines"
  | "breakingExplanation"
  | "trailingWhitespace";

export type CommitInsight = { code: CommitInsightCode; count?: number; lines?: string };

export function inspectCommitMessage(subject: string, body: string): {
  subjectLength: number;
  conventional: ConventionalSubject | null;
  insights: CommitInsight[];
} {
  const conventional = readConventionalSubject(subject);
  const description = conventional?.description ?? subject;
  const subjectLength = Array.from(subject).length;
  const insights: CommitInsight[] = [];
  if (subjectLength > 72) insights.push({ code: "longSubject", count: subjectLength });
  if (conventional && !description.trim()) insights.push({ code: "missingDescription" });
  if (/^(?:wip|fix|fixes|update|updates|changes?|test|testing|misc|arbeit|änderungen|anpassungen)[.!\s]*$/i.test(description.trim())) {
    insights.push({ code: "vagueSubject" });
  }
  if (/<(?:subject|summary|description|scope|what|why|change)[^>]*>|\[(?:subject|summary|description|describe|what|why)[^\]]*\]|\b(?:TODO|TBD)\b/i.test(`${subject}\n${body}`)) {
    insights.push({ code: "placeholder" });
  }
  const longLines = body.split("\n").flatMap((line, index) => {
    // URLs, trailers and fenced/indented code are intentionally left alone.
    if (Array.from(line).length <= 100 || /https?:\/\/|^\s{4}|^\t|^```|^[\w-]+: /.test(line)) return [];
    return [index + 1];
  });
  if (longLines.length > 0) {
    insights.push({ code: "longBodyLines", count: longLines.length, lines: longLines.slice(0, 5).join(", ") });
  }
  if (conventional?.breaking && !/(?:^|\n)BREAKING[ -]CHANGE:\s*\S/i.test(body)) {
    insights.push({ code: "breakingExplanation" });
  }
  if (/[\t ]+$/.test(subject) || /[\t ]+$/m.test(body)) insights.push({ code: "trailingWhitespace" });
  return { subjectLength, conventional, insights };
}

export type CommitPreflightReason =
  | "missingSubject"
  | "emptyIndex"
  | "conflicts"
  | "amendUnavailable"
  | "amendTargetChanged"
  | "unchangedAmend";

export function commitPreflight(input: {
  message: string;
  stagedFiles: number;
  conflictFiles: number;
  amend?: { hash: string; commitMessage: string };
  headHash?: string | null;
}): CommitPreflightReason | null {
  if (input.conflictFiles > 0) return "conflicts";
  if (!splitCommitMessage(input.message).subject.trim()) return "missingSubject";
  if (!input.amend) return input.stagedFiles > 0 ? null : "emptyIndex";
  if (input.headHash === null) return "amendUnavailable";
  if (input.headHash !== undefined && input.headHash !== input.amend.hash) return "amendTargetChanged";
  if (input.stagedFiles === 0 && normalizedCommitMessage(input.message) === normalizedCommitMessage(input.amend.commitMessage)) {
    return "unchangedAmend";
  }
  return null;
}

/** Adds an editable structure without replacing text the author already wrote. */
export function addCommitBodyTemplate(body: string, template: string): string {
  return body.trim() ? `${body.replace(/\s+$/, "")}\n\n${template}` : template;
}

export function addCommitTrailer(body: string, key: "Refs" | "Closes" | "BREAKING CHANGE", value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return body;
  const trailer = `${key}: ${cleaned}`;
  if (body.split(/\r?\n/).some((line) => line.trim() === trailer)) return body;
  const trimmed = body.replace(/\s+$/, "");
  const lastLine = trimmed.split("\n").slice(-1)[0] ?? "";
  const separator = /^[\w-]+(?:[ -][\w-]+)*: /.test(lastLine) ? "\n" : "\n\n";
  return trimmed ? `${trimmed}${separator}${trailer}` : trailer;
}
