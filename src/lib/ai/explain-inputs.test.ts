import { describe, expect, it } from "vitest";

import {
  branchTip,
  commitsInRange,
  fitDiffToBudget,
  formatCommitLine,
  formatCommitList,
  formatDiffStat,
  joinFileDiffs,
  mergeFileStats,
  parseCommitHeader,
  pickDefaultBaseBranch,
  splitPrDraft,
} from "@/lib/ai/explain-inputs";
import type { Branch, Commit } from "@/lib/repo-store";

function commit(partial: Partial<Commit> & { hash: string }): Commit {
  return {
    short_hash: partial.hash.slice(0, 7),
    author: "Ada",
    email: "ada@example.com",
    date: "2026-01-01T00:00:00Z",
    subject: "subject",
    body: "",
    parents: [],
    tags: [],
    ...partial,
  };
}

function branch(name: string, tip: string, isRemote = false): Branch {
  return { name, tip, is_remote: isRemote, is_current: false };
}

describe("fitDiffToBudget", () => {
  it("keeps short diffs untouched", () => {
    const out = fitDiffToBudget("  diff --git a b\n+line  ", 1000);
    expect(out.text).toBe("diff --git a b\n+line");
    expect(out.truncated).toBe(false);
    expect(out.omittedChars).toBe(0);
  });

  it("cuts on a line boundary and appends a note", () => {
    const diff = Array.from({ length: 50 }, (_, i) => `+line ${i}`).join("\n");
    const out = fitDiffToBudget(diff, 120);
    expect(out.truncated).toBe(true);
    expect(out.omittedChars).toBeGreaterThan(0);
    expect(out.text).toContain("characters omitted");
    const kept = out.text.split("\n\n[truncated")[0];
    expect(kept.endsWith("\n")).toBe(false);
    expect(kept.length).toBeLessThanOrEqual(120);
  });

  it("drops everything when the budget is zero", () => {
    const out = fitDiffToBudget("abc", 0);
    expect(out.text).toBe("");
    expect(out.truncated).toBe(true);
    expect(out.omittedChars).toBe(3);
  });
});

describe("joinFileDiffs", () => {
  it("labels each file section", () => {
    const out = joinFileDiffs(
      [
        { file: "a.ts", diff: "+a" },
        { file: "b.ts", diff: "+b" },
      ],
      5000,
    );
    expect(out.text).toBe("--- a.ts ---\n+a\n\n--- b.ts ---\n+b");
    expect(out.truncated).toBe(false);
  });

  it("skips empty diffs", () => {
    const out = joinFileDiffs(
      [
        { file: "a.ts", diff: "   " },
        { file: "b.ts", diff: "+b" },
      ],
      5000,
    );
    expect(out.text).toBe("--- b.ts ---\n+b");
  });

  it("notes files that no longer fit the budget", () => {
    const big = Array.from({ length: 200 }, (_, i) => `+line ${i}`).join("\n");
    const out = joinFileDiffs(
      [
        { file: "a.ts", diff: big },
        { file: "b.ts", diff: big },
        { file: "c.ts", diff: big },
      ],
      600,
    );
    expect(out.truncated).toBe(true);
    expect(out.text).toContain("further changed files omitted");
    expect(out.text).toContain("--- a.ts ---");
  });
});

describe("parseCommitHeader", () => {
  const header = [
    "commit 1111111111111111111111111111111111111111",
    "Author:     Ada <ada@example.com>",
    "AuthorDate: Mon Jan 1 10:00:00 2026 +0100",
    "Commit:     Ada <ada@example.com>",
    "CommitDate: Mon Jan 1 10:00:00 2026 +0100",
    "",
    "    feat(core): add explain sheet",
    "",
    "    Adds a shared sheet for AI explanations.",
    "    Second body line.",
    "",
    " src/a.ts | 2 +-",
    " src/b.ts | 4 ++++",
    " 2 files changed, 5 insertions(+), 1 deletion(-)",
  ].join("\n");

  it("splits subject, body and stat", () => {
    const parsed = parseCommitHeader(header);
    expect(parsed.subject).toBe("feat(core): add explain sheet");
    expect(parsed.body).toBe(
      "Adds a shared sheet for AI explanations.\nSecond body line.",
    );
    expect(parsed.stat).toContain("2 files changed, 5 insertions(+), 1 deletion(-)");
    expect(parsed.stat).toContain("src/a.ts | 2 +-");
  });

  it("handles a subject-only commit", () => {
    const parsed = parseCommitHeader(
      ["commit abc", "Author: Ada", "", "    chore: bump", "", " a.ts | 1 +"].join("\n"),
    );
    expect(parsed.subject).toBe("chore: bump");
    expect(parsed.body).toBe("");
    expect(parsed.stat).toBe("a.ts | 1 +");
  });

  it("survives empty input", () => {
    expect(parseCommitHeader("")).toEqual({ subject: "", body: "", stat: "" });
  });
});

