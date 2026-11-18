import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IgnoreExplanation, IgnoreLookupState } from "./ignore-explanation";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/ipc", () => ({ invoke }));
import { createIgnoreLookup } from "./ignore-explanation";

function deferred() {
  let resolve!: (value: IgnoreExplanation) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<IgnoreExplanation>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const noMatch: IgnoreExplanation = { file: " plain 日本語\n- ", ignored: false, rule: null };
beforeEach(() => invoke.mockReset());

describe("ignore lookup request ownership and IPC", () => {
  it("sends one exact literal path and only the read command", async () => {
    const publish = vi.fn();
    invoke.mockResolvedValue(noMatch);
    await createIgnoreLookup(publish).check("/repo", noMatch.file);
    expect(invoke.mock.calls).toEqual([["git_check_ignore", { path: "/repo", file: noMatch.file }]]);
    expect(publish.mock.calls).toEqual([[{ status: "loading", file: noMatch.file }], [{ status: "ready", result: noMatch }]]);
  });

  it("shows Git/IPC failures as errors and allows an explicit retry", async () => {
    const publish = vi.fn();
    const lookup = createIgnoreLookup(publish);
    invoke.mockRejectedValueOnce("fatal: not a git repository").mockResolvedValueOnce(noMatch);
    await lookup.check("/repo", "file");
    expect(publish).toHaveBeenLastCalledWith({ status: "error", error: "fatal: not a git repository" });
    await lookup.check("/repo", noMatch.file);
    expect(publish).toHaveBeenLastCalledWith({ status: "ready", result: noMatch });
  });

  it("discards stale success and error on input edit, close or repo switch", async () => {
    for (const reason of ["edit", "close", "repo-switch"]) {
      for (const fail of [false, true]) {
        const old = deferred();
        const states: IgnoreLookupState[] = [];
        const lookup = createIgnoreLookup(state => states.push(state));
        invoke.mockReturnValueOnce(old.promise);
        const pending = lookup.check("/old", reason);
        lookup.cancel();
        if (fail) old.reject("old error"); else old.resolve(noMatch);
        await pending;
        expect(states).toEqual([{ status: "loading", file: reason }]);
      }
    }
  });

  it("keeps the newest answer even after A → B → A and out-of-order replies", async () => {
    const publish = vi.fn();
    const lookup = createIgnoreLookup(publish);
    const old = deferred();
    invoke.mockReturnValueOnce(old.promise).mockResolvedValueOnce(noMatch).mockResolvedValueOnce(noMatch);
    const first = lookup.check("/A", "old");
    await lookup.check("/B", noMatch.file);
    await lookup.check("/A", noMatch.file);
    const count = publish.mock.calls.length;
    old.resolve({ ...noMatch, file: "old" });
    await first;
    expect(publish.mock.calls).toHaveLength(count);
    expect(publish).toHaveBeenLastCalledWith({ status: "ready", result: noMatch });
  });
});
