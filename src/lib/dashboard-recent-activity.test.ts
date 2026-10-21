import { describe, expect, it } from "vitest";
import { selectRecentActivity } from "./dashboard-aggregations";
import type { Commit, PullRequest, StashEntry } from "./repo-store";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();

describe("selectRecentActivity", () => {
  it("returns the newest entries across sources, ties in input order, like a full stable sort", () => {
    // Pseudo-random days with many ties.
    const days = Array.from({ length: 60 }, (_, i) => (i * 37) % 11);
    const commits = days.slice(0, 30).map((d, i) => ({ hash: `h${i}`, short_hash: `h${i}`, subject: `c${i}`, author: "a", date: day(d) }) as Commit);
    const stashes = days.slice(30, 45).map((d, i) => ({ refname: `stash@{${i}}`, subject: `s${i}`, message: "", branch: "main", date: day(d) }) as StashEntry);
    const prs = days.slice(45).map((d, i) => ({ number: i, title: `p${i}`, author: "a", updated_at: day(d), created_at: day(0) }) as PullRequest);
    const all = [
      ...commits.map(c => ({ id: `c-${c.hash}`, ts: Date.parse(c.date) })),
      ...stashes.map(s => ({ id: `s-${s.refname}`, ts: Date.parse(s.date) })),
      ...prs.map(p => ({ id: `p-${p.number}`, ts: Date.parse(p.updated_at) })),
    ];
    for (const limit of [1, 10, 25, 100]) {
      const expected = [...all].sort((a, b) => b.ts - a.ts).slice(0, limit).map(x => x.id);
      expect(selectRecentActivity({ commits, stashes, prs, limit }).map(x => x.id)).toEqual(expected);
    }
  });

  it("skips unparseable dates", () => {
    const commits = [{ hash: "x", short_hash: "x", subject: "", author: "a", date: "not a date" } as Commit];
    expect(selectRecentActivity({ commits })).toEqual([]);
  });
});
