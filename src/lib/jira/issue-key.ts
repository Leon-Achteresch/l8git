/**
 * Issue-key handling. The same shape is enforced again in Rust before a key
 * reaches a URL — this copy exists so the UI can reject typos early and so the
 * tool layer can allow-list keys without a round trip.
 */

const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,49}-\d{1,10}$/;
const ISSUE_KEY_IN_TEXT = /\b[A-Z][A-Z0-9_]{0,49}-\d{1,10}\b/g;

/** Returns the canonical (upper-case) key, or `null` when the input is not one. */
export function normalizeIssueKey(input: string): string | null {
  const key = input.trim().toUpperCase();
  return ISSUE_KEY.test(key) ? key : null;
}

/**
 * Accepts what a user actually pastes: a bare key, a `/browse/KEY` link, or a
 * `selectedIssue=KEY` board URL.
 */
export function parseIssueRef(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const direct = normalizeIssueKey(raw);
  if (direct) return direct;
  const fromBrowse = /\/browse\/([A-Za-z][A-Za-z0-9_]{0,49}-\d{1,10})/.exec(raw);
  if (fromBrowse) return normalizeIssueKey(fromBrowse[1]);
  const fromQuery = /[?&]selectedIssue=([A-Za-z][A-Za-z0-9_]{0,49}-\d{1,10})/.exec(raw);
  if (fromQuery) return normalizeIssueKey(fromQuery[1]);
  return null;
}

/**
 * Collects issue keys out of free text such as a branch name or commit subject.
 * Used to offer a one-click link instead of making the user type the key.
 */
export function extractIssueKeys(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.toUpperCase().matchAll(ISSUE_KEY_IN_TEXT)) {
    const key = normalizeIssueKey(match[0]);
    if (key) seen.add(key);
  }
  return [...seen];
}

export function issueBrowseUrl(baseUrl: string, key: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base ? `${base}/browse/${key}` : "";
}
