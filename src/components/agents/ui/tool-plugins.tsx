import { type ReactNode, useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AgentMarkdown } from "@/components/agents/ui/agent-markdown";
import { parseImageResult, type ImageResult } from "@/lib/agents/plugins/image-blocks";
import { markdownResult } from "@/lib/agents/plugins/markdown-result";
import { parseSqlTable, type SqlTable } from "@/lib/agents/plugins/sql-table";
import type { AgentItem } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

/**
 * Ein Plugin rendert das Ergebnis eines Tool-/MCP-Calls anschaulich.
 * `render` gibt null zurueck, wenn das Plugin fuer diesen Call nicht greift.
 */
export interface ToolPlugin {
  id: string;
  label: string;
  render: (output: unknown, item: AgentItem) => ReactNode | null;
}

export const TOOL_PLUGINS: ToolPlugin[] = [
  {
    id: "image",
    label: "Vorschau",
    render: (output) => {
      const result = parseImageResult(output);
      return result ? <ImageResultView result={result} /> : null;
    },
  },
  {
    id: "sql-table",
    label: "Tabelle",
    render: (output) => {
      const table = parseSqlTable(output);
      return table ? <SqlTableView table={table} /> : null;
    },
  },
  {
    id: "markdown",
    label: "Markdown",
    render: (output, item) => {
      const text = markdownResult(output, item.tool, item.arguments);
      return text ? <AgentMarkdown>{text}</AgentMarkdown> : null;
    },
  },
];

export interface ResolvedToolPlugin {
  plugin: ToolPlugin;
  node: ReactNode;
}

export function resolveToolPlugin(output: unknown, item: AgentItem): ResolvedToolPlugin | null {
  for (const plugin of TOOL_PLUGINS) {
    const node = plugin.render(output, item);
    if (node) return { plugin, node };
  }
  return null;
}

export function useToolPlugin(output: unknown, item: AgentItem): ResolvedToolPlugin | null {
  return useMemo(() => resolveToolPlugin(output, item), [output, item]);
}

/** Plugin-Ansicht mit Umschalter auf den Rohtext. */
export function ToolPluginView({
  resolved,
  raw,
}: {
  resolved: ResolvedToolPlugin;
  raw: ReactNode;
}) {
  const [mode, setMode] = useState<"plugin" | "raw">("plugin");
  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={mode}
        onValueChange={(next) => next && setMode(next as "plugin" | "raw")}
        className="text-[11px]"
      >
        <ToggleGroupItem value="plugin">{resolved.plugin.label}</ToggleGroupItem>
        <ToggleGroupItem value="raw">Rohtext</ToggleGroupItem>
      </ToggleGroup>
      {mode === "plugin" ? resolved.node : raw}
    </div>
  );
}

// ponytail: harter Zeilen-Cap statt Virtualisierung; erst nachruesten, wenn jemand
// wirklich >500 Zeilen im Chat durchscrollt (Rohtext zeigt ohnehin alles).
const MAX_ROWS = 500;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SqlTableView({ table }: { table: SqlTable }) {
  const rows = table.rows.slice(0, MAX_ROWS);
  const footer = [
    `${table.rowCount.toLocaleString("de-DE")} Zeilen`,
    table.truncated ? "serverseitig gekuerzt" : null,
    rows.length < table.rows.length ? `nur ${MAX_ROWS} angezeigt` : null,
    table.elapsedMs === null ? null : `${table.elapsedMs.toLocaleString("de-DE")} ms`,
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

function ImageResultView({ result }: { result: ImageResult }) {
  return (
    <div className="space-y-2">
      {result.images.map((image, index) => (
        <img
          key={`${image.src.slice(0, 64)}-${index}`}
          src={image.src}
          alt={image.alt}
          className="max-h-[360px] w-auto rounded-xl border border-border/50 object-contain"
        />
      ))}
      {result.text ? (
        <p className="ag-faint whitespace-pre-wrap break-words text-[11px]">{result.text}</p>
      ) : null}
    </div>
  );
}
