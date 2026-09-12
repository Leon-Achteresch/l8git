import { describe, expect, it } from "vitest";

import {
  FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME,
  isEnabled,
  resetEnabled,
  setEnabled,
} from "@/lib/agents/feature-flags";

describe("feature-flags", () => {
  it("defaults the canonical Claude runtime flag to off", () => {
    resetEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME);
    expect(isEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME)).toBe(false);
  });

  it("persists an enabled flag across reads", () => {
    setEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME, true);
    expect(isEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME)).toBe(true);
  });

  it("falls back to the old adapter once disabled again", () => {
    setEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME, true);
    expect(isEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME)).toBe(true);
    setEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME, false);
    expect(isEnabled(FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME)).toBe(false);
  });
});
