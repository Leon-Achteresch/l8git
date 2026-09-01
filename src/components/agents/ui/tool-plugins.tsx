import { type ReactNode, useMemo, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AgentMarkdown } from "@/components/agents/ui/agent-markdown";
import { ImageResultView } from "@/components/agents/ui/image-result-view";
import { SqlTableView } from "@/components/agents/ui/sql-table-view";
import { parseImageResult } from "@/lib/agents/plugins/image-blocks";
import { markdownResult } from "@/lib/agents/plugins/markdown-result";
import { parseSqlTable } from "@/lib/agents/plugins/sql-table";
import type { AgentItem } from "@/lib/agents/types";

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

export function resolveToolPlugin(
  output: unknown,
  item: AgentItem,
): ResolvedToolPlugin | null {
  for (const plugin of TOOL_PLUGINS) {
    const node = plugin.render(output, item);
    if (node) return { plugin, node };
  }
  return null;
}

export function useToolPlugin(
  output: unknown,
  item: AgentItem,
): ResolvedToolPlugin | null {
  return useMemo(() => resolveToolPlugin(output, item), [output, item]);
}

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
