import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HEADER_MENUS = [
  "src/components/repo/tabs/repo-workspace-switch.tsx",
  "src/components/repo/tabs/add-repo-button.tsx",
];

describe("overlay stacking", () => {
  it("header menus leave the header stacking context", () => {
    for (const file of HEADER_MENUS) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("OverlayPortal");
      expect(src).toContain("fixed z-[80]");
      expect(src).not.toMatch(/filter:\s*"blur/);
    }
  });
});
