export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** MCP-Ergebnisse kommen als String oder als Content-Block-Liste an. */
export function resultText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const texts = value
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text : ""));
  return texts.length > 0 ? texts.join("\n") : null;
}

/** Letztes Segment eines Tool-Namens, z. B. mcp__oracle-readonly__execute_query -> execute_query. */
export function baseToolName(tool: unknown): string {
  if (typeof tool !== "string") return "";
  const parts = tool.split("__");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}
