import { describe, expect, it } from "vitest";

import {
  extractIssueKeys,
  issueBrowseUrl,
  normalizeIssueKey,
  parseIssueRef,
} from "@/lib/jira/issue-key";

describe("normalizeIssueKey", () => {
  it("upper-cases and trims valid keys", () => {
    expect(normalizeIssueKey("abc-123")).toBe("ABC-123");
    expect(normalizeIssueKey("  PROJ-1  ")).toBe("PROJ-1");
    expect(normalizeIssueKey("A1_B-9")).toBe("A1_B-9");
  });

  it("rejects anything that is not a plain key", () => {
    for (const invalid of [
      "",
      "   ",
      "PROJ",
      "PROJ-",
      "-1",
      "1PROJ-1",
      "PROJ-abc",
      "PROJ-12345678901",
      "PROJ-1/../admin",
      "PROJ-1 OR 1=1",
      "PROJ-1?expand=all",
      "PROJ 1",
    ]) {
      expect(normalizeIssueKey(invalid)).toBeNull();
    }
  });
});

describe("parseIssueRef", () => {
  it("accepts a bare key", () => {
    expect(parseIssueRef("abc-1")).toBe("ABC-1");
  });

  it("accepts what users actually paste from Jira", () => {
    expect(parseIssueRef("https://acme.atlassian.net/browse/ABC-42")).toBe("ABC-42");
    expect(parseIssueRef("https://acme.atlassian.net/browse/abc-42?filter=x")).toBe("ABC-42");
    expect(
      parseIssueRef("https://acme.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ABC-7"),
    ).toBe("ABC-7");
  });

  it("returns null for links without a key", () => {
    expect(parseIssueRef("https://acme.atlassian.net/browse/")).toBeNull();
    expect(parseIssueRef("just some text")).toBeNull();
    expect(parseIssueRef("")).toBeNull();
  });
});

describe("extractIssueKeys", () => {
  it("finds keys in branch names and commit subjects", () => {
    expect(extractIssueKeys("feature/ABC-123-login-fix")).toEqual(["ABC-123"]);
    expect(extractIssueKeys("fix(auth): ABC-1 and DEF-22 both")).toEqual(["ABC-1", "DEF-22"]);
    expect(extractIssueKeys("abc-9 lower case branch")).toEqual(["ABC-9"]);
  });

  it("deduplicates and returns nothing when there is nothing to find", () => {
    expect(extractIssueKeys("ABC-1 ABC-1")).toEqual(["ABC-1"]);
    expect(extractIssueKeys("no keys here")).toEqual([]);
    expect(extractIssueKeys("")).toEqual([]);
  });
});

describe("issueBrowseUrl", () => {
  it("joins base and key without doubling the slash", () => {
    expect(issueBrowseUrl("https://acme.atlassian.net", "ABC-1")).toBe(
      "https://acme.atlassian.net/browse/ABC-1",
    );
    expect(issueBrowseUrl("https://acme.atlassian.net///", "ABC-1")).toBe(
      "https://acme.atlassian.net/browse/ABC-1",
    );
    expect(issueBrowseUrl("", "ABC-1")).toBe("");
  });
});
