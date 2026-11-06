import { describe, expect, it } from "vitest";

import { applyProfile, classifyFile } from "./file-classes";

describe("file classes", () => {
  it("labels lockfiles, snapshots, generated and vendored paths", () => {
    expect(classifyFile("bun.lock")).toEqual(["lockfile"]);
    expect(classifyFile("src-tauri/Cargo.lock")).toEqual(["lockfile"]);
    expect(classifyFile("src/__snapshots__/a.test.ts.snap")).toContain("snapshot");
    expect(classifyFile("dist/app.min.js")).toEqual(["generated"]);
    expect(classifyFile("src/routeTree.gen.ts")).toEqual(["generated"]);
    expect(classifyFile("vendor/lib/x.go")).toEqual(["vendor"]);
    expect(classifyFile("src/main.ts")).toEqual([]);
  });
  it("splits shown/hidden without losing files", () => {
    const files = [{ path: "a.ts" }, { path: "package-lock.json" }, { path: "docs/x.md" }];
    const r = applyProfile(files, ["lockfile"]);
    expect(r.shown.map((f) => f.path)).toEqual(["a.ts", "docs/x.md"]);
    expect(r.hidden.map((f) => f.path)).toEqual(["package-lock.json"]);
    expect(applyProfile(files, []).shown).toHaveLength(3);
  });
});
