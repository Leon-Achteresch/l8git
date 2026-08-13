export type AgentChartType = "bar" | "line" | "area";

export interface AgentChartPoint {
  x: string | number;
  y: number;
}

export interface AgentChartSeries {
  label: string;
  data: AgentChartPoint[];
}

export interface AgentChartSpec {
  type: AgentChartType;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  stacked: boolean;
  series: AgentChartSeries[];
}

const CHART_TYPES: AgentChartType[] = ["bar", "line", "area"];
const MAX_SERIES = 8;
const MAX_POINTS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePoint(value: unknown): AgentChartPoint | null {
  if (!isRecord(value)) return null;
  const x = value.x;
  const rawY = value.y;
  const y = typeof rawY === "string" ? Number(rawY) : rawY;
  if (typeof x !== "string" && typeof x !== "number") return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  if (typeof x === "number" && !Number.isFinite(x)) return null;
  return { x, y };
}

function normalizeSeries(value: unknown, fallbackLabel: string): AgentChartSeries | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  if (value.data.length === 0 || value.data.length > MAX_POINTS) return null;
  const data: AgentChartPoint[] = [];
  for (const candidate of value.data) {
    const point = normalizePoint(candidate);
    if (!point) return null;
    data.push(point);
  }
  const label = typeof value.label === "string" && value.label.trim()
    ? value.label.trim()
    : fallbackLabel;
  return { label, data };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseChartSpec(source: string): AgentChartSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string" || !CHART_TYPES.includes(type as AgentChartType)) return null;

  const rawSeries = Array.isArray(raw.series)
    ? raw.series
    : Array.isArray(raw.data)
      ? [{ label: optionalText(raw.title) ?? "Series 1", data: raw.data }]
      : null;
  if (!rawSeries || rawSeries.length === 0 || rawSeries.length > MAX_SERIES) return null;

  const series: AgentChartSeries[] = [];
  for (const [index, candidate] of rawSeries.entries()) {
    const normalized = normalizeSeries(candidate, `Series ${index + 1}`);
    if (!normalized) return null;
    series.push(normalized);
  }

  return {
    type: type as AgentChartType,
    title: optionalText(raw.title),
    xLabel: optionalText(raw.xLabel),
    yLabel: optionalText(raw.yLabel),
    stacked: raw.stacked === true,
    series,
  };
}

export function looksLikeChartJson(source: string): boolean {
  return source.trimStart().startsWith("{");
}

export const CHART_FORMAT_DOC = `To render an interactive chart in this UI, output a fenced code block with the language \`chart\` containing a single JSON object:

\`\`\`chart
{
  "type": "bar",
  "title": "Revenue by month",
  "xLabel": "Month",
  "yLabel": "EUR",
  "stacked": false,
  "series": [
    { "label": "Product A", "data": [ { "x": "Jan", "y": 120 }, { "x": "Feb", "y": 180 } ] },
    { "label": "Product B", "data": [ { "x": "Jan", "y": 90 }, { "x": "Feb", "y": 140 } ] }
  ]
}
\`\`\`

Rules:
- "type" is one of "bar", "line", "area".
- Every data point is an object with "x" (string or number) and "y" (finite number).
- All series should share the same x values in the same order.
- Use at most 8 series; prefer 3 or fewer. Fold smaller categories into "Other".
- "stacked": true stacks bar series. "title", "xLabel", "yLabel" and "stacked" are optional.
- For a single series you may use a top-level "data" array instead of "series".
- Never put comments or trailing commas inside the JSON.
- Add a short one-sentence takeaway in normal prose after the chart block.`;

export function chartPrompt(request: string): string {
  return `${request.trim()}\n\n${CHART_FORMAT_DOC}`;
}

export const CHART_TOOL_NAME = "mcp__l8git__render_chart";

// ponytail: eine In-App-SDK-MCP-Server-Definition; weitere Tools kommen einfach in dieses Array.
export const CHART_TOOL = {
  name: "render_chart",
  description:
    "Rendert ein interaktives Diagramm direkt in der l8git-Chat-UI. Nutze das immer, wenn Zahlenreihen anschaulicher als Tabelle oder Prosa sind (Trends, Vergleiche, Verteilungen). Nach dem Tool-Call folgt ein Satz Interpretation.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["type", "series"],
    properties: {
      type: { type: "string", enum: CHART_TYPES, description: "Diagrammtyp." },
      title: { type: "string", description: "Titel über dem Diagramm." },
      xLabel: { type: "string" },
      yLabel: { type: "string" },
      stacked: { type: "boolean", description: "Stapelt Bar-Serien." },
      series: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SERIES,
        description: "Max. 8 Serien, alle mit denselben x-Werten in derselben Reihenfolge.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "data"],
          properties: {
            label: { type: "string" },
            data: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y"],
                properties: {
                  x: { type: ["string", "number"] },
                  y: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
