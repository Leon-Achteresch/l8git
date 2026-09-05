import { createFileRoute } from "@tanstack/react-router";

import { AgentsPage, type AgentsView } from "@/components/agents/agents-page";

const AGENTS_VIEWS: readonly string[] = ["overview", "chat", "profile", "capabilities", "addons"] satisfies AgentsView[];

export const Route = createFileRoute("/agents")({
  validateSearch: (search: Record<string, unknown>): { path?: string; view?: AgentsView } => ({
    path: typeof search.path === "string" ? search.path : undefined,
    view: typeof search.view === "string" && AGENTS_VIEWS.includes(search.view) ? search.view as AgentsView : undefined,
  }),
  component: AgentsRoute,
});

function AgentsRoute() {
  const { path, view } = Route.useSearch();
  return <AgentsPage initialPath={path} initialView={view} />;
}
