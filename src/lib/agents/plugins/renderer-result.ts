import { baseToolName, resultText } from "@/lib/agents/plugins/content";
import { type AgentBarcodeSpec, isBarcodeToolName, parseBarcodeSpec } from "@/lib/agents/barcode-spec";
import { type AgentChartSpec, isChartToolName, parseChartSpec } from "@/lib/agents/chart-spec";

const CHART_ERROR = "Ungültige Diagrammdaten – Diagramm konnte nicht dargestellt werden.";
const BARCODE_ERROR = "Ungültige Barcode-Daten – Barcode konnte nicht dargestellt werden.";
const BROWSER_ERROR = "Browser-Tool lieferte kein auswertbares Ergebnis.";

export type RendererResult =
  | { kind: "chart"; spec: AgentChartSpec }
  | { kind: "barcode"; spec: AgentBarcodeSpec }
  | { kind: "browser"; text: string }
  | { kind: "chart" | "barcode" | "browser"; error: string };

function isBrowserToolName(tool: unknown): boolean {
  return baseToolName(tool).startsWith("browser_");
}

export function rendererResult(result: unknown, tool: unknown, args: unknown): RendererResult | null {
  if (isChartToolName(tool)) {
    const spec = parseChartSpec(JSON.stringify(args ?? {}));
    return spec ? { kind: "chart", spec } : { kind: "chart", error: CHART_ERROR };
  }
  if (isBarcodeToolName(tool)) {
    const spec = parseBarcodeSpec(JSON.stringify(args ?? {}));
    return spec ? { kind: "barcode", spec } : { kind: "barcode", error: BARCODE_ERROR };
  }
  if (isBrowserToolName(tool)) {
    const text = resultText(result)?.trim();
    return text ? { kind: "browser", text } : { kind: "browser", error: BROWSER_ERROR };
  }
  return null;
}
