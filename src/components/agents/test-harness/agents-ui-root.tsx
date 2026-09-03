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
      <div className="agents-shell ag-stage h-screen min-h-0 min-w-0 overflow-hidden">
        <AgentCapabilityCenter path={AGENT_UI_PATH} onBack={() => undefined} />
      </div>
    );
  }

  const pane = (
    <AgentChatPane path={AGENT_UI_PATH} threadId={agentUiThreadId(scene)} />
  );

  if (scene !== "sidebar") {
    return (
      <div className="agents-shell ag-stage h-screen min-h-0 min-w-0 overflow-hidden">
        {pane}
      </div>
    );
  }

  return (
    <div className="agents-shell flex h-screen min-h-0 min-w-0 overflow-hidden" style={{ display: "flex" }}>
      <div className="ag-rail h-full shrink-0 overflow-hidden border-r border-[var(--ag-line)]" style={{ width: 280, minWidth: 280 }}>
        <AgentChatSidebar selectedPath={AGENT_UI_PATH} />
      </div>
      <div className="ag-stage min-h-0 min-w-0 flex-1 overflow-hidden">{pane}</div>
    </div>
  );
}
