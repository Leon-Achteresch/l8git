import { describe, expect, it } from "vitest";

import { channelInputCapability } from "@/lib/agents/cli-commands";

describe("CLI-04 MCP channel input", () => {
  it("is unsupported with a documented reason regardless of version", () => {
    const capability = channelInputCapability("1.5.0");
    expect(capability.status).toBe("unsupported");
    expect(capability.reason).toBeTruthy();
  });

  it("is unsupported when no version is known", () => {
    const capability = channelInputCapability(null);
    expect(capability.status).toBe("unsupported");
  });
});
