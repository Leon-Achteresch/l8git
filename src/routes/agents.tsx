import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const MonocodeApp = lazy(() =>
  import("@/monocode/MonocodeApp").then((m) => ({ default: m.MonocodeApp })),
);

export const Route = createFileRoute("/agents")({
  component: () => (
    <Suspense fallback={null}>
      <MonocodeApp />
    </Suspense>
  ),
});
