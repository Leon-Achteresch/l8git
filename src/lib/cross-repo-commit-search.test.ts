import { describe, expect, it } from "vitest";

import { runCrossRepoSearch, type RepoSearchOutcome } from "./cross-repo-commit-search";
import type { Commit } from "./repo-store";

const commit = (hash: string): Commit => ({
  hash,
  short_hash: hash.slice(0, 7),
  author: "a",
  email: "a@x",
  date: "2026-01-01T00:00:00Z",
  subject: hash,
  body: "",
  parents: [],
  tags: [],
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("runCrossRepoSearch", () => {
  it("never runs more than `concurrency` searches at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const paths = Array.from({ length: 12 }, (_, i) => `/r${i}`);
    await runCrossRepoSearch({
      paths,
      query: "fix",
      concurrency: 3,
      isStale: () => false,
      onResult: () => {},
      search: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight--;
        return [];
      },
    });
    expect(peak).toBe(3);
  });

  it("reports a fast repo before a slow one and keeps going after a failure", async () => {
    const slow = deferred<Commit[]>();
    const seen: RepoSearchOutcome[] = [];
    const run = runCrossRepoSearch({
      paths: ["/slow", "/bad", "/fast"],
      query: "fix",
      concurrency: 3,
      isStale: () => false,
      onResult: (o) => seen.push(o),
      search: (path) => {
        if (path === "/slow") return slow.promise;
        if (path === "/bad") return Promise.reject(new Error("not a git repository"));
        return Promise.resolve([commit("f".repeat(40))]);
      },
    });
    await tick();
    expect(seen.map((o) => [o.path, o.ok])).toEqual([
      ["/bad", false],
      ["/fast", true],
    ]);
    slow.resolve([commit("s".repeat(40))]);
    await run;
    expect(seen.map((o) => o.path)).toEqual(["/bad", "/fast", "/slow"]);
    expect(seen[0]).toMatchObject({ ok: false, error: expect.stringContaining("not a git repository") });
  });

  it("drops outcomes and starts no new repos once the query is stale", async () => {
    let stale = false;
    const first = deferred<Commit[]>();
    const started: string[] = [];
    const seen: string[] = [];
    const run = runCrossRepoSearch({
      paths: ["/a", "/b", "/c"],
      query: "fix",
      concurrency: 1,
      isStale: () => stale,
      onResult: (o) => seen.push(o.path),
      search: (path) => {
        started.push(path);
        return path === "/a" ? first.promise : Promise.resolve([]);
      },
    });
    stale = true;
    first.resolve([commit("a".repeat(40))]);
    await run;
    expect(started).toEqual(["/a"]);
    expect(seen).toEqual([]);
  });

  it("caps hits per repo and passes the cap to the search", async () => {
    const limits: number[] = [];
    const seen: RepoSearchOutcome[] = [];
    await runCrossRepoSearch({
      paths: ["/a"],
      query: "fix",
      perRepoLimit: 2,
      isStale: () => false,
      onResult: (o) => seen.push(o),
      search: async (_p, _q, limit) => {
        limits.push(limit);
        return ["1", "2", "3", "4"].map((n) => commit(n.repeat(40)));
      },
    });
    expect(limits).toEqual([2]);
    expect(seen[0].ok && seen[0].hits.length).toBe(2);
  });
});
