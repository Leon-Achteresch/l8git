import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/hub/api", () => ({ enc: encodeURIComponent, hubApi: vi.fn(), gql: vi.fn() }));
import { hubApi } from "@/lib/hub/api";
import { listCodeowners, matchCodeowners, parseCodeowners } from "./codeowners";
import type { HubAccount } from "@/lib/hub/types";
const account: HubAccount = { provider: "github", host: "github.com", login: "alice", name: null, avatar_url: null };
beforeEach(() => vi.resetAllMocks());
describe("GitHub CODEOWNERS matching", () => {
  it("uses last-match precedence including ownerless exceptions", () => {
    const { rules } = parseCodeowners("* @global\n/apps/ @apps\n/apps/private\n/apps/private/owned.ts @specific");
    const owners = matchCodeowners(rules, ["other.ts", "apps/main.ts", "apps/private/unowned.ts", "apps/private/owned.ts"]);
    expect([...owners]).toEqual([["@global", ["other.ts"]], ["@apps", ["apps/main.ts"]], ["@specific", ["apps/private/owned.ts"]]]);
  });
  it("follows documented direct-child, recursive, rooted and case-sensitive examples", () => {
    const { rules } = parseCodeowners("docs/* @direct\n**/logs @logs\n/root/ @root\n*.JS @upper");
    const owners = matchCodeowners(rules, ["docs/readme.md", "docs/deep/readme.md", "a/logs/file.txt", "root/a.txt", "nested/root/a.txt", "a/file.JS", "a/file.js"]);
    expect(owners.get("@direct")).toEqual(["docs/readme.md"]);
    expect(owners.get("@logs")).toEqual(["a/logs/file.txt"]);
    expect(owners.get("@root")).toEqual(["root/a.txt"]);
    expect(owners.get("@upper")).toEqual(["a/file.JS"]);
  });
  it("supports escaped spaces, emails, teams and inline comments", () => {
    const { rules, errors } = parseCodeowners("my\\ folder/ @org/team docs@example.test # ignored\n# comment");
    expect(errors).toEqual([]);
    expect([...matchCodeowners(rules, ["my folder/a.md"]).keys()]).toEqual(["@org/team", "docs@example.test"]);
  });
  it("reports unsupported GitHub pattern syntax rather than silently assigning owners", () => {
    const { rules, errors } = parseCodeowners("!negated @owner\nfoo/[ab].ts @owner\n\\#not-supported @owner\n***/*.rb @owner\nvalid.ts @valid");
    expect(errors.map(error => error.line)).toEqual([1, 2, 3, 4]);
    expect(rules).toHaveLength(1);
  });
  it("distinguishes literal directories from files and handles globstars without regex backtracking", () => {
    const directory = parseCodeowners("/docs/ @docs\n/a/**/b.ts @recursive").rules;
    expect([...matchCodeowners(directory, ["docs"]).keys()]).toEqual([]);
    expect(matchCodeowners(directory, ["docs/file", "a/b.ts", "a/deep/nested/b.ts"]).get("@recursive")).toEqual(["a/b.ts", "a/deep/nested/b.ts"]);
    const pathological = parseCodeowners(`${"*a".repeat(100)}z @owner`).rules;
    expect([...matchCodeowners(pathological, ["a".repeat(200)]).keys()]).toEqual([]);
  });
  it("uses the first base-ref CODEOWNERS file and skips provider-invalid owners", async () => {
    vi.mocked(hubApi).mockRejectedValueOnce(new Error("github.com 404: missing"))
      .mockResolvedValueOnce({ type: "file", encoding: "base64", content: btoa("* @global\n*.ts @invalid\n"), size: 24 })
      .mockResolvedValueOnce({ errors: [{ line: 2, path: "CODEOWNERS", kind: "Invalid owner", message: "No write access" }] });
    const result = await listCodeowners(account, "a/b", "pinned-base");
    expect(result.path).toBe("CODEOWNERS");
    expect(result.validationError).toBeNull();
    expect([...matchCodeowners(result.rules, ["app.ts"]).keys()]).toEqual(["@global"]);
    expect(hubApi).toHaveBeenNthCalledWith(1, account, "GET", "/repos/a/b/contents/.github/CODEOWNERS?ref=pinned-base");
    expect(hubApi).toHaveBeenLastCalledWith(account, "GET", "/repos/a/b/codeowners/errors?ref=pinned-base");
  });
  it("keeps provider validation failures explicit", async () => {
    vi.mocked(hubApi).mockResolvedValueOnce({ type: "file", encoding: "base64", content: btoa("* @global\n"), size: 10 })
      .mockRejectedValueOnce(new Error("403 unavailable"));
    const result = await listCodeowners(account, "a/b", "base");
    expect(result.validationError).toContain("403");
    expect(result.rules).toHaveLength(1);
  });
});
