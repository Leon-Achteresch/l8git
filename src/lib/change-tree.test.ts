import { describe, expect, it } from "vitest";

import { changeTreeItems, collectFolderPaths } from "@/lib/change-tree";
import type { ChangeRow } from "@/components/repo/commit/commit-panel-types";

function row(path: string): ChangeRow {
  return { id: `${path}\nunstaged`, path, sector: "unstaged", entry: {} as never };
}

describe("changeTreeItems", () => {
  it("groups files into folders and lists folders before files", () => {
    const items = changeTreeItems(
      [row("README.md"), row("src/lib/a.ts"), row("src/b.ts")],
      new Set(),
      "u:",
    );

    expect(items.map((i) => (i.type === "folder" ? `d:${i.node.path}` : `f:${i.row.path}`))).toEqual([
      "d:src",
      "d:src/lib",
      "f:src/lib/a.ts",
      "f:src/b.ts",
      "f:README.md",
    ]);
  });

  it("can expand a folder larger than the engine's argument limit", () => {
    const rows = Array.from({ length: 180_000 }, (_, index) => row(`generated/file-${index}`));
    const items = changeTreeItems(rows, new Set(), "u:");
    expect(items).toHaveLength(rows.length + 1);
    expect(items[0]?.type === "folder" && items[0].node.fileCount).toBe(rows.length);
  });

  it("collects every descendant path on a folder and hides collapsed children", () => {
    const items = changeTreeItems([row("src/lib/a.ts"), row("src/b.ts")], new Set(["u:src"]), "u:");

    expect(items).toHaveLength(1);
    expect(items[0]?.type === "folder" && collectFolderPaths(items[0].node).sort()).toEqual([
      "src/b.ts",
      "src/lib/a.ts",
    ]);
  });
});
