import { baseToolName, isRecord, resultText } from "@/lib/agents/plugins/content";

const MARKDOWN_TOOLS = ["webfetch", "web_fetch", "fetch"];
const READ_TOOLS = ["read", "read_file", "view"];

function readPath(args: unknown): string {
  if (!isRecord(args)) return "";
  const path = args.file_path ?? args.filePath ?? args.path;
  return typeof path === "string" ? path : "";
}

/**
 * Claude Code liefert Dateiinhalte mit Zeilennummern-Rinne ("   12→text").
 * Fuer die Markdown-Ansicht muss die weg – aber nur, wenn sie wirklich durchgaengig ist.
 */
export function stripLineGutter(text: string): string {
  const lines = text.split("\n");
  const filled = lines.filter((line) => line.trim());
  const gutter = /^\s*\d+[\t→|]/;
  const matches = filled.filter((line) => gutter.test(line)).length;
  if (filled.length === 0 || matches < filled.length * 0.6) return text;
  return lines.map((line) => line.replace(gutter, "")).join("\n");
}

/**
 * Gibt den Text zurueck, der als Markdown gerendert werden soll – oder null.
 * Bewusst am Tool-Namen festgemacht statt an einer Heuristik: sonst wird
 * jedes Shell-Skript mit "# "-Kommentaren zur Ueberschrift.
 */
export function markdownResult(result: unknown, tool: unknown, args: unknown): string | null {
  const name = baseToolName(tool);
  const isMarkdownFile = READ_TOOLS.includes(name) && /\.(md|markdown|mdx)$/i.test(readPath(args));
  if (!MARKDOWN_TOOLS.includes(name) && !isMarkdownFile) return null;
  const text = resultText(result)?.trim();
  return text ? stripLineGutter(text) : null;
}
