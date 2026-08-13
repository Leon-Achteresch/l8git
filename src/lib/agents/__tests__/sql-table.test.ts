import { describe, expect, it } from "vitest";

import { parseSqlTable } from "@/lib/agents/plugins/sql-table";

const payload = {
  columns: ["LE_NR", "REF_LP"],
  rows: [["301676316", 77586], ["301676317", null]],
  row_count: 2,
  truncated: false,
  elapsed_ms: 19.7,
};

describe("parseSqlTable", () => {
  it("liest ein MCP-Textergebnis", () => {
    const table = parseSqlTable([{ type: "text", text: JSON.stringify(payload) }]);
    expect(table).toEqual({
      columns: ["LE_NR", "REF_LP"],
      rows: [["301676316", 77586], ["301676317", null]],
      rowCount: 2,
      truncated: false,
      elapsedMs: 19.7,
    });
  });

  it("liest String und bereits geparstes Objekt", () => {
    expect(parseSqlTable(JSON.stringify(payload))?.rowCount).toBe(2);
    expect(parseSqlTable(payload)?.rowCount).toBe(2);
  });

  it("akzeptiert ein leeres Ergebnis mit Spalten", () => {
    const table = parseSqlTable({ columns: ["A"], rows: [] });
    expect(table?.rowCount).toBe(0);
  });

  it("liest ein Objekt-Array (Postgres-/JSON-MCPs)", () => {
    const table = parseSqlTable(JSON.stringify([{ id: 1, name: "a" }, { name: "b", extra: null }]));
    expect(table?.columns).toEqual(["id", "name", "extra"]);
    expect(table?.rows).toEqual([[1, "a", null], [null, "b", null]]);
    expect(table?.rowCount).toBe(2);
  });

  it("liest { rows: [{…}] }", () => {
    expect(parseSqlTable({ rows: [{ id: 1 }] })?.columns).toEqual(["id"]);
  });

  it.each([
    ["kein JSON", "ORA-00942: table or view does not exist"],
    ["kein Objekt", "[1,2,3]"],
    ["ohne columns", JSON.stringify({ rows: [[1]] })],
    ["leere columns", JSON.stringify({ columns: [], rows: [] })],
    ["columns keine Strings", JSON.stringify({ columns: [1], rows: [] })],
    ["leerem Array", "[]"],
    ["verschachtelten Objekten", JSON.stringify([{ a: { deep: 1 } }])],
    ["Array aus Skalaren", JSON.stringify([1, 2, 3])],
    ["nichts", null],
  ])("greift nicht bei %s", (_name, input) => {
    expect(parseSqlTable(input)).toBeNull();
  });
})
