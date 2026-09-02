import { AgentChatPane } from "@/components/agents/chat/agent-chat-pane";
import {
  AGENT_UI_PATH,
  agentUiThreadId,
} from "@/components/agents/test-harness/seed-agent-ui";

export function AgentsUiRoot({ scene }: { scene: string }) {
  return (
    <div className="agents-shell ag-stage h-screen min-h-0 min-w-0 overflow-hidden">
      <AgentChatPane path={AGENT_UI_PATH} threadId={agentUiThreadId(scene)} />
    </div>
  );
}
