import { describe, expect, it } from "vitest";
import { applyRichCommands } from "./promptPreparation";

describe("applyRichCommands", () => {
  it("expands /chart and /barcode with the format docs", () => {
    expect(applyRichCommands("/chart sales per month")).toMatch(/sales per month[\s\S]*```chart/);
    expect(applyRichCommands("/barcode EAN for 4006381333931")).toMatch(/```barcode/);
  });
  it("leaves ordinary prompts alone", () => {
    expect(applyRichCommands("fix the tests")).toBe("fix the tests");
    expect(applyRichCommands("/chart")).toBe("/chart");
  });
});
