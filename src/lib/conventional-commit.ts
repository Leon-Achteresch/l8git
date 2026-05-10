const HEAD = /^([a-zA-Z]+)(\([^)]*\))?(!)?:(?:\s*)(.*)$/;

const KNOWN = new Set([
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
]);

const BREAKING_FOOTER = /(^|\r?\n)BREAKING[ -]CHANGE(\s|:)/i;

export type ConventionalParse = {
  typeKey: string | null;
  breaking: boolean;
  isRecognizedType: boolean;
};

export function splitConventionalSubjectDisplay(
  subject: string,
): { lead: string; body: string } | null {
  const m = subject.match(HEAD);
  if (!m) return null;
  const typeKey = m[1].toLowerCase();
  if (!KNOWN.has(typeKey)) return null;
  const lead = `${m[1]}${m[2] ?? ""}${m[3] ?? ""}:`;
  const body = (m[4] ?? "").replace(/^\s+/, "");
  return { lead, body };
}

export function parseConventionalCommit(
  subject: string,
  body: string,
): ConventionalParse {
  const breakingFooter = BREAKING_FOOTER.test(body);
  const m = subject.match(HEAD);
  if (!m) {
    return {
      typeKey: null,
      breaking: breakingFooter,
      isRecognizedType: false,
    };
  }
  const typeKey = m[1].toLowerCase();
  const subjectBreaking = m[3] === "!";
  return {
    typeKey,
    breaking: subjectBreaking || breakingFooter,
    isRecognizedType: KNOWN.has(typeKey),
  };
}
