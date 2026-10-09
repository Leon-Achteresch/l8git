import { describe, expect, it } from "vitest";
import {
  addCommitBodyTemplate, addCommitTrailer, commitPreflight, inspectCommitMessage,
  joinCommitMessage, normalizedCommitMessage, readConventionalSubject,
  splitCommitMessage, updateConventionalSubject,
} from "./commit-message";

describe("commit message editing", () => {
  it("keeps descriptions pasted with either one or two separating newlines", () => {
    expect(splitCommitMessage("Fix login\nKeep the return URL.")).toEqual({ subject: "Fix login", body: "Keep the return URL." });
    expect(splitCommitMessage("Fix login\r\n\r\nKeep the return URL.\r\n\nTests: unit suite")).toEqual({
      subject: "Fix login", body: "Keep the return URL.\n\nTests: unit suite",
    });
  });

  it("preserves intentional body whitespace while editing", () => {
    const { subject, body } = splitCommitMessage("feat: add editor\n\n\n    code example\n");
    expect(joinCommitMessage(subject, body)).toBe("feat: add editor\n\n\n    code example\n");
    expect(joinCommitMessage("New title", "\n")).toBe("New title\n\n\n");
  });

  it("normalizes outer whitespace and the separating blank line for comparisons", () => {
    expect(normalizedCommitMessage("Fix login \r\nExplain why.\r\n")).toBe("Fix login\n\nExplain why.");
  });
});

describe("conventional commit assistance", () => {
  it("changes type without stacking prefixes or removing scope and breaking state", () => {
    expect(updateConventionalSubject("feat(api)!: support tokens", { type: "fix" })).toBe("fix(api)!: support tokens");
    expect(updateConventionalSubject("custom-type(cli): handle EOF", { type: "test" })).toBe("test(cli): handle EOF");
  });

  it("preserves plain text and permits custom types", () => {
    expect(updateConventionalSubject("Support login: remember return URL", { type: "feat" })).toBe("feat: Support login: remember return URL");
    expect(readConventionalSubject("release-tools(v2)!: migrate version file")).toEqual({
      type: "release-tools", scope: "v2", breaking: true, description: "migrate version file",
    });
  });

  it("removes formatting without losing the message", () => {
    expect(updateConventionalSubject("fix(api)!: fix retry loop", { type: null })).toBe("fix retry loop");
    expect(updateConventionalSubject("docs(ui): add instructions", { scope: "", breaking: true })).toBe("docs!: add instructions");
  });

  it("keeps scope editing on a single valid subject line", () => {
    expect(updateConventionalSubject("fix: avoid crash", { scope: " (cli)\n" })).toBe("fix(cli): avoid crash");
  });

  it("adds structures without overwriting the author's explanation", () => {
    expect(addCommitBodyTemplate("Existing explanation.\n", "Why:\n<why>")).toBe("Existing explanation.\n\nWhy:\n<why>");
  });

  it("groups trailers, prevents duplicates and rejects line injection", () => {
    expect(addCommitTrailer("Fixes a race.", "Refs", "#12")).toBe("Fixes a race.\n\nRefs: #12");
    expect(addCommitTrailer("Fixes a race.\n\nRefs: #12", "Closes", "#13\nSigned-off-by: injected")).toBe("Fixes a race.\n\nRefs: #12\nCloses: #13 Signed-off-by: injected");
    expect(addCommitTrailer("Refs: #12", "Refs", " #12 ")).toBe("Refs: #12");
    expect(addCommitTrailer("A body", "Closes", "   ")).toBe("A body");
  });
});

describe("advisory message insights", () => {
  const codes = (subject: string, body = "") => inspectCommitMessage(subject, body).insights.map((i) => i.code);

  it("counts Unicode code points instead of UTF-16 units", () => {
    expect(inspectCommitMessage("🚀".repeat(40), "").subjectLength).toBe(40);
    expect(codes("🚀".repeat(40))).not.toContain("longSubject");
    expect(codes("a".repeat(73))).toContain("longSubject");
  });

  it("recognizes vague subjects and unfinished conventional messages", () => {
    expect(codes("fix: WIP")).toContain("vagueSubject");
    expect(codes("feat(ui): ")).toContain("missingDescription");
    expect(codes("fix: restore expired sessions")).toEqual([]);
  });

  it("requests a migration explanation for a breaking subject", () => {
    expect(codes("feat(api)!: remove v1")).toContain("breakingExplanation");
    expect(codes("feat(api)!: remove v1", "BREAKING CHANGE: Use v2 endpoints.")).not.toContain("breakingExplanation");
    expect(codes("feat(api)!: remove v1", "BREAKING CHANGE: ")).toContain("breakingExplanation");
  });

  it("does not flag long links, Git trailers or indented code as prose", () => {
    const body = [`Documentation: https://example.org/${"x".repeat(120)}`, `    ${"x".repeat(120)}`, `Refs: ${"x".repeat(120)}`, "x".repeat(101)].join("\n");
    expect(inspectCommitMessage("Document authentication", body).insights).toEqual([{ code: "longBodyLines", count: 1, lines: "4" }]);
  });

  it("finds leftover template hints and whitespace without affecting commit eligibility", () => {
    expect(codes("feat: <summary>", "Why:\n<why>")).toContain("placeholder");
    expect(codes("A good subject ", "An explanation.  ")).toContain("trailingWhitespace");
    expect(commitPreflight({ message: "feat: <summary>", stagedFiles: 1, conflictFiles: 0 })).toBeNull();
  });
});

describe("commit preflight", () => {
  const normal = { message: "fix: preserve return URL", stagedFiles: 1, conflictFiles: 0 };
  const amend = { hash: "abc123", commitMessage: normal.message };

  it("requires a subject and staged changes for a normal commit", () => {
    expect(commitPreflight({ ...normal, message: "\n\nOnly a body" })).toBe("missingSubject");
    expect(commitPreflight({ ...normal, stagedFiles: 0 })).toBe("emptyIndex");
    expect(commitPreflight(normal)).toBeNull();
  });

  it("blocks unresolved conflicts even when other files are staged", () => {
    expect(commitPreflight({ ...normal, conflictFiles: 1 })).toBe("conflicts");
  });

  it("allows message-only amendment and rejects accidental no-op rewrites", () => {
    expect(commitPreflight({ ...normal, amend, stagedFiles: 0 })).toBe("unchangedAmend");
    expect(commitPreflight({ ...normal, amend, stagedFiles: 0, message: "fix: preserve authentication redirects" })).toBeNull();
    expect(commitPreflight({ ...normal, amend })).toBeNull();
  });

  it("requires the originally selected amend target to remain HEAD", () => {
    expect(commitPreflight({ ...normal, amend, headHash: "different" })).toBe("amendTargetChanged");
    expect(commitPreflight({ ...normal, amend, headHash: null })).toBe("amendUnavailable");
    expect(commitPreflight({ ...normal, amend, headHash: "abc123" })).toBeNull();
  });
});
