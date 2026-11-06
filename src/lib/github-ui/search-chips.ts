export const SEARCH_CHIPS = [
  { id: "open", token: "is:open" },
  { id: "pr", token: "is:pr" },
  { id: "issue", token: "is:issue" },
  { id: "authored", token: "author:@me" },
  { id: "review", token: "review-requested:@me" },
  { id: "reviewedBy", token: "reviewed-by:@me" },
  { id: "assigned", token: "assignee:@me" },
  { id: "mentioned", token: "mentions:@me" },
  { id: "team", token: "team-review-requested:" },
  { id: "draft", token: "draft:true" },
  { id: "noLabel", token: "no:label" },
] as const;

const tokens = (q: string) => q.trim().split(/\s+/).filter(Boolean);

/** Active chip tokens; prefix tokens (`team-review-requested:`) match any value. */
export function searchChips(q: string): Set<string> {
  const ts = tokens(q);
  return new Set(SEARCH_CHIPS.filter((c) => ts.some((t) => (c.token.endsWith(":") ? t.startsWith(c.token) : t === c.token))).map((c) => c.token));
}

export function toggleChip(q: string, token: string): string {
  const ts = tokens(q);
  const match = (t: string) => (token.endsWith(":") ? t.startsWith(token) : t === token);
  if (ts.some(match)) return ts.filter((t) => !match(t)).join(" ");
  // A prefix chip needs a value: append `org/team` placeholder the user edits.
  return [...ts, token.endsWith(":") ? `${token}ORG/TEAM` : token].join(" ");
}
