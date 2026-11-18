import { expect, it } from "vitest";
import { submodulePins } from "./submodule-pin-diff";

const before = "a".repeat(40);
const after = "9".repeat(40);
const patch = (old = before, next = after) =>
  `diff --git a/lib b/lib\nindex ${old.slice(0, 7)}..${next.slice(0, 7)} 160000\n--- a/lib\n+++ b/lib\n@@ -1 +1 @@\n-Subproject commit ${old}\n+Subproject commit ${next}\n`;

it("uses exact full IDs from the gitlink patch, including an unchanged dirty pin", () => {
  expect(submodulePins(patch())).toEqual({ before, after });
  expect(submodulePins(patch(before, before).replace(/^index .*\n/m, "").trimEnd() + "-dirty\n")).toEqual({ before, after: before });
  const sha256 = { before: "a".repeat(64), after: "b".repeat(64) };
  expect(submodulePins(patch(sha256.before, sha256.after))).toEqual(sha256);
});

it("does not treat ordinary files, added gitlinks or a mixed patch as a pair", () => {
  expect(submodulePins(patch().replace("160000", "100644"))).toBeNull();
  expect(submodulePins(patch(before, before).replace("160000", "100644").trimEnd() + "-dirty\n")).toBeNull();
  expect(submodulePins(patch().replace("160000", ""))).toBeNull();
  expect(submodulePins(patch().replace(`-Subproject commit ${before}\n`, ""))).toBeNull();
  expect(submodulePins(patch().replace("aaaaaaa..9999999", "aaaaaaa..bbbbbbb"))).toBeNull();
  expect(submodulePins(patch() + patch())).toBeNull();
});
