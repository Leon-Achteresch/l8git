import { describe, expect, it } from "vitest";
import { parseCommitInspectMetadata } from "./commit-inspect-metadata";

describe("parseCommitInspectMetadata", () => {
  it("separates fuller metadata and diff statistics from the commit message", () => {
    const parsed = parseCommitInspectMetadata(`commit abcdef1234567890
Merge: abc def
Author:     Léon Example <leon@example.com>
AuthorDate: Wed Sep 9 12:00:00 2026 +0200
Commit:     Another Author <other@example.com>
CommitDate: Wed Sep 9 13:00:00 2026 +0200

    Refine commit details

    Keep the message readable.
        Preserve indentation.

 src/example.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)`);
    expect(parsed).toEqual({
      hash: "abcdef1234567890",
      author: "Léon Example",
      date: "Wed Sep 9 12:00:00 2026 +0200",
      subject: "Refine commit details",
      body: "Keep the message readable.\n    Preserve indentation.",
    });
  });
  it("handles CRLF, empty messages and plain text", () => {
    expect(
      parseCommitInspectMetadata("commit abc123\r\n\r\n    Title\r\n").subject,
    ).toBe("Title");
    expect(
      parseCommitInspectMetadata("commit abc123\nAuthor: A\n").subject,
    ).toBe("");
    expect(parseCommitInspectMetadata("A plain subject").subject).toBe(
      "A plain subject",
    );
    expect(parseCommitInspectMetadata("").subject).toBe("");
  });
});
