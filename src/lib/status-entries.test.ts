import { describe, expect, it } from "vitest";
import type { StatusEntry } from "./repo-store";
import { sameStatusEntries } from "./status-entries";

const entry: StatusEntry = {
  path: "src/example.ts", index_status: " ", worktree_status: "M", staged: false,
  unstaged: true, untracked: false, binary: false, embedded_repo: false,
  additions_staged: 0, deletions_staged: 0, additions_unstaged: 5, deletions_unstaged: 1,
};

describe("status refresh", () => {
  it("reuses equal snapshots and detects missing, removed and reordered entries", () => {
    const second = { ...entry, path: "another" };
    expect(sameStatusEntries(undefined, [])).toBe(false);
    expect(sameStatusEntries([entry], [{ ...entry }])).toBe(true);
    expect(sameStatusEntries([entry], [])).toBe(false);
    expect(sameStatusEntries([entry, second], [second, entry])).toBe(false);
  });

  it.each(Object.entries(entry))("detects a change in %s", (key, value) => {
    const changed = typeof value === "boolean" ? !value : typeof value === "number" ? value + 1 : value + "x";
    expect(sameStatusEntries([entry], [{ ...entry, [key]: changed }])).toBe(false);
  });
});
