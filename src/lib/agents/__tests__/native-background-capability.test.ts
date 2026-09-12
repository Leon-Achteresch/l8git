import { describe, expect, it } from "vitest";

import { nativeBackgroundSessionCapability } from "@/lib/agents/capability-types";

describe("nativeBackgroundSessionCapability", () => {
  it("reports unsupported with a documented reason and a version gate, never a silent no-op", () => {
    const result = nativeBackgroundSessionCapability("2.1.0");
    expect(result.status).toBe("unsupported");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.minVersion).toBe("2.1.0");
  });
});
