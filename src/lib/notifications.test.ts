import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const isPermissionGranted = vi.fn().mockResolvedValue(true);
const requestPermission = vi.fn().mockResolvedValue("granted");
const isFocused = vi.fn().mockResolvedValue(false);

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: (options: unknown) => sendNotification(options),
  isPermissionGranted: () => isPermissionGranted(),
  requestPermission: () => requestPermission(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isFocused: () => isFocused() }),
}));

import {
  NOTIFICATION_DEDUPE_MS,
  agentThreadEvents,
  agentThreadSnapshots,
  ensureNotificationPermission,
  isFailedRun,
  isLongRunningOp,
  isNotificationAllowed,
  newReviewRequests,
  newlyFailedRuns,
  notify,
  pruneDedupeCache,
  resetNotificationDedupe,
  shouldEmit,
  useNotificationPermission,
  useNotificationPrefs,
} from "@/lib/notifications";

beforeEach(() => {
  sendNotification.mockClear();
  isPermissionGranted.mockClear().mockResolvedValue(true);
  requestPermission.mockClear().mockResolvedValue("granted");
  isFocused.mockClear().mockResolvedValue(false);
  resetNotificationDedupe();
  useNotificationPermission.getState().setStatus("granted");
  useNotificationPrefs.setState({
    enabled: true,
    kinds: {
      ciFailed: true,
      reviewRequested: true,
      agentTurn: true,
      remoteOpDone: true,
    },
  });
});

describe("shouldEmit", () => {
  it("allows the first event and blocks repeats inside the window", () => {
    const cache = new Map<string, number>();
    expect(shouldEmit(cache, "a", 0)).toBe(true);
    expect(shouldEmit(cache, "a", 1_000)).toBe(false);
    expect(shouldEmit(cache, "a", NOTIFICATION_DEDUPE_MS - 1)).toBe(false);
    expect(shouldEmit(cache, "a", NOTIFICATION_DEDUPE_MS)).toBe(true);
  });

  it("keeps separate sources independent", () => {
    const cache = new Map<string, number>();
    expect(shouldEmit(cache, "a", 0)).toBe(true);
    expect(shouldEmit(cache, "b", 0)).toBe(true);
  });
});

describe("pruneDedupeCache", () => {
  it("drops entries older than the window", () => {
    const cache = new Map([
      ["old", 0],
      ["fresh", 90_000],
    ]);
    pruneDedupeCache(cache, 100_000);
    expect([...cache.keys()]).toEqual(["fresh"]);
  });
});

describe("isNotificationAllowed", () => {
  const kinds = {
    ciFailed: true,
    reviewRequested: false,
    agentTurn: true,
    remoteOpDone: true,
  };

  it("respects the global switch", () => {
    expect(isNotificationAllowed({ enabled: false, kinds }, "ciFailed")).toBe(false);
  });

  it("respects the per-kind switch", () => {
    expect(isNotificationAllowed({ enabled: true, kinds }, "reviewRequested")).toBe(false);
    expect(isNotificationAllowed({ enabled: true, kinds }, "ciFailed")).toBe(true);
  });
});

describe("isFailedRun", () => {
  it("detects failing conclusions", () => {
    expect(isFailedRun({ status: "completed", conclusion: "failure" })).toBe(true);
    expect(isFailedRun({ status: "completed", conclusion: "timed_out" })).toBe(true);
    expect(isFailedRun({ status: "completed", conclusion: "success" })).toBe(false);
    expect(isFailedRun({ status: "in_progress", conclusion: null })).toBe(false);
  });
});

describe("newlyFailedRuns", () => {
  const run = (id: number, conclusion: string | null, status = "completed") => ({
    id,
    name: `run-${id}`,
    status,
    conclusion,
  });

  it("stays silent on the first snapshot", () => {
    expect(newlyFailedRuns(undefined, [run(1, "failure")])).toEqual([]);
  });

  it("reports a run that flipped to red", () => {
    const previous = [run(1, null, "in_progress")];
    expect(newlyFailedRuns(previous, [run(1, "failure")]).map((r) => r.id)).toEqual([1]);
  });

  it("ignores runs that were already red", () => {
    const previous = [run(1, "failure")];
    expect(newlyFailedRuns(previous, [run(1, "failure")])).toEqual([]);
  });

  it("reports a red run that appeared after the baseline", () => {
    expect(newlyFailedRuns([run(1, "success")], [run(2, "failure"), run(1, "success")]).map((r) => r.id)).toEqual([2]);
  });
});

