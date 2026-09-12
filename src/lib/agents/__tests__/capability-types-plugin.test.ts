import { describe, expect, it } from "vitest";

import { planPluginTransition } from "@/lib/agents/capability-types";

describe("planPluginTransition", () => {
  it("allows valid transitions and rejects invalid ones", () => {
    expect(planPluginTransition("uninstalled", "install")).toEqual({ next: "installed" });
    expect(planPluginTransition("installed", "enable")).toEqual({ next: "enabled" });
    expect(planPluginTransition("enabled", "disable")).toEqual({ next: "disabled" });
    expect(planPluginTransition("disabled", "enable")).toEqual({ next: "enabled" });
    expect(planPluginTransition("enabled", "uninstall")).toEqual({ next: "uninstalled" });

    expect(planPluginTransition("uninstalled", "enable")).toEqual({
      error: "cannot enable a plugin in state uninstalled",
    });
    expect(planPluginTransition("uninstalled", "uninstall")).toEqual({
      error: "cannot uninstall a plugin in state uninstalled",
    });
  });
});
