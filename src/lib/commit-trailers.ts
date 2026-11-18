export type CoAuthor = { name: string; email: string };

export type CoAuthorDraftLine = {
  field: "subject" | "body";
  line: number;
  start: number;
  text: string;
  formatHint: boolean;
  placementHint: boolean;
};

const coAuthorKey = /^\s*co[-_ \t]?authore?d?[-_ \t]?by(?=[\s:=]|$)/i;
const coAuthorForm = /^co-authored-by:[ \t]*[^<>\r\n]+?<[^<>\s@]+@[^<>\s@]+>[ \t]*$/i;

function isCoAuthorCandidate(text: string): boolean {
  const key = coAuthorKey.exec(text);
  return !!key && (/^co-authored-by$/i.test(key[0].trim()) || /^\s*[:=]/.test(text.slice(key[0].length)) || text.includes("<"));
}

/** Conservative editor guidance for a final block of standard Git trailers. */
export function inspectCoAuthorDraft(subject: string, body: string, bodyStartsAfterBlankLine = true): CoAuthorDraftLine[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;
  let blockStart = end;
  while (blockStart > 0 && lines[blockStart - 1].trim()) blockStart--;
  const finalBlock = (blockStart > 0 || bodyStartsAfterBlankLine) &&
    lines.slice(blockStart, end).every((line, index) =>
      /^[a-z\d-]+[ \t]*:/i.test(line) || isCoAuthorCandidate(line) || (index > 0 && /^[ \t]/.test(line)),
    );
  const result: CoAuthorDraftLine[] = [];
  const validForm = (text: string) =>
    coAuthorForm.test(text) && !!text.slice(text.indexOf(":") + 1, text.indexOf("<")).trim();
  if (isCoAuthorCandidate(subject)) {
    result.push({ field: "subject", line: 1, start: 0, text: subject, formatHint: !validForm(subject), placementHint: true });
  }
  let offset = 0;
  let fence: string | undefined;
  for (const [index, text] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (marker && !fence) fence = marker[1];
    else if (fence && marker?.[1].startsWith(fence) && !marker[2].trim()) fence = undefined;
    else if (!fence && isCoAuthorCandidate(text)) {
      const continuation = /^[ \t]+\S/.test(lines[index + 1] ?? "");
      result.push({
        field: "body", line: index + 1, start: offset, text,
        formatHint: !validForm(text) || continuation,
        placementHint: !finalBlock || index < blockStart,
      });
    }
    offset += text.length + 1;
  }
  return result;
}

export function parseCoAuthors(body: string): CoAuthor[] {
  const out: CoAuthor[] = [];
  for (const match of body.matchAll(/^co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/gim)) {
    if (!out.some((a) => a.email.toLowerCase() === match[2].toLowerCase())) {
      out.push({ name: match[1], email: match[2] });
    }
  }
  return out;
}

export function parseGitDate(raw: string): string | null {
  const m = raw.match(/^\w{3} (\w{3}) (\d{1,2}) (\d\d:\d\d:\d\d) (\d{4}) ([+-]\d{4})$/);
  const d = new Date(m ? `${m[1]} ${m[2]}, ${m[4]} ${m[3]} GMT${m[5]}` : raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
