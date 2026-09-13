import { describe, expect, it } from "vitest";
import { applyCompactSettingsToLaunchArgs, validateCompactSettings } from "@/lib/agents/cli-commands";

describe("USE-04 compact settings", () => {
  it("is unsupported when no setting is provided", () => {
    expect(validateCompactSettings(undefined, ["1.2.0"], "1.2.0").status).toBe("unsupported");
  });

  it("is unsupported for an invalid/untested CLI version", () => {
    const result = validateCompactSettings({ autoCompact: true }, ["1.2.0"], "0.9.0");
    expect(result.status).toBe("unsupported");
  });

  it("validates a supported threshold against the tested CLI version", () => {
    const result = validateCompactSettings({ autoCompact: true, compactOnResume: false }, ["1.2.0"], "1.2.0");
    expect(result.status).toBe("supported");
  });

  it("maps settings onto launch args without changing model capacity flags", () => {
    const args = applyCompactSettingsToLaunchArgs(["--model", "claude-opus-4"], {
      autoCompact: true,
      compactOnResume: true,
    });
    expect(args).toEqual(["--model", "claude-opus-4", "--auto-compact", "true", "--compact-on-resume"]);
  });
});
