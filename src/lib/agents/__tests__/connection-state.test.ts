import { describe, expect, it } from "vitest";

import { connectionState, snapshotResumeSequence } from "@/lib/agents/overview";

describe("connectionState", () => {
  it("reports offline with no signal history", () => {
    expect(connectionState([])).toEqual({ state: "offline", lastSequence: 0, gapDetected: false });
  });

  it("reports online once connected and streaming sequences without gaps", () => {
    const snapshot = connectionState([
      { type: "connected" },
      { type: "sequence", sequence: 1 },
      { type: "sequence", sequence: 2 },
    ]);
    expect(snapshot).toEqual({ state: "online", lastSequence: 2, gapDetected: false });
  });

  it("detects a sequence gap after a reconnect", () => {
    const snapshot = connectionState([
      { type: "sequence", sequence: 1 },
      { type: "disconnected" },
      { type: "reconnecting" },
      { type: "connected" },
      { type: "sequence", sequence: 5 },
    ]);
    expect(snapshot.state).toBe("online");
    expect(snapshot.lastSequence).toBe(5);
    expect(snapshot.gapDetected).toBe(true);
  });

  it("marks catchingUp when reconnecting after prior sequence history", () => {
    const snapshot = connectionState([
      { type: "sequence", sequence: 3 },
      { type: "disconnected" },
      { type: "connected" },
    ]);
    expect(snapshot.state).toBe("catchingUp");
    expect(snapshot.lastSequence).toBe(3);
  });

  it("resumes a snapshot request from the sequence after the last seen one", () => {
    expect(snapshotResumeSequence({ state: "catchingUp", lastSequence: 3, gapDetected: false })).toBe(4);
  });
});
