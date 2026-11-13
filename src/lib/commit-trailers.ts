export type CoAuthor = { name: string; email: string };

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
