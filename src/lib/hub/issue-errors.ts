import { formatBackendError } from '@/lib/backend-error';
import i18n from "@/lib/i18n";

/**
 * Turns a provider rejection on an issue write (hub.rs formats them as "<host> <status>: <message>")
 * into a sentence a user can act on. Anything unrecognised passes through unchanged.
 */
export function issueErrorMessage(e: unknown): string {
  const msg = formatBackendError(e);
  const status = / (\d{3}): /.exec(msg)?.[1];
  // GitHub: 410 "Issues are disabled for this repo"; Bitbucket: 404 "Repository has no issue tracker."
  if (status === "410" || /issues? (?:are|is) disabled|no issue tracker|issue tracker is (?:disabled|not enabled)/i.test(msg)) return i18n.t("hub.issue.errDisabled");
  // Keep the provider's own reason (SAML, locked issue, unknown sub-issue) after our sentence.
  const detail = msg.slice(msg.indexOf(`${status}: `) + 5).trim();
  if (status === "403") return `${i18n.t("hub.issue.errNoPermission")} (${detail})`;
  if (status === "404") return `${i18n.t("hub.issue.errNotFound")} (${detail})`;
  // 401 (expired token) and everything else pass through unchanged.
  return msg;
}
