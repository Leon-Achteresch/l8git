import { useState } from "react";
import { AgentsSidebar, type SidebarThread } from "@/components/agents/sidebar/agents-sidebar";

import { createFileRoute } from "@tanstack/react-router";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { AgentComposer } from "@/components/agents/composer";
import { AgentRunPanel, type AgentRunGroup } from "@/components/agents/run";
import { AgentContextUsage, CONTEXT_SEGMENT_COLORS } from "@/components/agents/ui/agent-context-usage";
import { AgentStepsCard, type AgentStep } from "@/components/agents/ui/agent-steps-card";
import { AgentQuestionCard } from "@/components/agents/ui/agent-question-card";
import { AgentThinking } from "@/components/agents/ui/agent-thinking";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

const DEMO_GROUP: AgentRunGroup = {
  actionCount: 14,
  durationLabel: "7s",
  runs: [
    { id: "1", name: "Forge", status: "done", summary: "Rewrote the positioning paragraph in three files." },
    { id: "2", name: "Forge", status: "running", action: { kind: "Read", target: "drafts/73972-cohere-forward-deployed-engineer.md" } },
    { id: "3", name: "Forge", status: "running", action: { kind: "Edit", target: "drafts/92751-hcompany-research-engineer.md" } },
    { id: "4", name: "Forge", status: "failed", summary: "Stopped: model is repeating itself." },
    {
      id: "5",
      name: "Forge",
      status: "running",
      action: { kind: "Read", target: "drafts/outreach/emails-batch.json" },
      detail: {
        title: "Forge running",
        description: "Repo: jobgrab (cwd is repo root). Positioning pass on job-application materials.",
        fileCount: 3,
        durationLabel: "7s",
        actions: [
          { kind: "Read", target: "drafts/outreach/smaller-companies-notes.md" },
          { kind: "Read", target: "drafts/outreach/batch-2-small-ai.md" },
          { kind: "Read", target: "drafts/outreach/emails-batch.json" },
        ],
      },
    },
  ],
};

const DEMO_THREADS: SidebarThread[] = [
  { id: "SCO-40799", title: "local onboarding", group: "P0", age: "3m", status: "done", prs: 19, pinned: true },
  { id: "SCO-41378", title: "async permissions+messages", group: "P0", age: "18m", status: "running" },
  { id: "SCO-41079", title: "codemode", group: "P0", age: "1h", status: "done", prs: 3 },
  { id: "SCO-40777", title: "local<>cloud handoff", group: "P0", age: "1d", status: "idle", prs: 7 },
  { id: "SCO-41698", title: "prod step overhead", group: "P1", age: "35m", status: "review" },
  { id: "SCO-41398", title: "device auto sync", group: "P1", age: "1h", status: "idle" },
  { id: "SCO-41680", title: "local repo skills and files", group: "P1", age: "1h", status: "done" },
  { id: "SCO-41626", title: "agent-friendly product onboarding", group: "P1", age: "5h", status: "idle" },
  { id: "SCO-40760", title: "git conflict optimizations", group: "P1", age: "1d", status: "done", prs: 3 },
  { id: "SCO-40776", title: "gh-stack", group: "P1", age: "1d", status: "failed", prs: 2 },
];

const DEMO_SEGMENTS = [
  { label: "Messages", tokens: 470_000, color: CONTEXT_SEGMENT_COLORS[0] },
  { label: "Tool results", tokens: 120_000, color: CONTEXT_SEGMENT_COLORS[1] },
  { label: "Files", tokens: 95_000, color: CONTEXT_SEGMENT_COLORS[2] },
  { label: "System prompt", tokens: 65_000, color: CONTEXT_SEGMENT_COLORS[3] },
  { label: "Memory", tokens: 45_000, color: CONTEXT_SEGMENT_COLORS[4] },
  { label: "Tools", tokens: 25_000, color: CONTEXT_SEGMENT_COLORS[5] },
];

const DEMO_LIMITS = [
  { label: "5-hour limit", resetLabel: "Resets in 2 hr 46 min", percent: 38 },
  { label: "Weekly · all models", resetLabel: "Resets Tue 3:00 PM", percent: 3 },
  { label: "Weekly · Pro", resetLabel: "Resets Tue 3:00 PM", percent: 5 },
];

const DEMO_STEPS: AgentStep[] = [
  { id: "1", label: "Read project files", status: "active" },
  { id: "2", label: "Update light mode tokens", status: "pending" },
  { id: "3", label: "Implement dark mode tokens", status: "pending" },
  { id: "4", label: "Register the theme toggle", status: "pending" },
  { id: "5", label: "Run lint and production build", status: "pending" },
];

const DEMO_QUESTION_OPTIONS = [
  { label: "Inline card", description: "Rendered in the thread, like the steps card." },
  { label: "Modal dialog", description: "Blocks the thread until answered." },
  { label: "Sidebar panel", description: "Answer next to the running agent." },
];

function AgentsPage() {
  const [selectedThread, setSelectedThread] = useState<SidebarThread | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <AgentsSidebar
        threads={DEMO_THREADS}
        selectedId={selectedThread?.id ?? null}
        onSelect={setSelectedThread}
        onNewThread={() => { setSelectedThread(null); setComposerKey(key => key + 1); }}
      />
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6">
      {selectedThread && (
        <AgentsEnter className="w-full max-w-3xl" y={8}>
          <p className="text-xs text-muted-foreground">{selectedThread.id} · Demo thread</p>
          <h1 className="mt-1 text-lg font-medium">{selectedThread.title}</h1>
        </AgentsEnter>
      )}
      <AgentsEnter delay={0.04} className="w-full max-w-3xl">
      <AgentRunPanel group={DEMO_GROUP} className="max-w-3xl" />
      </AgentsEnter>
      <AgentsEnter delay={0.08}>
      <AgentContextUsage
        used={820_000}
        total={1_000_000}
        segments={DEMO_SEGMENTS}
        planLabel="Max (5x)"
        limits={DEMO_LIMITS}
        onOpenPlan={() => {}}
      />
      </AgentsEnter>
      <AgentsEnter delay={0.12}>
      <AgentStepsCard steps={DEMO_STEPS} />
      </AgentsEnter>
      <AgentsEnter delay={0.16}>
      <AgentThinking seconds={5.1} />
      </AgentsEnter>
      <AgentsEnter delay={0.2}>
      <AgentQuestionCard
        header="Question style"
        question="How should the agent ask follow-up questions?"
        options={DEMO_QUESTION_OPTIONS}
        onSubmit={() => {}}
      />
      </AgentsEnter>
      <AgentsEnter delay={0.24} className="w-full max-w-2xl">
      <AgentComposer
        key={composerKey}
        context={{ branch: "main", project: "l8git", usedPercent: 57 }}
        onDictate={() => {}}
      />
      </AgentsEnter>
      </div>
    </div>
  );
}
