import { describe, expect, it } from "vitest";
import { commitPanelLayoutToPersist, commitPanelOrientation, readCommitPanelLayout, repositorySidebarLayout } from "./responsive-workspace";

describe("responsive repository workspace", () => {
  it("stacks at the real 900px native minimum after the sidebar is allocated", () => {
    const sidebar = repositorySidebarLayout({ availableWidth: 900, preferredWidth: 256, minimumWidth: 240, scale: 1 });
    expect(sidebar).toEqual({ compact: false, width: 256 });
    expect(commitPanelOrientation(900 - sidebar.width, 1)).toBe("vertical");
  });
  it("uses an accessible rail at 640px and reserves full-width file rows", () => {
    const sidebar = repositorySidebarLayout({ availableWidth: 640, preferredWidth: 256, minimumWidth: 240, scale: 1 });
    expect(sidebar).toEqual({ compact: true, width: 64 });
    expect(commitPanelOrientation(640 - sidebar.width, 1)).toBe("vertical");
  });
  it("temporarily clamps a large desktop sidebar without changing its saved choice", () => {
    const choice = { preferredWidth: 560, minimumWidth: 240, scale: 1 };
    expect(repositorySidebarLayout({ ...choice, availableWidth: 900 })).toEqual({ compact: false, width: 420 });
    expect(repositorySidebarLayout({ ...choice, availableWidth: 1280 })).toEqual({ compact: false, width: 560 });
    expect(choice.preferredWidth).toBe(560);
  });
  it("accounts for text scale and right docks using available width rather than viewport width", () => {
    expect(repositorySidebarLayout({ availableWidth: 900, preferredWidth: 256, minimumWidth: 240, scale: 1.5 })).toEqual({ compact: true, width: 96 });
    expect(commitPanelOrientation(900 - 96, 1.5)).toBe("vertical");
    expect(commitPanelOrientation(620, 1)).toBe("vertical");
    expect(commitPanelOrientation(1024, 1)).toBe("horizontal");
  });
  it("does not guess a narrow layout before a container has been measured", () => {
    expect(commitPanelOrientation(0, 1)).toBe("horizontal");
    expect(commitPanelOrientation(NaN, 1, "vertical")).toBe("vertical");
    expect(repositorySidebarLayout({ availableWidth: 0, preferredWidth: 256, minimumWidth: 240, scale: 1 })).toEqual({ compact: false, width: 256 });
  });
  it("does not oscillate at the stacking breakpoint", () => {
    expect(commitPanelOrientation(719, 1)).toBe("vertical");
    expect(commitPanelOrientation(721, 1, "vertical")).toBe("vertical");
    expect(commitPanelOrientation(744, 1, "vertical")).toBe("horizontal");
  });
  it("rejects corrupt or incomplete saved panel ratios", () => {
    for (const raw of ["{", "null", "[]", '{"files":32}', '{"files":0,"diff":100}', '{"files":"32","diff":68}', '{"files":32,"diff":20}']) {
      expect(readCommitPanelLayout(raw)).toBeNull();
    }
    expect(readCommitPanelLayout('{"files":37,"diff":63}')).toEqual({ files: 37, diff: 63 });
  });
  it("persists only direct resizing, leaving desktop and vertical ratios independent", () => {
    const desktop = { files: 37, diff: 63 };
    expect(commitPanelLayoutToPersist({ files: 60, diff: 40 }, false)).toBeNull();
    expect(commitPanelLayoutToPersist({ files: 45, diff: 55 }, true)).toEqual({ files: 45, diff: 55 });
    expect(desktop).toEqual({ files: 37, diff: 63 });
  });
});
