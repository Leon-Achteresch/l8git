import { describe, expect, it } from "vitest";
import { checkReminderReady, eventsSinceVisit, groupSubjectEvents, type SubjectEvent } from "./events";
import type { CheckReminder } from "./store";
const event = (patch: Partial<SubjectEvent> = {}): SubjectEvent => ({ id: "a", subject: "PR-1", kind: "review", timestamp: 10, title: "Review", stateFingerprint: "x", unread: true, ...patch });
describe("inbox event grouping", () => {
  it("coalesces subjects and duplicate deliveries but retains distinct CI/review evidence", () => {
    const groups = groupSubjectEvents([event(), event({ timestamp: 12, unread: false }), event({ id: "b", kind: "ci", timestamp: 13 }), event({ id: "c", subject: "PR-2", timestamp: 11 })]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ subject: "PR-1", unreadCount: 1, kinds: ["ci", "review"] });
    expect(groups[0].events).toHaveLength(2);
  });
  it("does not invent missed events for a first visit", () => {
    expect(eventsSinceVisit([event()], undefined)).toEqual([]);
    expect(eventsSinceVisit([event(), event({ id: "b", timestamp: 20 })], 10)[0].events.map(e => e.id)).toEqual(["b"]);
  });
});
describe("commit-pinned check reminders", () => {
  const reminder: CheckReminder = { subject: "PR-1", headSha: "sha", checkName: "build", when: "success", deliveredAt: null };
  it("ignores stale commits and waits for all duplicate-name checks to complete", () => {
    expect(checkReminderReady(reminder, [{ headSha: "old", name: "build", status: "completed", conclusion: "success" }])).toBe(false);
    expect(checkReminderReady(reminder, [{ headSha: "sha", name: "build", status: "completed", conclusion: "success" }, { headSha: "sha", name: "build", status: "in_progress", conclusion: null }])).toBe(false);
    expect(checkReminderReady(reminder, [{ headSha: "sha", name: "build", status: "completed", conclusion: "success" }])).toBe(true);
    expect(checkReminderReady({ ...reminder, deliveredAt: 20 }, [{ headSha: "sha", name: "build", status: "completed", conclusion: "success" }])).toBe(false);
  });
});
