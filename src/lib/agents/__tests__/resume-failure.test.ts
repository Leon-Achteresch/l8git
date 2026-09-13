import { describe, expect, it } from "vitest";

import { classifyResumeFailure } from "@/lib/agents/resume-failure";

describe("classifyResumeFailure", () => {
  it("classifies a missing native session file", () => {
    const result = classifyResumeFailure({ error: "ENOENT: session file not found" });
    expect(result.kind).toBe("missing");
    expect(result.canStartFresh).toBe(true);
  });

  it("classifies an incompatible CLI version", () => {
    const result = classifyResumeFailure({ status: "unsupported version" });
    expect(result.kind).toBe("incompatible");
    expect(result.canStartFresh).toBe(true);
  });

  it("rejects a session belonging to a different instance config dir", () => {
    const result = classifyResumeFailure({
      expectedConfigDir: "/home/a/.claude",
      actualConfigDir: "/home/b/.claude",
    });
    expect(result.kind).toBe("foreignInstance");
    expect(result.canStartFresh).toBe(true);
  });

  it("falls back to unknown for unrecognized errors", () => {
    const result = classifyResumeFailure({ error: "boom" });
    expect(result.kind).toBe("unknown");
    expect(result.canStartFresh).toBe(false);
  });
});
