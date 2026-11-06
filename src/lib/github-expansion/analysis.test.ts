import { describe, expect, it } from "vitest";
import { npmDependencyDiff, structuredDiff } from "./analysis";
describe("structural comparisons", () => {
  it("ignores object key ordering but preserves array order and escaped paths", () => {
    expect(structuredDiff('{"x":1,"y":2}', '{"y":2,"x":1}', "json")).toEqual([]);
    expect(structuredDiff('{"a/b":[1,2]}', '{"a/b":[2,1],"~":true}', "json")).toEqual([
      { path: "/a~1b/0", kind: "changed", before: 1, after: 2 },
      { path: "/a~1b/1", kind: "changed", before: 2, after: 1 },
      { path: "/~0", kind: "added", after: true },
    ]);
  });
  it("handles YAML without interpreting on as a boolean and rejects malformed input", () => {
    expect(structuredDiff("on: push", "on: workflow_dispatch", "yaml")).toEqual([{ path: "/on", kind: "changed", before: "push", after: "workflow_dispatch" }]);
    expect(() => structuredDiff("{broken", "{}", "json")).toThrow();
  });
});
describe("npm dependency comparisons", () => {
  it("separates direct and nested dependencies and reports additions and removals", () => {
    const before = JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: { a: "^1" } }, "node_modules/a": { version: "1.0" }, "node_modules/a/node_modules/b": { version: "2.0" } } });
    const after = JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: { a: "^2" }, optionalDependencies: { c: "^1" } }, "node_modules/a": { version: "2.0" }, "node_modules/c": { version: "1.0", optional: true } } });
    expect(npmDependencyDiff(before, after)).toEqual([
      { path: "node_modules/a", name: "a", before: "1.0", after: "2.0", direct: true, dev: false, optional: false, beforeClassification: { direct: true, dev: false, optional: false }, afterClassification: { direct: true, dev: false, optional: false } },
      { path: "node_modules/a/node_modules/b", name: "b", before: "2.0", after: null, direct: false, dev: false, optional: false, beforeClassification: { direct: false, dev: false, optional: false }, afterClassification: null },
      { path: "node_modules/c", name: "c", before: null, after: "1.0", direct: true, dev: false, optional: true, beforeClassification: null, afterClassification: { direct: true, dev: false, optional: true } },
    ]);
  });
  const lock = (packages: Record<string, unknown>, root: Record<string, unknown> = {}) => JSON.stringify({ lockfileVersion: 3, packages: { "": root, ...packages } });
  it("retains development-to-runtime changes at the same version", () => {
    const before = lock({ "node_modules/x": { version: "1.0.0", dev: true } }, { devDependencies: { x: "1.0.0" } });
    const after = lock({ "node_modules/x": { version: "1.0.0" } }, { dependencies: { x: "1.0.0" } });
    expect(npmDependencyDiff(before, after)).toMatchObject([{ before: "1.0.0", after: "1.0.0", dev: false, beforeClassification: { direct: true, dev: true, optional: false }, afterClassification: { direct: true, dev: false, optional: false } }]);
  });
  it("retains optional-to-required changes at the same version", () => {
    const before = lock({ "node_modules/x": { version: "1.0.0", optional: true } }, { optionalDependencies: { x: "1.0.0" } });
    const after = lock({ "node_modules/x": { version: "1.0.0" } }, { dependencies: { x: "1.0.0" } });
    expect(npmDependencyDiff(before, after)).toMatchObject([{ optional: false, beforeClassification: { direct: true, dev: false, optional: true }, afterClassification: { direct: true, dev: false, optional: false } }]);
  });
  it("retains transitive-to-direct changes without combining the two root classifications", () => {
    const packages = { "node_modules/x": { version: "1.0.0" } };
    const before = lock(packages), after = lock(packages, { dependencies: { x: "1.0.0" } });
    expect(npmDependencyDiff(before, after)).toMatchObject([{ direct: true, beforeClassification: { direct: false, dev: false, optional: false }, afterClassification: { direct: true, dev: false, optional: false } }]);
    expect(npmDependencyDiff(after, before)).toMatchObject([{ direct: false, beforeClassification: { direct: true, dev: false, optional: false }, afterClassification: { direct: false, dev: false, optional: false } }]);
  });
  it("retains same-version path additions/removals and versionless package presence", () => {
    const before = lock({ "node_modules/x": { version: "1.0.0" }, "node_modules/link": { link: true } });
    const after = lock({ "node_modules/deep/node_modules/x": { version: "1.0.0" }, "node_modules/new-link": { link: true } });
    const changes = npmDependencyDiff(before, after);
    expect(changes).toHaveLength(4);
    expect(changes.find(change => change.path === "node_modules/x")).toMatchObject({ before: "1.0.0", after: null, afterClassification: null });
    expect(changes.find(change => change.path === "node_modules/deep/node_modules/x")).toMatchObject({ before: null, after: "1.0.0", beforeClassification: null });
    expect(changes.find(change => change.path === "node_modules/link")).toMatchObject({ before: null, after: null, beforeClassification: { direct: false, dev: false, optional: false }, afterClassification: null });
    expect(changes.find(change => change.path === "node_modules/new-link")).toMatchObject({ before: null, after: null, beforeClassification: null, afterClassification: { direct: false, dev: false, optional: false } });
    expect(npmDependencyDiff(before, before)).toEqual([]);
  });
  it("explicitly rejects unsupported and malformed lockfiles", () => {
    expect(() => npmDependencyDiff('{"lockfileVersion":1}', "{}")).toThrow("versions 2 and 3");
    expect(() => npmDependencyDiff('{"lockfileVersion":3,"packages":{"a":null}}', "{}")).toThrow("Invalid");
  });
});
