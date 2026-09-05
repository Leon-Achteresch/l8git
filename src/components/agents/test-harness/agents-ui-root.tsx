import { useState } from "react";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { AgentsPage, type AgentsView } from "@/components/agents/agents-page";

import { AgentCapabilityCenter } from "@/components/agents/capabilities/agent-capability-center";
import { AgentChatPane } from "@/components/agents/chat/agent-chat-pane";
import { AgentChatSidebar } from "@/components/agents/chat/agent-chat-sidebar";
import { AgentsOverview } from "@/components/agents/overview/agents-overview";
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

function WorkspaceScene() {
  const [router] = useState(() => {
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/agents",
      validateSearch: (search: Record<string, unknown>): { path?: string; view?: AgentsView } => ({
        path: typeof search.path === "string" ? search.path : undefined,
        view: search.view as AgentsView | undefined,
      }),
      component: () => {
        const { path, view } = route.useSearch();
        return <AgentsPage initialPath={path} initialView={view} />;
      },
    });
    return createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/agents"] }),
    });
  });
  return <div className="h-dvh min-h-0 min-w-0 overflow-hidden"><RouterProvider router={router} /></div>;
}

export function AgentsUiRoot({ scene }: { scene: string }) {
  if (scene === "workspace") return <WorkspaceScene />;

  if (scene.startsWith("fleet")) {
    return (
      <div className="h-screen min-h-0 min-w-0 overflow-hidden bg-[var(--ag-canvas)]">
        <AgentsOverview
          onOpenThread={() => undefined}
          onRefresh={async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 300));
            if (scene === "fleet-error") throw new Error("Codex: session refresh failed");
          }}
          onNewSession={async () => { await new Promise((resolve) => window.setTimeout(resolve, 300)); }}
        />
      </div>
    );
  }

  if (scene === "profile") {
    return <ProfileScene />;
  }

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
