import { AgentCapabilityCenter } from "@/components/agents/capabilities/agent-capability-center";
import { AgentChatPane } from "@/components/agents/chat/agent-chat-pane";
import { AgentChatSidebar } from "@/components/agents/chat/agent-chat-sidebar";
import {
  AGENT_UI_PATH,
  agentUiThreadId,
} from "@/components/agents/test-harness/seed-agent-ui";

export function AgentsUiRoot({ scene }: { scene: string }) {
  if (scene === "capabilities") {
    return (
      <div className="isolate bg-[radial-gradient(820px_360px_at_92%_-8%,color-mix(in_oklab,var(--git-branch)_8%,transparent),transparent_66%),var(--ag-stage-bg)] h-screen min-h-0 min-w-0 overflow-hidden text-[var(--ag-text)]">
        <AgentCapabilityCenter path={AGENT_UI_PATH} onBack={() => undefined} />
      </div>
    );
  }

  const pane = (
    <AgentChatPane path={AGENT_UI_PATH} threadId={agentUiThreadId(scene)} />
  );

  if (scene !== "sidebar") {
    return (
      <div className="isolate bg-[radial-gradient(820px_360px_at_92%_-8%,color-mix(in_oklab,var(--git-branch)_8%,transparent),transparent_66%),var(--ag-stage-bg)] h-screen min-h-0 min-w-0 overflow-hidden text-[var(--ag-text)]">
        {pane}
      </div>
    );
  }

  return (
    <div className="isolate flex h-screen min-h-0 min-w-0 overflow-hidden bg-[var(--ag-canvas)] text-[var(--ag-text)]" style={{ display: "flex" }}>
      <div className="bg-[var(--ag-rail-bg)] shadow-[inset_-1px_0_0_var(--ag-line)] h-full shrink-0 overflow-hidden border-r border-[var(--ag-line)]" style={{ width: 280, minWidth: 280 }}>
        <AgentChatSidebar selectedPath={AGENT_UI_PATH} />
      </div>
      <div className="bg-[radial-gradient(820px_360px_at_92%_-8%,color-mix(in_oklab,var(--git-branch)_8%,transparent),transparent_66%),var(--ag-stage-bg)] min-h-0 min-w-0 flex-1 overflow-hidden">{pane}</div>
    </div>
  );
}
