import { createChartScene } from "@tanstack/charts";
import { describe, expect, it } from "vitest";

import { chartDefinition } from "@/components/agents/ui/agent-chart";
import { parseChartSpec, type AgentChartSpec } from "@/lib/agents/chart-spec";

function spec(overrides: Partial<AgentChartSpec>): AgentChartSpec {
  return {
    type: "bar",
    stacked: false,
    series: [
      { label: "A", data: [{ x: "Jan", y: 1 }, { x: "Feb", y: 3 }] },
      { label: "B", data: [{ x: "Jan", y: 2 }, { x: "Feb", y: 4 }] },
    ],
    ...overrides,
  };
}

describe("chartDefinition", () => {
  it.each(["bar", "line", "area"] as const)("builds a renderable %s scene", (type) => {
    const definition = chartDefinition(spec({ type, stacked: type !== "line" }));
    const scene = createChartScene(definition, { width: 640, height: 240 });
    expect(scene.chart.width).toBeGreaterThan(0);
    expect(scene.chart.height).toBeGreaterThan(0);
  });

  it("builds a numeric-x line scene from a parsed spec", () => {
    const parsed = parseChartSpec(JSON.stringify({
      type: "line",
      title: "CPU",
      data: [{ x: 0, y: 10 }, { x: 1, y: 30 }, { x: 2, y: 20 }],
    }));
    expect(parsed).not.toBeNull();
    const scene = createChartScene(chartDefinition(parsed!), { width: 400, height: 200 });
    expect(scene.chart.width).toBeGreaterThan(0);
  });
});
