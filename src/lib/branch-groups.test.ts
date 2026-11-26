import { expect, it } from "vitest";
import { groupBranchesByKind } from "./branch-groups";

it("keeps branch priorities and stable locale ordering within each sidebar group", () => {
  const names = ["origin/fix/zulú", "Feature/Z", "other", "main", "Feature/é", "dev", "Feature/E", "Feature/current", "origin/fix/a"];
  const grouped = groupBranchesByKind(names.map(name => ({
    name, tip: "abc", is_current: name === "Feature/current", is_remote: name.startsWith("origin/"),
  })));
  expect(grouped.flat.map(branch => branch.name)).toEqual(["main", "dev", "other"]);
  const featureNames = ["Feature/Z", "Feature/é", "Feature/E"].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  expect(grouped.groups.map(group => [group.id, group.branches.map(branch => branch.name)])).toEqual([
    ["feature", ["Feature/current", ...featureNames]],
    ["fix", ["origin/fix/a", "origin/fix/zulú"]],
  ]);
});
