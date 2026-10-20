import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Commit } from "@/lib/repo-store";
import type { GraphRow } from "@/lib/graph";
import { CommitGraphShapes } from "./commit-graph-cell";

const paths = (row: GraphRow, top: number) =>
  [...renderToStaticMarkup(createElement(CommitGraphShapes, { row, maxLanes: 2, originColors: new Map(), colWidth: 32, top, rowHeight: 28 })).matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

describe("CommitGraphShapes", () => {
  const commit = { hash: "c", parents: ["p"], tags: [] } as unknown as Commit;
  const row: GraphRow = {
    commit,
    lane: 0,
    color: "#f00",
    lanesBefore: ["c", "x"],
    lanesAfter: ["p", "x"],
    mergedLanes: [],
    laneOriginsBefore: ["main", "topic"],
    laneOriginsAfter: ["main", "topic"],
  };

  it("draws the row at its offset in the shared SVG, with a passing lane as one path", () => {
    expect(paths(row, 100)).toEqual([
      "M 10.5 100 L 10.5 114", // commit lane into the dot
      "M 21.5 100 L 21.5 128", // lane 1 passes straight through
      "M 10.5 114 L 10.5 128", // commit lane out of the dot
    ]);
  });
});
