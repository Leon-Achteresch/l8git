import { describe, expect, it } from "vitest";
import { accountScope, isQuietHour, isSnoozed, reviewProgress, subjectKey } from "./store";
import type { HubAccount } from "@/lib/hub/types";
const a: HubAccount = { provider: "github", host: "github.com", login: "alice", name: null, avatar_url: null };
describe("review memory", () => {
  it("retains unchanged content across a rebase and invalidates changed or removed files", () => {
    const result = reviewProgress({ head: "old", reviewedAt: 1, files: { "a.ts": "blob1", "b.ts": "blob2", "removed.ts": "blob3" } }, [{ path: "a.ts", fingerprint: "blob1" }, { path: "b.ts", fingerprint: "changed" }, { path: "new.ts", fingerprint: "blob4" }]);
    expect(result).toEqual({ reviewed: ["a.ts"], changed: ["b.ts"], unseen: ["new.ts"], removed: ["removed.ts"] });
  });
  it("isolates hosts, accounts, repositories, and issue/PR number spaces", () => {
    expect(accountScope(a, "A/B")).toBe(accountScope({ ...a, host: "GITHUB.COM" }, "a/b"));
    expect(accountScope(a, "a/b")).not.toBe(accountScope({ ...a, login: "bob" }, "a/b"));
    expect(subjectKey(a, "a/b", "issue", 1)).not.toBe(subjectKey(a, "a/b", "pull", 1));
  });
});
describe("notification conditions", () => {
  it("wakes snoozed subjects after timeout or a changed event fingerprint", () => {
    expect(isSnoozed({ until: 100 }, "x", 99)).toBe(true);
    expect(isSnoozed({ until: 100 }, "x", 100)).toBe(false);
    expect(isSnoozed({ untilChangedFrom: "running" }, "failed")).toBe(false);
    expect(isSnoozed({ untilChangedFrom: "running" }, "running")).toBe(true);
  });
  it("handles overnight quiet hours with an exclusive end", () => {
    const quiet = { enabled: true, startMinute: 22 * 60, endMinute: 8 * 60 };
    expect(isQuietHour(quiet, new Date(2026, 1, 1, 23))).toBe(true);
    expect(isQuietHour(quiet, new Date(2026, 1, 1, 7, 59))).toBe(true);
    expect(isQuietHour(quiet, new Date(2026, 1, 1, 8))).toBe(false);
    expect(isQuietHour(quiet, new Date(2026, 1, 1, 12))).toBe(false);
  });
});