describe("newReviewRequests", () => {
  const pr = (number: number, reviewers: string[]) => ({
    number,
    title: `PR ${number}`,
    reviewers: reviewers.map((login) => ({ login })),
  });

  it("stays silent on the first snapshot", () => {
    expect(newReviewRequests(undefined, [pr(1, ["ada"])])).toEqual([]);
  });

  it("reports a reviewer that was added", () => {
    expect(newReviewRequests([pr(1, [])], [pr(1, ["ada"])])).toEqual([
      { number: 1, title: "PR 1", login: "ada" },
    ]);
  });

  it("ignores unchanged reviewers", () => {
    expect(newReviewRequests([pr(1, ["ada"])], [pr(1, ["ada"])])).toEqual([]);
  });

  it("reports reviewers of a pull request that showed up after the baseline", () => {
    expect(newReviewRequests([pr(1, ["ada"])], [pr(1, ["ada"]), pr(2, ["lin"])])).toEqual([
      { number: 2, title: "PR 2", login: "lin" },
    ]);
  });
});

describe("agentThreadSnapshots", () => {
  it("merges conversations and pending requests", () => {
    expect(
      agentThreadSnapshots({ a: { activeTurnId: "t1" } }, { a: [1], b: [1, 2] }),
    ).toEqual({
      a: { activeTurn: true, pendingRequests: 1 },
      b: { activeTurn: false, pendingRequests: 2 },
    });
  });
});

describe("agentThreadEvents", () => {
  it("reports a finished turn", () => {
    expect(
      agentThreadEvents(
        { a: { activeTurn: true, pendingRequests: 0 } },
        { a: { activeTurn: false, pendingRequests: 0 } },
      ),
    ).toEqual([{ threadId: "a", kind: "turnFinished" }]);
  });

  it("reports a new approval request", () => {
    expect(
      agentThreadEvents(
        { a: { activeTurn: true, pendingRequests: 0 } },
        { a: { activeTurn: true, pendingRequests: 1 } },
      ),
    ).toEqual([{ threadId: "a", kind: "awaitingApproval" }]);
  });

  it("ignores unchanged threads and unknown ones", () => {
    expect(
      agentThreadEvents(
        { a: { activeTurn: true, pendingRequests: 1 } },
        { a: { activeTurn: true, pendingRequests: 1 }, b: { activeTurn: false, pendingRequests: 0 } },
      ),
    ).toEqual([]);
  });
});

describe("isLongRunningOp", () => {
  it("only accepts operations above the threshold", () => {
    expect(isLongRunningOp(0, 9_000)).toBe(false);
    expect(isLongRunningOp(0, 10_001)).toBe(true);
    expect(isLongRunningOp(undefined, 60_000)).toBe(false);
  });
});

describe("notify", () => {
  const input = { kind: "ciFailed" as const, key: "ci:demo", title: "CI" };

  it("sends when the window is blurred and the kind is enabled", async () => {
    expect(await notify(input)).toBe(true);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ title: "CI" });
  });

  it("skips while the window is focused", async () => {
    isFocused.mockResolvedValue(true);
    expect(await notify(input)).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips when the global switch is off", async () => {
    useNotificationPrefs.setState({ enabled: false });
    expect(await notify(input)).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips when the kind is off", async () => {
    useNotificationPrefs.setState({
      kinds: {
        ciFailed: false,
        reviewRequested: true,
        agentTurn: true,
        remoteOpDone: true,
      },
    });
    expect(await notify(input)).toBe(false);
  });

  it("debounces the same source", async () => {
    expect(await notify(input)).toBe(true);
    expect(await notify(input)).toBe(false);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("skips when permission was denied", async () => {
    useNotificationPermission.getState().setStatus("denied");
    expect(await notify(input)).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("passes the target through as extra payload", async () => {
    await notify({ ...input, target: { view: "ci", path: "/repo" } });
    expect(sendNotification.mock.calls[0][0]).toMatchObject({
      extra: { target: { view: "ci", path: "/repo" } },
    });
  });
});

describe("ensureNotificationPermission", () => {
  it("requests permission when it is not granted yet", async () => {
    isPermissionGranted.mockResolvedValue(false);
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(useNotificationPermission.getState().status).toBe("granted");
  });

  it("marks a rejected request as denied", async () => {
    isPermissionGranted.mockResolvedValue(false);
    requestPermission.mockResolvedValue("denied");
    expect(await ensureNotificationPermission()).toBe(false);
    expect(useNotificationPermission.getState().status).toBe("denied");
  });
});
