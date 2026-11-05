import { describe, expect, it } from "vitest";
import { identityDifferences, validateIdentity, type IdentityValues } from "./identity";
const profile: IdentityValues = { name: "Alice", email: "alice@example.test", signing_format: "openpgp", signing_key: "", sign_commits: false };
describe("identity profile preview", () => {
  it("normalizes Git default format and boolean aliases when comparing", () => {
    expect(identityDifferences(profile, { fingerprint: "snapshot", local: {}, effective: { "user.name": "Alice", "user.email": "alice@example.test" } })).toEqual([]);
    expect(identityDifferences({ ...profile, sign_commits: true, signing_key: "key" }, { fingerprint: "snapshot", local: {}, effective: { "user.name": "Alice", "user.email": "work@example.test", "commit.gpgsign": "yes", "user.signingkey": "key" } })).toEqual(["user.email"]);
  });
  it("rejects malformed author identities and enabled signing without a key", () => {
    expect(() => validateIdentity({ ...profile, name: "Alice\nInjected" })).toThrow();
    expect(() => validateIdentity({ ...profile, email: "not an email" })).toThrow();
    expect(() => validateIdentity({ ...profile, sign_commits: true })).toThrow();
  });
});
