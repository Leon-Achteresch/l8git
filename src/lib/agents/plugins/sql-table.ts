import { isRecord, resultText } from "@/lib/agents/plugins/content";

export interface SqlTable {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number | null;
}

// ponytail: Deckel gegen Response-Objekte, die zufaellig wie ein Rowset aussehen.
const MAX_COLUMNS = 40;

function payload(value: unknown): unknown {
  if (isRecord(value) || Array.isArray(value)) {
    const text = resultText(value);
    if (text === null) return value;
    return parseJson(text) ?? value;
  }
  const text = resultText(value);
  return text === null ? value : parseJson(text);
}

function parseJson(text: string): unknown {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isCell(value: unknown): boolean {
  return value === null || ["string", "number", "boolean", "undefined"].includes(typeof value);
}

/** Objekt-Zeilen [{ a: 1, b: 2 }, …] -> Spalten in Reihenfolge des ersten Auftretens. */
function fromRecords(list: unknown[]): Pick<SqlTable, "columns" | "rows"> | null {
  if (list.length === 0 || !list.every(isRecord)) return null;
  const columns: string[] = [];
  for (const record of list as Record<string, unknown>[]) {
    for (const key of Object.keys(record)) {
      if (!isCell(record[key])) return null;
      if (!columns.includes(key)) columns.push(key);
    }
  }
  if (columns.length === 0 || columns.length > MAX_COLUMNS) return null;
  return {
    columns,
    rows: (list as Record<string, unknown>[]).map((record) => columns.map((column) => record[column] ?? null)),
  };
}

/** Spalten/Zeilen-Form { columns: string[], rows: unknown[][] } (oracle-readonly execute_query). */
function fromColumns(raw: Record<string, unknown>): Pick<SqlTable, "columns" | "rows"> | null {
  const { columns, rows } = raw;
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > MAX_COLUMNS) return null;
  if (!columns.every((column) => typeof column === "string")) return null;
  if (!Array.isArray(rows) || !rows.every((row) => Array.isArray(row))) return null;
  return { columns: columns as string[], rows: rows as unknown[][] };
}

/**
 * Erkennt ein Query-Ergebnis und normalisiert es auf Spalten + Zeilen.
 * Akzeptiert { columns, rows }, ein blankes Objekt-Array und { rows: [{…}] }.
 * Nicht-SELECT-Statements liefern nichts davon und fallen hier raus.
 */
export function parseSqlTable(result: unknown): SqlTable | null {
  const raw = payload(result);
  const table = Array.isArray(raw)
    ? fromRecords(raw)
    : isRecord(raw)
      ? fromColumns(raw) ?? (Array.isArray(raw.rows) ? fromRecords(raw.rows) : null)
      : null;
  if (!table) return null;
  const meta = isRecord(raw) ? raw : {};
  return {
    ...table,
    rowCount: typeof meta.row_count === "number" ? meta.row_count : table.rows.length,
    truncated: meta.truncated === true,
    elapsedMs: typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : null,
  };
}
