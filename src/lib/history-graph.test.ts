import { describe, expect, it } from 'vitest';
import { buildGraph, historyGraph } from './graph';
import type { Branch, Commit } from './repo-store';

const commit = (hash: string, parents: string[]): Commit => ({
  hash, short_hash: hash, subject: hash, author: '', email: '', date: '', body: '', parents, tags: [],
});
const commits = [commit('A', ['B']), commit('B', ['C']), commit('C', [])];
const branches: Branch[] = [{ name: 'main', tip: ' a ', is_current: true, is_remote: false }];

describe('history graph snapshots', () => {
  it('reuses the graph across mounts with the same immutable inputs', () => {
    const graph = historyGraph(commits, branches);
    expect(historyGraph(commits, branches)).toBe(graph);
    expect(graph.rows[0].lanesBefore).toEqual(['A']);
  });

  it('reflects replacement commits even if the count and endpoints stay the same', () => {
    const graph = historyGraph(commits, branches);
    const changed = [commits[0], { ...commits[1], subject: 'updated', parents: [] }, commits[2]];
    const refreshed = historyGraph(changed, branches);
    expect(refreshed).not.toBe(graph);
    expect(refreshed.rows[1].commit).toBe(changed[1]);
    expect(refreshed.rows[1].lanesAfter).not.toEqual(graph.rows[1].lanesAfter);
  });

  it('rebuilds after a local branch becomes remote with the same tip', () => {
    const before = historyGraph(commits, branches);
    const remotes = [{ ...branches[0], is_remote: true }];
    const after = historyGraph(commits, remotes);
    expect(after).not.toBe(before);
    expect(after).toEqual(buildGraph(commits, remotes));
    expect(after.rows[0].lanesBefore).toEqual([]);
  });
});
