import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/platform/kv", () => ({
  platformStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  },
}));
import { readableCommitDraftJson, sanitizeCommitDrafts, useCommitMessagePrefs } from "./commit-message-prefs";

beforeEach(() => {
  memory.clear();
  useCommitMessagePrefs.setState({ drafts: {}, guidanceExpanded: false });
});

describe("repository commit drafts", () => {
  it("isolates drafts across repositories and seeds each only once", () => {
    const store = useCommitMessagePrefs.getState();
    store.seedDraft("/one", "feat: ");
    store.setMessage("/one", "feat: add login");
    store.seedDraft("/two", "fix: ");
    store.seedDraft("/one", "new template");
    expect(useCommitMessagePrefs.getState().drafts).toEqual({
      "/one": { message: "feat: add login" }, "/two": { message: "fix: " },
    });
  });

  it("supports sequential subject/body edits without stale-state loss", () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "Title");
    store.setMessage("/one", (message) => `${message}\n\nWhy`);
    store.setMessage("/one", (message) => message.replace("Title", "Better title"));
    expect(useCommitMessagePrefs.getState().drafts["/one"].message).toBe("Better title\n\nWhy");
  });

  it("restores the existing draft when amendment is canceled", () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "My next commit");
    store.beginAmend("/one", "abc123", "Previous commit");
    store.setMessage("/one", "Edited previous commit");
    store.cancelAmend("/one");
    expect(useCommitMessagePrefs.getState().drafts["/one"]).toEqual({ message: "My next commit" });
  });

  it("keeps the original draft across repeated amend entry and completion", () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "A separate draft");
    store.beginAmend("/one", "abc123", "Prior commit");
    store.beginAmend("/one", "def456", "Another prior commit");
    store.completeCommit("/one", "Default template");
    expect(useCommitMessagePrefs.getState().drafts["/one"]).toEqual({ message: "A separate draft" });
  });

  it("resets a normal commit draft to the latest template after success", () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "Done");
    store.completeCommit("/one", "Current template");
    expect(useCommitMessagePrefs.getState().drafts["/one"]).toEqual({ message: "Current template" });
  });

  it("persists message and amend target across hydration", async () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "Next draft");
    store.beginAmend("/one", "abc123", "Prior commit");
    const saved = memory.get("l8git-commit-message-prefs")!;
    useCommitMessagePrefs.setState({ drafts: {} });
    memory.set("l8git-commit-message-prefs", saved);
    await useCommitMessagePrefs.persist.rehydrate();
    expect(useCommitMessagePrefs.getState().drafts["/one"]).toEqual({
      message: "Prior commit", amend: { hash: "abc123", commitMessage: "Prior commit", originalMessage: "Next draft" },
    });
  });

  it("recovers the manual amend message after a process exits while AI is streaming", async () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "Separate next commit");
    store.beginAmend("/one", "abc123", "Original commit");
    store.setMessage("/one", "Manual amend message");
    store.beginAiDraft("/one");
    store.setMessage("/one", "Partially streamed AI");
    const saved = memory.get("l8git-commit-message-prefs")!;
    useCommitMessagePrefs.setState({ drafts: {} });
    memory.set("l8git-commit-message-prefs", saved);
    await useCommitMessagePrefs.persist.rehydrate();
    expect(useCommitMessagePrefs.getState().drafts["/one"]).toEqual({
      message: "Manual amend message", amend: { hash: "abc123", commitMessage: "Original commit", originalMessage: "Separate next commit" },
    });
  });

  it("keeps a successful AI result and clears its backup atomically", () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/one", "Manual message");
    store.beginAiDraft("/one");
    store.setMessage("/one", "Partial output");
    store.beginAiDraft("/one");
    expect(useCommitMessagePrefs.getState().drafts["/one"].aiBackup).toBe("Manual message");
    store.completeAiDraft("/one", "Complete output");
    expect(useCommitMessagePrefs.getState().drafts["/one"]).toEqual({ message: "Complete output" });
  });

  it("restores an empty original message on cancellation without touching other repositories", () => {
    const store = useCommitMessagePrefs.getState();
    store.setMessage("/two", "Other draft");
    store.beginAiDraft("/one");
    store.setMessage("/one", "Partial output");
    store.cancelAiDraft("/one");
    expect(useCommitMessagePrefs.getState().drafts).toEqual({ "/one": { message: "" }, "/two": { message: "Other draft" } });
  });

  it("recovers valid drafts while ignoring malformed stored fields", () => {
    expect(sanitizeCommitDrafts({
      "/good": { message: "Kept", amend: { hash: "not a hash", commitMessage: "Old", originalMessage: "Next" } },
      "/recover": { message: "Partial", aiBackup: "", extra: "ignored" },
      "/bad": { message: 42 },
      "/null": null,
    })).toEqual({ "/good": { message: "Kept" }, "/recover": { message: "" } });
    expect(sanitizeCommitDrafts([])).toEqual({});
  });

  it("finishes hydration and keeps the composer editable when persisted JSON is unreadable", async () => {
    memory.set("l8git-commit-message-prefs", '{"state":{"drafts":');
    await useCommitMessagePrefs.persist.rehydrate();
    expect(useCommitMessagePrefs.persist.hasHydrated()).toBe(true);
    expect(useCommitMessagePrefs.getState().drafts).toEqual({});
    useCommitMessagePrefs.getState().setMessage("/one", "New usable draft");
    expect(useCommitMessagePrefs.getState().drafts["/one"].message).toBe("New usable draft");
    expect(readableCommitDraftJson("broken")).toBeNull();
    expect(readableCommitDraftJson(null)).toBeNull();
    expect(readableCommitDraftJson('{"state":{}}')).toBe('{"state":{}}');
  });
});
