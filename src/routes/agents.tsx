import { createFileRoute } from "@tanstack/react-router";

// The page lives outside the route file so the router can load it lazily, like the other routes.
import { AgentsPage } from "@/components/agents/agents-page";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});
