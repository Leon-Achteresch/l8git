import type { CheckReminder } from "./store";

export type SubjectEvent = { id: string; subject: string; kind: string; timestamp: number; title: string; stateFingerprint: string; unread: boolean };
export type EventGroup = { subject: string; latest: SubjectEvent; events: SubjectEvent[]; unreadCount: number; kinds: string[] };
/** Notification, CI and review adapters must supply the same account-scoped PR subject key. */
export function groupSubjectEvents(events: SubjectEvent[]): EventGroup[] {
  const groups = new Map<string, Map<string, SubjectEvent>>();
  for (const event of events) {
    if (!Number.isFinite(event.timestamp)) continue;
    const subject = groups.get(event.subject) ?? new Map<string, SubjectEvent>();
    const current = subject.get(event.id);
    if (!current || current.timestamp <= event.timestamp) subject.set(event.id, event);
    groups.set(event.subject, subject);
  }
  return [...groups].map(([subject, map]) => {
    const entries = [...map.values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
    return { subject, latest: entries[0], events: entries, unreadCount: entries.filter(event => event.unread).length, kinds: [...new Set(entries.map(event => event.kind))] };
  }).sort((a, b) => b.latest.timestamp - a.latest.timestamp || a.subject.localeCompare(b.subject));
}
export function eventsSinceVisit(events: SubjectEvent[], lastVisitedAt: number | undefined): EventGroup[] {
  if (lastVisitedAt === undefined) return [];
  return groupSubjectEvents(events.filter(event => event.timestamp > lastVisitedAt));
}
export type ReminderCheck = { headSha: string; name: string; status: string; conclusion: string | null };
export function checkReminderReady(reminder: CheckReminder, checks: ReminderCheck[]): boolean {
  if (reminder.deliveredAt !== null) return false;
  const matching = checks.filter(check => check.headSha === reminder.headSha && check.name === reminder.checkName);
  if (!matching.length || matching.some(check => check.status !== "completed")) return false;
  if (reminder.when === "completed") return true;
  if (reminder.when === "success") return matching.every(check => check.conclusion === "success");
  return matching.some(check => check.conclusion === "failure" || check.conclusion === "timed_out" || check.conclusion === "action_required");
}
