import { describe, expect, it } from "vitest";

import { detectExternalChange } from "@/lib/agents/external-change";
import { shouldRefreshForExternalChange } from "@/lib/agents/thread-refresh";

describe("detectExternalChange", () => {
  it("reports no change when native meta matches the local cursor", () => {
    const result = detectExternalChange(
      { lastSequence: 5, updatedAt: 1000 },
      { mtime: 1000, messageCount: 5 },
    );
    expect(result).toEqual({ changed: false, reason: "none" });
  });

  it("detects new native messages beyond the local cursor", () => {
    const result = detectExternalChange(
      { lastSequence: 5, updatedAt: 1000 },
      { mtime: 1000, messageCount: 7 },
    );
    expect(result).toEqual({ changed: true, reason: "newMessages" });
  });

  it("detects an external modification after the cursor timestamp", () => {
    const result = detectExternalChange(
      { lastSequence: 5, updatedAt: 1000 },
      { mtime: 2000, messageCount: 5 },
    );
    expect(result).toEqual({ changed: true, reason: "modifiedAfterCursor" });
  });

  it("treats any native messages as change when there is no local cursor", () => {
    expect(detectExternalChange(null, { mtime: 0, messageCount: 3 })).toEqual({
      changed: true,
      reason: "newMessages",
    });
    expect(detectExternalChange(null, { mtime: 0, messageCount: 0 })).toEqual({
      changed: false,
      reason: "none",
    });
  });

  it("is re-exported by thread-refresh for use in refresh decisions", () => {
    expect(shouldRefreshForExternalChange(null, { mtime: 0, messageCount: 1 }).changed).toBe(true);
  });
});
