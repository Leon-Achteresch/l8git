import { describe, expect, it } from "vitest";
import { parseCoAuthors, parseGitDate } from "./commit-trailers";

describe("commit author hover", () => {
  it("parses unique co-author trailers", () => {
    const body = "Fix\n\nCo-authored-by: Claude <noreply@anthropic.com>\nco-authored-by: Claude <NOREPLY@anthropic.com>\nCo-Authored-By: Jo Doe <jo@x.dev>";
    expect(parseCoAuthors(body)).toEqual([
      { name: "Claude", email: "noreply@anthropic.com" },
      { name: "Jo Doe", email: "jo@x.dev" },
    ]);
  });

  it("parses git fuller dates", () => {
    expect(parseGitDate("Thu Nov 13 10:05:09 2026 +0100")).toBe("2026-11-13T09:05:09.000Z");
    expect(parseGitDate("2026-11-13T10:05:09+01:00")).toBe("2026-11-13T09:05:09.000Z");
    expect(parseGitDate("garbage")).toBeNull();
    expect(parseGitDate("")).toBeNull();
  });
});
