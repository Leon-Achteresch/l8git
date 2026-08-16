import { createFileRoute } from "@tanstack/react-router";

import { AgentsPage } from "@/components/agents/agents-page";

export const Route = createFileRoute("/agents")({
  validateSearch: (search: Record<string, unknown>): { path?: string; view?: "overview" } => ({
    path: typeof search.path === "string" ? search.path : undefined,
    view: search.view === "overview" ? "overview" : undefined,
  }),
  component: AgentsRoute,
});

function AgentsRoute() {
  const { path, view } = Route.useSearch();
  return <AgentsPage initialPath={path} initialView={view} />;
}
