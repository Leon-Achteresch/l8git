import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinCommitMessage } from "./commit-message";
import { inspectCoAuthorDraft, parseCoAuthors, parseGitDate } from "./commit-trailers";

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

describe("co-author draft preview", () => {
  const subject = "Document export behavior";
  const first = "Co-authored-by: Élodie O’Neil (開発) <elo+fixture@example.invalid>";
  const second = "co-AUTHORED-by: 李 静 <li@example.invalid>";

  it("distinguishes placement and format and gives the selection offsets in the draft", () => {
    const body = "🧪 Details\r\n" + first + "\r\n\r\nCo-authored by: Jane Doe";
    const [title, cited, malformed] = inspectCoAuthorDraft(second, body);
    expect(title).toMatchObject({ field: "subject", placementHint: true, formatHint: false });
    expect(cited).toMatchObject({
      field: "body", line: 2, start: "🧪 Details\n".length, text: first,
      placementHint: true, formatHint: false,
    });
    expect(malformed).toMatchObject({ line: 4, formatHint: true, placementHint: false });
    expect(inspectCoAuthorDraft(subject, "Co-authored-by:  <a@example.invalid>")[0]?.formatHint).toBe(true);
    expect(inspectCoAuthorDraft(subject, first + "\n    continuation")[0]?.formatHint).toBe(true);
    expect(inspectCoAuthorDraft(subject, "```text\n" + first + "\n```\n> " + second)).toEqual([]);
    expect(inspectCoAuthorDraft(subject, "Co-authored by the export team.")).toEqual([]);
  });

  it("matches real Git's standard trailer placement while leaving identity and authored text untouched", () => {
    const repo = mkdtempSync(join(tmpdir(), "l8git-f49-git-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: repo,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        GIT_ALLOW_PROTOCOL: "",
      },
    });
    try {
      git("init", "-q");
      git("config", "user.name", "Fixture Committer");
      git("config", "user.email", "fixture@example.invalid");
      const read = (body: string) => {
        const message = joinCommitMessage(subject, body);
        git("commit", "-q", "--no-gpg-sign", "--allow-empty", "-m", message);
        expect(git("show", "-s", "--format=%B", "HEAD").trimEnd()).toBe(message);
        return git("show", "-s", "--format=%(trailers:only,unfold)", "HEAD").trim();
      };
      const correct = `Review the export.\n\n${first}\nRefs: #42\n${second}`;
      expect(read(correct)).toBe(`${first}\nRefs: #42\n${second}`);
      expect(inspectCoAuthorDraft(subject, correct)).toMatchObject([
        { text: first, placementHint: false, formatHint: false },
        { text: second, placementHint: false, formatHint: false },
      ]);
      for (const body of [`Review the export.\n${first}`, `${first}\n\nChosen closing paragraph.`]) {
        expect(read(body)).toBe("");
        expect(inspectCoAuthorDraft(subject, body)[0]?.placementHint).toBe(true);
      }
      const malformed = "Co-authored-by: Missing address";
      expect(read(malformed)).toBe(malformed);
      expect(inspectCoAuthorDraft(subject, malformed)[0]).toMatchObject({ formatHint: true, placementHint: false });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
