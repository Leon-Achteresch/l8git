import { eventsSinceVisit, groupSubjectEvents, type EventGroup, type SubjectEvent } from "@/lib/github-expansion/events";
import { isSnoozed, type SubjectState } from "@/lib/github-expansion/store";
import type { HubNotification } from "@/lib/hub/types";

export type InboxSection = "pinned" | "me" | "others" | "other" | "snoozed";
export type InboxGroup = { key: string; items: HubNotification[]; latest: HubNotification; section: InboxSection; priority: number; newSinceVisit: boolean; kinds: string[] };

const ME = new Set(["review_requested", "assign", "mention", "team_mention", "approval_requested", "security_alert", "ci_activity"]);
const OTHERS = new Set(["author", "comment", "state_change", "manual", "subscribed"]);

/** Provider reason → who must act next; a private override always wins. */
export function waitingOn(reason: string, override?: "me" | "others"): "me" | "others" | null {
  if (override) return override;
  if (ME.has(reason)) return "me";
  if (OTHERS.has(reason)) return "others";
  return null;
}

/** Provider notification → canonical subject event. The state fingerprint keeps a new reason/update distinct. */
export function toSubjectEvent(n: HubNotification, subject: string): SubjectEvent {
  return { id: n.id, subject, kind: n.reason, timestamp: Date.parse(n.updatedAt), title: n.title, stateFingerprint: `${n.reason}|${n.updatedAt}`, unread: n.unread };
}

/**
 * Groups notifications by subject via canonical `groupSubjectEvents` (dedupes repeated thread ids, keeps
 * every distinct event), then orders by pin, priority, recency. `newSinceVisit` uses `eventsSinceVisit`, so a
 * first visit (`lastVisit` null) flags nothing. `keyOf` maps a notification to its subject key.
 */
export function groupInbox(
  list: HubNotification[],
  keyOf: (n: HubNotification) => string,
  subjects: Record<string, SubjectState | undefined>,
  lastVisit: number | null,
  now = Date.now(),
): InboxGroup[] {
  const byId = new Map(list.map((n) => [n.id, n]));
  const events = list.map((n) => toSubjectEvent(n, keyOf(n)));
  const fresh = new Set(eventsSinceVisit(events, lastVisit ?? undefined).map((g) => g.subject));
  const groups: InboxGroup[] = groupSubjectEvents(events).map((g) => {
    const items = g.events.map((e) => byId.get(e.id)!);
    const latest = items[0];
    const s = subjects[g.subject];
    const snoozed = isSnoozed(s?.snooze, latest.updatedAt, now);
    const who = items.map((i) => waitingOn(i.reason, s?.waiting)).find(Boolean) ?? null;
    const section: InboxSection = snoozed ? "snoozed" : s?.pinned ? "pinned" : who === "me" ? "me" : who === "others" ? "others" : "other";
    return { key: g.subject, items, latest, section, priority: s?.priority ?? 0, newSinceVisit: fresh.has(g.subject), kinds: g.kinds };
  });
  return groups.sort((a, b) => b.priority - a.priority || Date.parse(b.latest.updatedAt) - Date.parse(a.latest.updatedAt));
}

/** 37: return summary — meaningful events newer than the previous visit, grouped by subject; empty on first visit. */
export function returnSummary(list: HubNotification[], keyOf: (n: HubNotification) => string, lastVisit: number | null): EventGroup[] {
  return eventsSinceVisit(list.map((n) => toSubjectEvent(n, keyOf(n))), lastVisit ?? undefined);
}

/** Snooze presets resolved in local time. */
export function snoozeUntil(preset: "1h" | "tomorrow" | "week", now = new Date()): number {
  if (preset === "1h") return now.getTime() + 3_600_000;
  const d = new Date(now);
  d.setDate(d.getDate() + (preset === "tomorrow" ? 1 : ((8 - d.getDay()) % 7 || 7)));
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}
