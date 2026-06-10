import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: lazyRouteComponent(
    () => import("./settings-content").then((m) => ({ default: m.Settings })),
  ),
});
