import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  SkipForward,
  Square,
  XCircle,
} from "lucide-react";
import { memo, useEffect, useMemo } from "react";
import {
  WorkflowJob,
  ciStatusKey,
  formatDuration,
  groupJobsByStage,
} from "./ci-types";

// ── Status icon (small, for use inside nodes) ──────────────────────────────

function NodeStatusIcon({
  status,
  conclusion,
  size = 14,
}: {
  status: string;
  conclusion: string | null;
  size?: number;
}) {
  const key = ciStatusKey(status, conclusion);
  const cls = `shrink-0`;
  const s = { width: size, height: size };

  if (["success", "successful", "passed"].includes(key))
    return <CheckCircle2 className={cls} style={s} color="var(--git-added)" />;
  if (
    ["failure", "failed", "timed_out", "error", "action_required"].includes(key)
  )
    return <XCircle className={cls} style={s} color="var(--git-removed)" />;
  if (["cancelled"].includes(key))
    return (
      <Square className={cls} style={s} color="hsl(var(--muted-foreground))" />
    );
  if (["skipped", "neutral", "stale"].includes(key))
    return (
      <SkipForward
        className={cls}
        style={s}
        color="hsl(var(--muted-foreground))"
      />
    );
  if (
    ["in_progress", "queued", "pending", "inprogress", "waiting"].includes(key)
  )
    return (
      <Loader2
        className={`${cls} animate-spin`}
        style={s}
        color="hsl(var(--primary))"
      />
    );
  return (
    <CircleDashed
      className={cls}
      style={s}
      color="hsl(var(--muted-foreground))"
    />
  );
}

// ── Status colours for node border/background ──────────────────────────────

function statusNodeStyle(
  status: string,
  conclusion: string | null,
): { borderColor: string; background: string } {
  const key = ciStatusKey(status, conclusion);

  if (["success", "successful", "passed"].includes(key))
    return {
      borderColor: "rgba(34,197,94,0.5)",
      background:
        "linear-gradient(135deg,rgba(34,197,94,0.06) 0%,rgba(34,197,94,0.02) 100%)",
    };
  if (
    ["failure", "failed", "timed_out", "error", "action_required"].includes(key)
  )
    return {
      borderColor: "rgba(239,68,68,0.5)",
      background:
        "linear-gradient(135deg,rgba(239,68,68,0.07) 0%,rgba(239,68,68,0.02) 100%)",
    };
  if (["in_progress", "queued", "pending", "inprogress", "waiting"].includes(key))
    return {
      borderColor: "hsl(var(--primary)/0.5)",
      background:
        "linear-gradient(135deg,hsl(var(--primary)/0.07) 0%,hsl(var(--primary)/0.02) 100%)",
    };
  if (["cancelled"].includes(key))
    return {
      borderColor: "hsl(var(--border)/0.5)",
      background: "hsl(var(--muted)/0.3)",
    };
  return {
    borderColor: "hsl(var(--border)/0.4)",
    background: "hsl(var(--card)/0.8)",
  };
}

// ── Job node ───────────────────────────────────────────────────────────────

type JobNodeData = { job: WorkflowJob };

const JobNode = memo(({ data }: NodeProps) => {
  const { job } = data as JobNodeData;
  const dur = formatDuration(job.started_at, job.completed_at);
  const { borderColor, background } = statusNodeStyle(job.status, job.conclusion);

  const MAX_STEPS = 8;
  const visibleSteps = job.steps.slice(0, MAX_STEPS);
  const hiddenCount = job.steps.length - visibleSteps.length;

  return (
    <div
      style={{
        background,
        borderColor,
        borderWidth: 2,
        borderStyle: "solid",
        borderRadius: 12,
        minWidth: 220,
        maxWidth: 260,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "hsl(var(--border))",
          width: 10,
          height: 10,
          borderWidth: 2,
          borderColor: "hsl(var(--background))",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom:
            job.steps.length > 0 ? "1px solid hsl(var(--border)/0.2)" : "none",
        }}
      >
        <NodeStatusIcon status={job.status} conclusion={job.conclusion} size={16} />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "hsl(var(--foreground))",
          }}
        >
          {job.name}
        </span>
        {dur && (
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              color: "hsl(var(--muted-foreground))",
              flexShrink: 0,
            }}
          >
            {dur}
          </span>
        )}
      </div>

      {/* Steps */}
      {visibleSteps.length > 0 && (
        <div style={{ padding: "6px 12px 8px" }}>
          {visibleSteps.map((step) => (
            <div
              key={step.number}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 0",
              }}
            >
              <NodeStatusIcon
                status={step.status}
                conclusion={step.conclusion}
                size={12}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {step.number}. {step.name}
              </span>
              {step.started_at && step.completed_at && (
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 10,
                    color: "hsl(var(--muted-foreground)/0.6)",
                    flexShrink: 0,
                  }}
                >
                  {formatDuration(step.started_at, step.completed_at)}
                </span>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground)/0.6)",
                paddingTop: 2,
              }}
            >
              +{hiddenCount} more steps
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "hsl(var(--border))",
          width: 10,
          height: 10,
          borderWidth: 2,
          borderColor: "hsl(var(--background))",
        }}
      />
    </div>
  );
});

