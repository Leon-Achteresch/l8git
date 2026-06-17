import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
