import { createFileRoute } from "@tanstack/react-router";

import { AgentsPage } from "@/components/agents/agents-page";

export const Route = createFileRoute("/agents")({
  validateSearch: (search: Record<string, unknown>) => ({
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  component: AgentsRoute,
});

function AgentsRoute() {
  const { path } = Route.useSearch();
  return <AgentsPage initialPath={path} />;
}
