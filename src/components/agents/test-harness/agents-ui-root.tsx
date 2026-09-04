import { useState } from "react";

import { AgentCapabilityCenter } from "@/components/agents/capabilities/agent-capability-center";
import { AgentChatPane } from "@/components/agents/chat/agent-chat-pane";
import { AgentChatSidebar } from "@/components/agents/chat/agent-chat-sidebar";
import {
  AgentProfileShell,
  type ProfileSection,
} from "@/components/agents/profile/AgentProfileShell";
import { AgentProfileView } from "@/components/agents/profile/AgentProfileView";
import {
  AGENT_UI_PATH,
  agentUiThreadId,
} from "@/components/agents/test-harness/seed-agent-ui";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import {
  useAgentOverviewCounts,
  useAgentOverviewEntries,
} from "@/lib/agents/use-agent-overview";

function ProfileScene() {
  const provider = useAgentProviderStore((state) => state.provider);
  const entries = useAgentOverviewEntries();
  const counts = useAgentOverviewCounts(entries);
  const [section, setSection] = useState<ProfileSection>("profile");
  return (
    <div className="agents-shell h-screen min-h-0 min-w-0 overflow-hidden">
      <AgentProfileShell
        path={AGENT_UI_PATH}
        provider={provider}
        section={section}
        onSectionChange={setSection}
        runningCount={counts.running}
      >
        <AgentProfileView
          path={AGENT_UI_PATH}
          provider={provider}
          entries={entries}
          onOpenThread={() => undefined}
          onSeeAllThreads={() => undefined}
          onOpenChat={() => undefined}
        />
      </AgentProfileShell>
    </div>
  );
}

export function AgentsUiRoot({ scene }: { scene: string }) {
  if (scene === "profile") {
    return <ProfileScene />;
  }

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
