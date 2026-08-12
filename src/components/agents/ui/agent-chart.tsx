import {
  areaY,
  barY,
  colorLegend,
  defineChart,
  group,
  lineY,
  stack,
  type StaticChartDefinition,
} from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleBand } from "@tanstack/charts-scales/band";
import { scaleLinear } from "@tanstack/charts-scales/linear";
import { scalePoint } from "@tanstack/charts-scales/point";
import { Chart } from "@tanstack/react-charts";
import { LoaderCircle } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  looksLikeChartJson,
  parseChartSpec,
  type AgentChartSpec,
} from "@/lib/agents/chart-spec";

const SERIES_COLORS = [
  "var(--ag-chart-1)",
  "var(--ag-chart-2)",
  "var(--ag-chart-3)",
  "var(--ag-chart-4)",
  "var(--ag-chart-5)",
  "var(--ag-chart-6)",
  "var(--ag-chart-7)",
  "var(--ag-chart-8)",
];

const CHART_THEME = {
  foreground: "var(--ag-text-2)",
  muted: "var(--ag-text-3)",
  grid: "var(--ag-line)",
  background: "var(--ag-surface)",
  palette: SERIES_COLORS,
};

interface ChartRow {
  series: string;
  x: string | number;
  y: number;
  key: string;
}

function chartRows(spec: AgentChartSpec): ChartRow[] {
  return spec.series.flatMap((series, seriesIndex) =>
    series.data.map((point, pointIndex) => ({
      series: series.label,
      x: point.x,
      y: point.y,
      key: `${seriesIndex}:${pointIndex}`,
    })),
  );
}

export function chartDefinition(spec: AgentChartSpec): StaticChartDefinition<ChartRow> {
  const rows = chartRows(spec);
  const numericX = rows.every((row) => typeof row.x === "number");
  const multiSeries = spec.series.length > 1;
  const yAxis = {
    scale: scaleLinear,
    nice: true,
    grid: true,
    axis: spec.yLabel ? { label: spec.yLabel } : undefined,
  };
  const xPresentation = spec.xLabel ? { axis: { label: spec.xLabel } } : {};
  const color = {
    range: SERIES_COLORS.slice(0, spec.series.length),
    legend: multiSeries ? colorLegend() : undefined,
  };

  if (spec.type === "bar") {
    return defineChart({
      marks: [
        barY(rows, {
          x: (row) => row.x,
          y: (row) => row.y,
          color: (row) => row.series,
          key: (row) => row.key,
          layout: spec.stacked && multiSeries ? stack() : group(),
          radius: 3,
          inset: 1,
        }),
      ],
      x: { scale: () => scaleBand<string | number>().padding(0.2), ...xPresentation },
      y: yAxis,
      color,
      theme: CHART_THEME,
      animate: false,
      tooltip,
    });
  }

  const pointAxis = {
    scale: numericX ? scaleLinear : () => scalePoint<string | number>().padding(0.3),
    ...xPresentation,
  };

  if (spec.type === "area") {
    return defineChart({
      marks: [
        areaY(rows, {
          x: (row) => row.x,
          y: (row) => row.y,
          z: (row) => row.series,
          color: (row) => row.series,
          key: (row) => row.key,
          fillOpacity: multiSeries ? 0.35 : 0.5,
          strokeWidth: 2,
          layout: spec.stacked && multiSeries ? stack() : undefined,
        }),
      ],
      x: pointAxis,
      y: yAxis,
      color,
      theme: CHART_THEME,
      animate: false,
      tooltip,
    });
  }

  return defineChart({
    marks: [
      lineY(rows, {
        x: (row) => row.x,
        y: (row) => row.y,
        z: (row) => row.series,
        color: (row) => row.series,
        key: (row) => row.key,
        strokeWidth: 2,
        points: rows.length <= 60,
      }),
    ],
    x: pointAxis,
    y: yAxis,
    color,
    theme: CHART_THEME,
    animate: false,
    tooltip,
  });
}

export const AgentChart = memo(function AgentChart({ spec }: { spec: AgentChartSpec }) {
  const definition = useMemo(() => chartDefinition(spec), [spec]);
  const label = spec.title ?? `${spec.type} chart`;
  return (
    <figure className="my-3 rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface)] p-3">
      {spec.title ? (
        <figcaption className="mb-2 text-[12px] font-semibold text-[var(--ag-text)]">
          {spec.title}
        </figcaption>
      ) : null}
      <div className="ag-chart text-[11px] text-[var(--ag-text-2)]">
        <Chart definition={definition} height={240} ariaLabel={label} />
      </div>
    </figure>
  );
});

export const MarkdownChart = memo(function MarkdownChart({ source }: { source: string }) {
  const { t } = useTranslation();
  const spec = useMemo(() => parseChartSpec(source), [source]);
  if (spec) return <AgentChart spec={spec} />;
  if (looksLikeChartJson(source)) {
    return (
      <div className="ag-inset my-3 flex h-24 items-center justify-center gap-2 rounded-[12px] border border-[var(--ag-line)] text-[12px] text-[var(--ag-text-3)]">
        <LoaderCircle className="size-3.5 animate-spin" />
        {t("agentChat.chartLoading")}
      </div>
    );
  }
  return (
    <pre className="my-3 overflow-x-auto rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface-3)] p-3">
      <code>{source}</code>
    </pre>
  );
});
