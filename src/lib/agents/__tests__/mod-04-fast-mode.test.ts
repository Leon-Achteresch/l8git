import { describe, expect, it } from "vitest";
import { fastModeCapability } from "@/lib/agents/model-catalog";

describe("MOD-04 fast mode capability", () => {
  it("is supported for a model whose catalog advertises a fast service tier", () => {
    const model = { serviceTiers: [{ id: "fast", name: "Fast", description: "" }] };
    expect(fastModeCapability(model, "1.2.0")).toEqual({ status: "supported" });
  });

  it("is unsupported for a model without a fast service tier", () => {
    const model = { serviceTiers: [] };
    const result = fastModeCapability(model, "1.2.0");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBeTruthy();
  });

  it("is unsupported when the model is unknown", () => {
    expect(fastModeCapability(undefined, "1.2.0").status).toBe("unsupported");
  });

  it("is unsupported when the CLI version is unknown", () => {
    const model = { serviceTiers: [{ id: "fast", name: "Fast", description: "" }] };
    expect(fastModeCapability(model, null).status).toBe("unsupported");
  });
});