describe("formatCommitList", () => {
  const commits = [
    commit({ hash: "aaaaaaa1", subject: "feat: one", author: "Ada" }),
    commit({ hash: "bbbbbbb2", subject: "fix: two", author: "Grace" }),
  ];

  it("renders hash, subject and author", () => {
    expect(formatCommitLine(commits[0])).toBe("aaaaaaa feat: one — Ada");
  });

  it("falls back when the subject is empty", () => {
    expect(formatCommitLine(commit({ hash: "cccccc3", subject: "  " }))).toContain(
      "(no subject)",
    );
  });

  it("keeps the list inside the char budget and counts the rest", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      commit({ hash: `hash${i}`.padEnd(8, "0"), subject: `commit number ${i}` }),
    );
    const out = formatCommitList(many, { maxChars: 120 });
    expect(out).toContain("further commits");
    expect(out.split("\n").length).toBeLessThan(30);
  });

  it("respects the commit limit", () => {
    expect(formatCommitList(commits, { limit: 1 })).toBe(
      "aaaaaaa feat: one — Ada\n… and 1 further commits",
    );
  });

  it("returns an empty string without commits", () => {
    expect(formatCommitList([])).toBe("");
  });
});

describe("commitsInRange", () => {
  const commits = [
    commit({ hash: "d", parents: ["c"], subject: "d" }),
    commit({ hash: "c", parents: ["b"], subject: "c" }),
    commit({ hash: "b", parents: ["a"], subject: "b" }),
    commit({ hash: "a", parents: [], subject: "a" }),
  ];

  it("returns only commits missing on the base", () => {
    expect(commitsInRange(commits, "d", "b").map((c) => c.hash)).toEqual(["d", "c"]);
  });

  it("returns the whole history without a base", () => {
    expect(commitsInRange(commits, "d", null).map((c) => c.hash)).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  it("normalises hashes and honours the limit", () => {
    expect(commitsInRange(commits, "  D  ", "A", 2).map((c) => c.hash)).toEqual([
      "d",
      "c",
    ]);
  });

  it("returns nothing for an unknown head", () => {
    expect(commitsInRange(commits, "", "a")).toEqual([]);
  });
});

describe("mergeFileStats / formatDiffStat", () => {
  it("sums per file and sorts by churn", () => {
    const merged = mergeFileStats([
      [{ path: "a.ts", additions: 1, deletions: 1 }],
      [
        { path: "a.ts", additions: 2, deletions: 0 },
        { path: "b.ts", additions: 10, deletions: 0 },
      ],
    ]);
    expect(merged).toEqual([
      { path: "b.ts", additions: 10, deletions: 0, binary: undefined },
      { path: "a.ts", additions: 3, deletions: 1, binary: undefined },
    ]);
  });

  it("renders binaries and a total line", () => {
    const out = formatDiffStat([
      { path: "a.ts", additions: 3, deletions: 1 },
      { path: "logo.png", additions: 0, deletions: 0, binary: true },
    ]);
    expect(out).toBe("a.ts | +3 -1\nlogo.png | binary\n2 files changed, +3 -1");
  });

  it("caps the number of listed files", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `file-${i}.ts`,
      additions: 1,
      deletions: 0,
    }));
    const out = formatDiffStat(files, { limit: 3 });
    expect(out).toContain("… and 7 further files");
    expect(out).toContain("10 files changed, +10 -0");
  });

  it("returns an empty string without files", () => {
    expect(formatDiffStat([])).toBe("");
  });
});

describe("splitPrDraft", () => {
  it("extracts a leading title line", () => {
    const out = splitPrDraft("Title: Add explain sheet\n\nSummary text");
    expect(out.title).toBe("Add explain sheet");
    expect(out.body).toBe("Summary text");
  });

  it("accepts markdown decoration around the title", () => {
    expect(splitPrDraft("**Title:** \"Fix flaky test\"\n\nBody").title).toBe(
      "Fix flaky test",
    );
  });

  it("keeps the text as body when there is no title line", () => {
    const out = splitPrDraft("## Summary\n\nSomething happened");
    expect(out.title).toBeNull();
    expect(out.body).toBe("## Summary\n\nSomething happened");
  });

  it("handles empty answers", () => {
    expect(splitPrDraft("   ")).toEqual({ title: null, body: "" });
  });
});

describe("branch helpers", () => {
  const branches = [
    branch("feature/x", "AAA"),
    branch("origin/main", "BBB", true),
    branch("develop", "CCC"),
  ];

  it("prefers the highest priority default branch", () => {
    expect(pickDefaultBaseBranch(branches)).toBe("origin/main");
  });

  it("skips the excluded branch", () => {
    expect(pickDefaultBaseBranch(branches, "origin/main")).toBe("develop");
  });

  it("falls back to any local branch", () => {
    expect(pickDefaultBaseBranch([branch("odd", "AAA")])).toBe("odd");
    expect(pickDefaultBaseBranch([])).toBeNull();
  });

  it("resolves and normalises branch tips", () => {
    expect(branchTip(branches, "feature/x")).toBe("aaa");
    expect(branchTip(branches, "missing")).toBeNull();
    expect(branchTip(branches, null)).toBeNull();
  });
});
