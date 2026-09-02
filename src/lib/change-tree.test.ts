import { describe, expect, it } from "vitest";

import { changeTreeItems } from "@/lib/change-tree";
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

    expect(items.map((i) => (i.type === "folder" ? `d:${i.path}` : `f:${i.row.path}`))).toEqual([
      "d:src",
      "d:src/lib",
      "f:src/lib/a.ts",
      "f:src/b.ts",
      "f:README.md",
    ]);
  });

  it("collects every descendant path on a folder and hides collapsed children", () => {
    const items = changeTreeItems([row("src/lib/a.ts"), row("src/b.ts")], new Set(["u:src"]), "u:");

    expect(items).toHaveLength(1);
    expect(items[0]?.type === "folder" && items[0].paths.sort()).toEqual([
      "src/b.ts",
      "src/lib/a.ts",
    ]);
  });
});
