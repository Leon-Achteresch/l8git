import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SqlTable } from "@/lib/agents/plugins/sql-table";
import { cn } from "@/lib/utils";

const MAX_ROWS = 500;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function SqlTableView({ table }: { table: SqlTable }) {
  const rows = table.rows.slice(0, MAX_ROWS);
  const footer = [
    `${table.rowCount.toLocaleString("de-DE")} Zeilen`,
    table.truncated ? "serverseitig gekuerzt" : null,
    rows.length < table.rows.length ? `nur ${MAX_ROWS} angezeigt` : null,
    table.elapsedMs === null
      ? null
      : `${table.elapsedMs.toLocaleString("de-DE")} ms`,
  ].filter(Boolean);

  return (
    <div className="space-y-1.5">
      <Table className="text-[11px]">
        <TableHeader>
          <TableRow>
            {table.columns.map((column, index) => (
              <TableHead
                key={`${column}-${index}`}
                className="h-7 whitespace-nowrap px-2 font-mono text-[11px]"
              >
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {table.columns.map((column, columnIndex) => (
                <TableCell
                  key={`${column}-${columnIndex}`}
                  className={cn(
                    "whitespace-nowrap px-2 py-1 font-mono text-[11px]",
                    row[columnIndex] === null && "italic text-muted-foreground",
                  )}
                >
                  {cellText(row[columnIndex])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="ag-faint text-[11px]">{footer.join(" · ")}</p>
    </div>
  );
}
