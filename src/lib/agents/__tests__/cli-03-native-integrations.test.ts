import { describe, expect, it } from "vitest";

import { buildClaudeLaunchArgs, nativeIntegrationCapability } from "@/lib/agents/cli-commands";

describe("CLI-03 native chrome and IDE integrations", () => {
  it("reports chrome and ide as supported per platform", () => {
    expect(nativeIntegrationCapability("chrome", "macos")).toEqual({ status: "supported" });
    expect(nativeIntegrationCapability("ide", "windows")).toEqual({ status: "supported" });
  });

  it("sets --chrome and --ide only when capability is supported", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: [],
      trusted: false,
      chrome: { enabled: true, platform: "macos" },
      ide: { enabled: true, platform: "linux" },
    });
    expect(result.args).toEqual(["--chrome", "--ide"]);
    expect(result.warnings).toEqual([]);
  });

  it("skips flags and warns when integration is disabled", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: [],
      trusted: false,
      chrome: { enabled: false, platform: "macos" },
    });
    expect(result.args).not.toContain("--chrome");
  });
});
