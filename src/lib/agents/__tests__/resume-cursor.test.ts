import { describe, expect, it } from "vitest";

import {
  getResumeCursor,
  parseResumeCursors,
  setResumeCursor,
} from "@/lib/agents/resume-cursor";
import { threadId } from "@/lib/agents/types";

describe("parseResumeCursors", () => {
  it("returns an empty map for missing or malformed data", () => {
    expect(parseResumeCursors(null)).toEqual({});
    expect(parseResumeCursors("not json")).toEqual({});
    expect(parseResumeCursors("[]")).toEqual({});
  });

  it("drops entries with incomplete cursor data", () => {
    const raw = JSON.stringify({
      good: { nativeSessionId: "s1", lastSequence: 3, updatedAt: 100 },
      bad: { nativeSessionId: "s2" },
    });
    expect(parseResumeCursors(raw)).toEqual({
      good: { nativeSessionId: "s1", lastSequence: 3, updatedAt: 100 },
    });
  });
});

describe("setResumeCursor / getResumeCursor", () => {
  it("stores and retrieves a cursor as a whole record", () => {
    const thread = threadId("t1");
    const cursors = setResumeCursor({}, thread, {
      nativeSessionId: "s1",
      lastSequence: 5,
      updatedAt: 1234,
    });
    expect(getResumeCursor(cursors, thread)).toEqual({
      nativeSessionId: "s1",
      lastSequence: 5,
      updatedAt: 1234,
    });
    expect(getResumeCursor(cursors, threadId("other"))).toBeNull();
  });
});