JobNode.displayName = "JobNode";

const nodeTypes = { jobNode: JobNode };

// ── Layout computation ─────────────────────────────────────────────────────

const NODE_WIDTH = 260;
const NODE_BASE_H = 60; // header
const STEP_H = 20;
const STAGE_GAP_X = 340;
const JOB_GAP_Y = 24;

function estimateNodeHeight(job: WorkflowJob): number {
  const steps = Math.min(job.steps.length, 8);
  return NODE_BASE_H + (steps > 0 ? steps * STEP_H + 16 : 0);
}

function computeLayout(jobs: WorkflowJob[]): {
  nodes: Node[];
  edges: Edge[];
} {
  if (jobs.length === 0) return { nodes: [], edges: [] };

  const stages = groupJobsByStage(jobs);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  stages.forEach((stage, si) => {
    const x = si * STAGE_GAP_X;

    // Compute total column height for vertical centering
    const heights = stage.map(estimateNodeHeight);
    const totalH =
      heights.reduce((s, h) => s + h, 0) + (stage.length - 1) * JOB_GAP_Y;
    let y = -totalH / 2;

    stage.forEach((job, ji) => {
      nodes.push({
        id: `job-${job.id}`,
        type: "jobNode",
        position: { x, y },
        data: { job },
        style: { width: NODE_WIDTH },
      });

      // Edges from every job in the previous stage → this job
      if (si > 0) {
        stages[si - 1].forEach((prevJob) => {
          const key = ciStatusKey(job.status, job.conclusion);
          const animated = ["in_progress", "queued", "pending"].includes(
            job.status.toLowerCase(),
          );
          edges.push({
            id: `e-${prevJob.id}-${job.id}`,
            source: `job-${prevJob.id}`,
            target: `job-${job.id}`,
            type: "smoothstep",
            animated,
            style: {
              stroke:
                key === "failure" || key === "failed"
                  ? "rgba(239,68,68,0.4)"
                  : key === "success"
                    ? "rgba(34,197,94,0.4)"
                    : "hsl(var(--border))",
              strokeWidth: 2,
            },
          });
        });
      }

      y += heights[ji] + JOB_GAP_Y;
    });
  });

  return { nodes, edges };
}

// ── Public component ───────────────────────────────────────────────────────

export function CiWorkflowGraph({ jobs }: { jobs: WorkflowJob[] }) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeLayout(jobs),
    [jobs],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync when jobs change (e.g. refresh)
  useEffect(() => {
    const { nodes: n, edges: e } = computeLayout(jobs);
    setNodes(n);
    setEdges(e);
  }, [jobs, setNodes, setEdges]);

  if (jobs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground/60">
        No jobs found
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.2}
        maxZoom={2}
        attributionPosition="bottom-right"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="hsl(var(--border)/0.5)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            const job = (n.data as JobNodeData).job;
            const key = ciStatusKey(job.status, job.conclusion);
            if (["success", "successful", "passed"].includes(key))
              return "rgba(34,197,94,0.6)";
            if (["failure", "failed", "timed_out", "error"].includes(key))
              return "rgba(239,68,68,0.6)";
            if (["in_progress", "queued", "pending"].includes(key))
              return "hsl(var(--primary)/0.6)";
            return "hsl(var(--muted-foreground)/0.3)";
          }}
          maskColor="hsl(var(--background)/0.7)"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
          }}
        />
      </ReactFlow>
    </div>
  );
}
