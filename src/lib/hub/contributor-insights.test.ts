import { describe, expect, it } from "vitest";

import { contributorInsights, langName } from "./contributor-insights";
import type { HubCommitSample } from "./types";

const now = Date.parse("2026-10-14T12:00:00Z");
const DAY = 86_400_000;
const commit = (login: string, daysAgo: number, files: [string, number][] | null = null): HubCommitSample => ({
  sha: `${login}${daysAgo}`,
  message: "m",
  url: "",
  date: new Date(now - daysAgo * DAY).toISOString(),
  login,
  avatarUrl: null,
  additions: 10,
  deletions: 2,
  files: files?.map(([path, additions]) => ({ path, additions, deletions: 0 })) ?? null,
});

describe("contributorInsights", () => {
  it("builds people from a commit sample when no weekly stats exist", () => {
    const r = contributorInsights(
      {
        weekly: null,
        computing: false,
        commits: [commit("ann", 1, [["src/a.ts", 30], ["src/b.rs", 5]]), commit("ann", 9), commit("bob", 100, [["README.md", 4]])],
      },
      [{ login: "bob", avatarUrl: null, contributions: 50 }, { login: "cy", avatarUrl: null, contributions: 3 }],
      now,
    );
    expect(r.source).toBe("sample");
    expect(r.people.map((p) => [p.login, p.commits])).toEqual([["bob", 50], ["cy", 3], ["ann", 2]]);
    const ann = r.people.find((p) => p.login === "ann")!;
    expect(ann.languages).toEqual([{ name: "TypeScript", lines: 30 }, { name: "Rust", lines: 5 }]);
    expect(ann.dirs[0]).toEqual({ name: "src", lines: 35 });
    expect(ann.additions).toBe(20);
    expect(ann.longestStreak).toBe(2);
    expect(r.totals.active30).toBe(1);
    expect(r.totals.busFactor).toBe(1);
    expect(r.languages[0].name).toBe("TypeScript");
  });

  it("prefers all-time weekly stats", () => {
    const w = (daysAgo: number, c: number) => ({ w: (now - daysAgo * DAY) / 1000, a: c * 3, d: c, c });
    const r = contributorInsights(
      {
        weekly: [
          { login: "ann", avatarUrl: null, weeks: [w(700, 4), w(21, 0), w(14, 1), w(7, 1), w(0, 0)] },
          { login: "bob", avatarUrl: null, weeks: [w(30, 5)] },
        ],
        computing: false,
        commits: [commit("ghost", 1), commit("ann", 2)],
      },
      [],
      now,
    );
    expect(r.source).toBe("weekly");
    expect(r.people.map((p) => p.login)).toEqual(["ann", "bob"]);
    expect(r.people[0].lastActive).toBe(now - 2 * DAY);
    expect(r.people[0]).toMatchObject({ login: "ann", commits: 6, additions: 18, activeWeeks: 3, longestStreak: 2 });
    expect(r.people[0].weekly.reduce((s, n) => s + n, 0)).toBe(2);
    expect(r.totals).toMatchObject({ commits: 11, busFactor: 1, active30: 2 });
  });
});

describe("langName", () => {
  it("maps paths to linguist-style names", () => {
    expect(langName("a/b.tsx")).toBe("TypeScript");
    expect(langName("Dockerfile")).toBe("Dockerfile");
    expect(langName("x.go")).toBe("Go");
    expect(langName("LICENSE")).toBeNull();
  });
});
