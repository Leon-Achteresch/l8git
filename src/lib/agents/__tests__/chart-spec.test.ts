import { describe, expect, it } from "vitest";

import {
  chartPrompt,
  looksLikeChartJson,
  parseChartSpec,
} from "@/lib/agents/chart-spec";

describe("parseChartSpec", () => {
  it("parses a full multi-series spec", () => {
    const spec = parseChartSpec(JSON.stringify({
      type: "bar",
      title: "Revenue",
      xLabel: "Month",
      yLabel: "EUR",
      stacked: true,
      series: [
        { label: "A", data: [{ x: "Jan", y: 1 }, { x: "Feb", y: 2 }] },
        { label: "B", data: [{ x: "Jan", y: 3 }, { x: "Feb", y: 4 }] },
      ],
    }));
    expect(spec).not.toBeNull();
    expect(spec?.type).toBe("bar");
    expect(spec?.stacked).toBe(true);
    expect(spec?.series).toHaveLength(2);
    expect(spec?.series[1].data[1]).toEqual({ x: "Feb", y: 4 });
  });

  it("accepts the single-series shorthand with a top-level data array", () => {
    const spec = parseChartSpec(JSON.stringify({
      type: "line",
      title: "CPU",
      data: [{ x: 0, y: 10 }, { x: 1, y: 20 }],
    }));
    expect(spec?.series).toHaveLength(1);
    expect(spec?.series[0].label).toBe("CPU");
    expect(spec?.stacked).toBe(false);
  });

  it("labels unnamed series and coerces numeric strings for y", () => {
    const spec = parseChartSpec(JSON.stringify({
      type: "area",
      series: [{ data: [{ x: "a", y: "12.5" }] }],
    }));
    expect(spec?.series[0].label).toBe("Series 1");
    expect(spec?.series[0].data[0].y).toBe(12.5);
  });

  it("rejects invalid input", () => {
    expect(parseChartSpec("not json")).toBeNull();
    expect(parseChartSpec("[]")).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "pie", data: [{ x: 1, y: 1 }] }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "bar" }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "bar", series: [] }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "bar", data: [] }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "bar", data: [{ x: {}, y: 1 }] }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "bar", data: [{ x: "a", y: "abc" }] }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ type: "bar", data: [{ x: "a", y: Infinity }] }))).toBeNull();
  });

  it("rejects more than 8 series", () => {
    const series = Array.from({ length: 9 }, (_, index) => ({
      label: `S${index}`,
      data: [{ x: "a", y: index }],
    }));
    expect(parseChartSpec(JSON.stringify({ type: "bar", series }))).toBeNull();
  });
});

describe("looksLikeChartJson", () => {
  it("detects leading JSON objects", () => {
    expect(looksLikeChartJson('  {"type": "bar"')).toBe(true);
    expect(looksLikeChartJson("some prose")).toBe(false);
  });
});

describe("chartPrompt", () => {
  it("combines the request with the format documentation", () => {
    const prompt = chartPrompt("  Commits pro Woche  ");
    expect(prompt.startsWith("Commits pro Woche")).toBe(true);
    expect(prompt).toContain("```chart");
    expect(prompt).toContain('"type" is one of "bar", "line", "area"');
  });
});
