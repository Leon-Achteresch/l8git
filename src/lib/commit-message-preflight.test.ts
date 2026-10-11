import { beforeEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { readCommitHead } from "./commit-message-preflight";

beforeEach(() => { invoke.mockReset(); });

describe("amend HEAD read", () => {
  it("reads HEAD explicitly rather than the first item of the all-branches graph", async () => {
    invoke.mockResolvedValue({ header: "commit abc123\nAuthor: Ada <ada@example.org>\n\n    fix: restore sessions\n    \n    Preserve the return URL.\n", files: [] });
    expect(await readCommitHead("/repo")).toEqual({ hash: "abc123", commitMessage: "fix: restore sessions\n\nPreserve the return URL." });
    expect(invoke).toHaveBeenCalledWith("repo_commit_inspect", { path: "/repo", commit: "HEAD" });
  });

  it("refuses to amend when the backend did not resolve a commit", async () => {
    invoke.mockResolvedValue({ header: "No commits yet", files: [] });
    await expect(readCommitHead("/new")).rejects.toThrow("Unable to resolve HEAD");
  });

  it("propagates failures so the UI retains the draft", async () => {
    invoke.mockRejectedValue(new Error("Repository is unavailable"));
    await expect(readCommitHead("/gone")).rejects.toThrow("Repository is unavailable");
  });
});
